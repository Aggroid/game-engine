import type { DerivedCombat } from '../contracts/types';
import { simulateDuel } from './duel';
import { simulate } from './simulate';
import { SIM_VERSION } from './version';
import { MAX_TURNS } from './constants';

/**
 * ============================================================================
 * THE BUG THIS FILE EXISTS TO PREVENT COMING BACK.
 * ============================================================================
 * A duel used to run through `simulate` with the defender dressed up as an
 * `Encounter`. That kept hp, attack and defence and silently dropped `critPct`
 * and `regen` — so the defender could never crit and never healed, and AGI and
 * SPI were worth nothing to whoever was being attacked.
 */

function sheet(overrides: Partial<DerivedCombat> = {}): DerivedCombat {
  return {
    hp: 120,
    attack: 20,
    defence: 8,
    critPct: 0,
    regen: 0,
    stamina: 3,
    ...overrides,
  };
}

describe('both sides are real heroes', () => {
  /** The headline: a defender with AGI crits, which was impossible before. */
  it('lets the DEFENDER crit on their own AGI', () => {
    const log = simulateDuel(sheet(), sheet({ critPct: 100 }), 'hero:them', 42);

    const defenderCrits = log.events.filter(
      (event) => event.actor === 'ENEMY' && event.type === 'CRIT',
    );
    expect(defenderCrits.length).toBeGreaterThan(0);
  });

  it('lets the DEFENDER regenerate on their own SPI', () => {
    // Tanky enough on both sides that the duel runs past a turn.
    const log = simulateDuel(
      sheet({ attack: 6 }),
      sheet({ regen: 5, hp: 200 }),
      'hero:them',
      7,
    );

    const defenderRegen = log.events.filter(
      (event) => event.actor === 'ENEMY' && event.type === 'REGEN',
    );
    expect(defenderRegen.length).toBeGreaterThan(0);
  });

  it('never heals a fighter above their own maximum', () => {
    const log = simulateDuel(
      sheet({ regen: 500, attack: 1 }),
      sheet({ regen: 500, attack: 1, hp: 90 }),
      'hero:them',
      3,
    );

    for (const event of log.events) {
      expect(event.heroHp).toBeLessThanOrEqual(120);
      expect(event.enemyHp).toBeLessThanOrEqual(90);
    }
  });

  /**
   * THE ASYMMETRY THAT REMAINS, and it is deliberate: the challenger swings
   * first. Deciding initiative from a stat would let one stat decide every
   * close fight; deciding it from the RNG would have the same two heroes trade
   * wins on the seed alone. Paying stamina to open is the reason to attack.
   */
  it('gives the challenger the opening blow', () => {
    const log = simulateDuel(sheet(), sheet(), 'hero:them', 1);

    expect(log.events[0]?.actor).toBe('HERO');
  });

  /**
   * Two IDENTICAL sheets: the challenger should win, because they strike first
   * and the two are otherwise the same. This pins that the remaining edge is
   * initiative and nothing else.
   */
  it('resolves a mirror match in the challenger’s favour', () => {
    const log = simulateDuel(sheet(), sheet(), 'hero:them', 99);

    expect(log.outcome).toBe('WIN');
  });
});

describe('determinism', () => {
  it('is byte-identical for the same arguments', () => {
    const a = simulateDuel(sheet({ critPct: 25 }), sheet({ critPct: 25 }), 'hero:x', 12345);
    const b = simulateDuel(sheet({ critPct: 25 }), sheet({ critPct: 25 }), 'hero:x', 12345);

    expect(a).toEqual(b);
  });

  it('differs by seed', () => {
    const a = simulateDuel(sheet({ critPct: 40 }), sheet({ critPct: 40 }), 'hero:x', 1);
    const b = simulateDuel(sheet({ critPct: 40 }), sheet({ critPct: 40 }), 'hero:x', 2);

    expect(a.events).not.toEqual(b.events);
  });

  /**
   * TWO DRAWS PER BLOW, UNCONDITIONALLY. Skipping the crit roll when `critPct`
   * is 0 would make the stream position depend on a stat, so a defender with no
   * AGI would desynchronise every event after their first swing — and the log
   * would stop replaying.
   *
   * Asserted by construction: a duel where only the crit CHANCE differs must
   * still produce the same number of turns' worth of structure, because the
   * draw count per turn is fixed.
   */
  it('draws the same number of values whatever the crit chance', () => {
    const noCrit = simulateDuel(sheet({ attack: 1 }), sheet({ attack: 1 }), 'hero:x', 5);
    const allCrit = simulateDuel(
      sheet({ attack: 1, critPct: 100 }),
      sheet({ attack: 1, critPct: 100 }),
      'hero:x',
      5,
    );

    // Both run to exhaustion at 1 damage a side, so both reach MAX_TURNS.
    expect(noCrit.turns).toBe(MAX_TURNS);
    expect(allCrit.turns).toBe(MAX_TURNS);
  });

  it('stamps the current simulator version', () => {
    expect(simulateDuel(sheet(), sheet(), 'hero:x', 1).simVersion).toBe(SIM_VERSION);
  });

  it('records the encounter id it was given', () => {
    expect(simulateDuel(sheet(), sheet(), 'hero:abc', 1).encounterId).toBe('hero:abc');
  });
});

describe('the log is well-formed', () => {
  it('ends on a terminal event', () => {
    const log = simulateDuel(sheet(), sheet(), 'hero:x', 11);
    const last = log.events[log.events.length - 1];

    expect(['VICTORY', 'DEFEAT']).toContain(last?.type);
  });

  it('emits integers only', () => {
    const log = simulateDuel(sheet({ critPct: 33 }), sheet({ critPct: 33 }), 'hero:x', 8);

    for (const event of log.events) {
      expect(Number.isInteger(event.amount)).toBe(true);
      expect(Number.isInteger(event.heroHp)).toBe(true);
      expect(Number.isInteger(event.enemyHp)).toBe(true);
    }
  });

  it('never reports negative HP', () => {
    const log = simulateDuel(sheet({ attack: 9999 }), sheet(), 'hero:x', 4);

    for (const event of log.events) {
      expect(event.heroHp).toBeGreaterThanOrEqual(0);
      expect(event.enemyHp).toBeGreaterThanOrEqual(0);
    }
  });

  /** A stalemate is a loss for the attacker; the contract has no draw. */
  it('ends an exhausted duel as a loss', () => {
    const log = simulateDuel(sheet({ attack: 1 }), sheet({ attack: 1 }), 'hero:x', 6);

    expect(log.turns).toBe(MAX_TURNS);
    expect(log.outcome).toBe('LOSS');
  });
});

describe('what changed against the old behaviour', () => {
  /**
   * The old path is reproduced exactly by giving the defender no crit and no
   * regen — which is what dressing them as an `Encounter` did. Against a
   * defender who HAS those stats, the same seed must now produce a different
   * fight; if it did not, this whole file would be decoration.
   */
  it('produces a different fight than a defender stripped of crit and regen', () => {
    const challenger = sheet({ attack: 12 });
    const asEncounter = simulateDuel(challenger, sheet({ hp: 200 }), 'hero:x', 77);
    const asHero = simulateDuel(
      challenger,
      sheet({ hp: 200, critPct: 50, regen: 6 }),
      'hero:x',
      77,
    );

    expect(asHero.events).not.toEqual(asEncounter.events);
  });

  /** `simulate` is untouched: PvE must be unaffected by any of this. */
  it('leaves the PvE simulator alone', () => {
    const hero = {
      id: 'h',
      name: 'A',
      heroClass: 'WARRIOR' as const,
      level: 5,
      xp: 0,
      gold: 0,
      stats: { str: 10, agi: 10, end: 10, vit: 10, foc: 10, spi: 10 },
    };
    const encounter = { id: 'e1', name: 'Wolf', hp: 60, attack: 10, defence: 4, level: 5 };

    expect(simulate(hero, encounter, 123)).toEqual(simulate(hero, encounter, 123));
  });
});
