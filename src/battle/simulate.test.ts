/**
 * The battle log is both the playback source for the client and the audit trail for a
 * disputed fight, so the tests below are ordered by how much damage their failure does:
 * reproducibility first, then termination, then the shape guarantees the renderer and the
 * backend's schema rely on, then balance.
 */
import type { BattleEvent, BattleLog, Encounter, Hero, StatBlock } from '../contracts/types';
import { MAX_TURNS, MIN_DAMAGE } from './constants';
import { deriveCombat } from './derive';
import { SIM_VERSION, simulate as simulateFromBarrel } from './index';
import { simulate } from './simulate';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

const statBlock = (overrides: Partial<StatBlock> = {}): StatBlock => ({
  str: 0,
  agi: 0,
  end: 0,
  vit: 0,
  foc: 0,
  spi: 0,
  ...overrides,
});

const makeHero = (overrides: Partial<Hero> = {}): Hero => ({
  id: 'hero-1',
  name: 'Test Subject',
  heroClass: 'WARRIOR',
  level: 5,
  xp: 4200,
  gold: 130,
  stats: statBlock({ str: 12, agi: 8, end: 9, vit: 10, foc: 4, spi: 6 }),
  ...overrides,
});

/** Deliberately under-levelled: loses the contested matchup most of the time. */
const WEAK_HERO = makeHero({
  id: 'hero-weak',
  level: 3,
  stats: statBlock({ str: 6, agi: 4, end: 5, vit: 5, foc: 2, spi: 3 }),
});

/** Strictly better on every axis: higher level and a higher value in all six stats. */
const STRONG_HERO = makeHero({
  id: 'hero-strong',
  level: 12,
  stats: statBlock({ str: 26, agi: 18, end: 20, vit: 22, foc: 10, spi: 14 }),
});

const ENCOUNTER: Encounter = { id: 'enc-boar', name: 'Tusked Boar', hp: 120, attack: 14, defence: 5, level: 4 };

/** Tuned so the weak hero usually loses it and the strong hero usually does not. */
const CONTESTED: Encounter = { id: 'enc-warden', name: 'Grove Warden', hp: 170, attack: 18, defence: 8, level: 7 };

/**
 * Unkillable by a weak hero, and unable to kill one: the only way to reach `MAX_TURNS`.
 * Exists to prove the loop always terminates even when neither side can finish the job.
 */
const WALL: Encounter = { id: 'enc-wall', name: 'Ancient Bulwark', hp: 600, attack: 9, defence: 250, level: 30 };

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 13);

const lastEvent = (log: BattleLog): BattleEvent => {
  const event = log.events[log.events.length - 1];
  if (event === undefined) throw new Error('a battle log must never be empty');
  return event;
};

/* -------------------------------------------------------------------------- *
 * Reproducibility — the core guarantee
 * -------------------------------------------------------------------------- */

describe('simulate — reproducibility', () => {
  it('produces a byte-identical log for the same hero, encounter and seed', () => {
    const a = simulate(makeHero(), ENCOUNTER, 20240817);
    const b = simulate(makeHero(), ENCOUNTER, 20240817);
    // Byte-identical, not merely deep-equal: this log is stored and re-derived years later.
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toEqual(b);
  });

  it('reproduces a stored log event for event — snapshot', () => {
    // THE tripwire for this package. If this snapshot changes, every stored battle log has
    // become unverifiable and `SIM_VERSION` must be bumped in the same commit.
    expect(simulate(makeHero(), ENCOUNTER, 20240817)).toMatchSnapshot();
  });

  it('reproduces a losing log too', () => {
    expect(simulate(WEAK_HERO, CONTESTED, 5)).toMatchSnapshot();
  });

  it('produces different logs for different seeds', () => {
    const a = simulate(makeHero(), CONTESTED, 1);
    const b = simulate(makeHero(), CONTESTED, 2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('produces materially different logs across many seed pairs', () => {
    const logs = SEEDS.map((seed) => JSON.stringify(simulate(makeHero(), CONTESTED, seed).events));
    // Some seeds will coincide on a short fight; the stream must not be constant.
    expect(new Set(logs).size).toBeGreaterThan(SEEDS.length * 0.9);
  });

  it('stamps the seed and simulator version it was produced by', () => {
    const log = simulate(makeHero(), ENCOUNTER, 4242);
    expect(log.seed).toBe(4242);
    expect(log.simVersion).toBe(SIM_VERSION);
    expect(log.encounterId).toBe(ENCOUNTER.id);
  });

  it('is reachable through the barrel and behaves identically', () => {
    // Guards the `simulate.ts` -> `index.ts` import cycle for `SIM_VERSION`.
    expect(simulateFromBarrel(makeHero(), ENCOUNTER, 77)).toEqual(simulate(makeHero(), ENCOUNTER, 77));
    expect(SIM_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('does not mutate the hero or the encounter', () => {
    const hero = makeHero();
    const encounter: Encounter = { ...ENCOUNTER };
    const heroBefore = JSON.parse(JSON.stringify(hero)) as Hero;
    const encounterBefore = JSON.parse(JSON.stringify(encounter)) as Encounter;
    simulate(hero, encounter, 9);
    simulate(hero, encounter, 9);
    expect(hero).toEqual(heroBefore);
    expect(encounter).toEqual(encounterBefore);
  });
});

/* -------------------------------------------------------------------------- *
 * Termination
 * -------------------------------------------------------------------------- */

describe('simulate — termination', () => {
  it('always terminates within MAX_TURNS', () => {
    for (const seed of SEEDS) {
      for (const [hero, encounter] of [
        [WEAK_HERO, ENCOUNTER],
        [WEAK_HERO, CONTESTED],
        [STRONG_HERO, CONTESTED],
        [WEAK_HERO, WALL],
        [STRONG_HERO, WALL],
      ] as ReadonlyArray<readonly [Hero, Encounter]>) {
        const log = simulate(hero, encounter, seed);
        expect(log.turns).toBeGreaterThan(0);
        expect(log.turns).toBeLessThanOrEqual(MAX_TURNS);
      }
    }
  });

  it('treats exhausting MAX_TURNS as a loss, with a terminal event and no faint', () => {
    const log = simulate(WEAK_HERO, WALL, 42);
    expect(log.turns).toBe(MAX_TURNS);
    expect(log.outcome).toBe('LOSS');
    expect(lastEvent(log).type).toBe('DEFEAT');
    // Nobody died — a stalemate is scored as a loss, it is not a faint.
    expect(log.events.some((e) => e.type === 'FAINT')).toBe(false);
    expect(lastEvent(log).heroHp).toBeGreaterThan(0);
    expect(lastEvent(log).enemyHp).toBeGreaterThan(0);
  });

  it('never stalls: even a hopeless attacker chips at least MIN_DAMAGE off per turn', () => {
    const log = simulate(WEAK_HERO, WALL, 42);
    const heroHits = log.events.filter((e) => e.actor === 'HERO' && (e.type === 'ATTACK' || e.type === 'CRIT'));
    expect(heroHits).toHaveLength(MAX_TURNS);
    for (const hit of heroHits) {
      expect(hit.amount).toBeGreaterThanOrEqual(MIN_DAMAGE);
    }
    expect(lastEvent(log).enemyHp).toBeLessThan(WALL.hp);
  });
});

/* -------------------------------------------------------------------------- *
 * Log shape — what the renderer and the backend schema depend on
 * -------------------------------------------------------------------------- */

describe('simulate — log shape', () => {
  const allLogs: BattleLog[] = SEEDS.flatMap((seed) => [
    simulate(WEAK_HERO, ENCOUNTER, seed),
    simulate(WEAK_HERO, CONTESTED, seed),
    simulate(STRONG_HERO, CONTESTED, seed),
    simulate(WEAK_HERO, WALL, seed),
  ]);

  it('never emits a negative HP value', () => {
    // Collected rather than asserted per event so a failure names the offending event
    // instead of drowning the run in tens of thousands of assertions.
    const negatives = allLogs.flatMap((log) => log.events.filter((e) => e.heroHp < 0 || e.enemyHp < 0));
    expect(negatives).toEqual([]);
  });

  it('emits integers only — no float ever reaches a log', () => {
    const offenders = allLogs.flatMap((log) =>
      log.events.filter(
        (e) =>
          !Number.isInteger(e.turn) ||
          !Number.isInteger(e.amount) ||
          !Number.isInteger(e.heroHp) ||
          !Number.isInteger(e.enemyHp) ||
          e.amount < 0 ||
          e.turn < 1 ||
          e.turn > log.turns,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('ends on VICTORY or DEFEAT, and the outcome agrees with it', () => {
    for (const log of allLogs) {
      const final = lastEvent(log);
      expect(['VICTORY', 'DEFEAT']).toContain(final.type);
      expect(final.type).toBe(log.outcome === 'WIN' ? 'VICTORY' : 'DEFEAT');
      expect(final.turn).toBe(log.turns);
      // Terminal events are framing only; they carry no magnitude.
      expect(final.amount).toBe(0);
      // Exactly one terminal event, always last.
      expect(log.events.filter((e) => e.type === 'VICTORY' || e.type === 'DEFEAT')).toHaveLength(1);
    }
  });

  it('emits a FAINT for the side that hit zero, immediately before the terminal event', () => {
    for (const log of allLogs) {
      const final = lastEvent(log);
      const faints = log.events.filter((e) => e.type === 'FAINT');
      if (log.outcome === 'WIN') {
        expect(final.enemyHp).toBe(0);
        expect(faints).toHaveLength(1);
        expect(faints[0]?.actor).toBe('ENEMY');
      } else if (final.heroHp === 0) {
        expect(faints).toHaveLength(1);
        expect(faints[0]?.actor).toBe('HERO');
      } else {
        // Exhaustion: a loss without a faint.
        expect(faints).toHaveLength(0);
      }
      // A faint, when there is one, is the beat immediately before the terminal event.
      if (faints.length === 1) {
        expect(log.events.indexOf(faints[0] as BattleEvent)).toBe(log.events.length - 2);
      }
    }
  });

  it('numbers turns from 1 and never goes backwards', () => {
    const outOfOrder = allLogs.filter((log) => {
      let previous = 0;
      for (const event of log.events) {
        if (event.turn < previous) return true;
        previous = event.turn;
      }
      return log.events[0]?.turn !== 1;
    });
    expect(outOfOrder).toEqual([]);
  });

  it('pairs every attack with a HIT on the receiving side', () => {
    const log = simulate(WEAK_HERO, CONTESTED, 5);
    const swings = log.events.filter((e) => e.type === 'ATTACK' || e.type === 'CRIT');
    const hits = log.events.filter((e) => e.type === 'HIT');
    expect(hits).toHaveLength(swings.length);
    for (const [i, swing] of swings.entries()) {
      const hit = hits[i];
      expect(hit?.amount).toBe(swing.amount);
      // The HIT belongs to the other side — direction is implied by the actor.
      expect(hit?.actor).not.toBe(swing.actor);
    }
  });

  it('emits BLOCK on the defending side only when mitigation was heavy', () => {
    // The wall mitigates almost everything the weak hero throws, so the ENEMY blocks; its
    // own feeble swings are mostly absorbed too, so the HERO blocks. Both sides can block.
    const blocked = simulate(WEAK_HERO, WALL, 42);
    const blocks = blocked.events.filter((e) => e.type === 'BLOCK');
    expect(blocks.filter((e) => e.actor === 'ENEMY').length).toBeGreaterThan(0);
    expect(blocks.filter((e) => e.actor === 'HERO').length).toBeGreaterThan(0);
    // A BLOCK reports what was absorbed; it never reports zero and never carries damage.
    expect(blocks.every((e) => e.amount > 0)).toBe(true);
    // A defenceless enemy has nothing to absorb with, so it can never block.
    const paper: Encounter = { ...ENCOUNTER, id: 'enc-paper', defence: 0 };
    const clean = simulate(STRONG_HERO, paper, 3);
    expect(clean.events.filter((e) => e.type === 'BLOCK' && e.actor === 'ENEMY')).toHaveLength(0);
  });

  it('regenerates the hero from SPI without ever exceeding max HP', () => {
    const healer = makeHero({ heroClass: 'PRIEST', level: 8, stats: statBlock({ spi: 20, vit: 14, agi: 6 }) });
    const maxHp = deriveCombat(healer).hp;
    const log = simulate(healer, CONTESTED, 11);
    const regens = log.events.filter((e) => e.type === 'REGEN');
    expect(regens.length).toBeGreaterThan(0);
    for (const regen of regens) {
      expect(regen.actor).toBe('HERO');
      expect(regen.amount).toBeGreaterThan(0);
      expect(regen.heroHp).toBeLessThanOrEqual(maxHp);
    }
    for (const event of log.events) {
      expect(event.heroHp).toBeLessThanOrEqual(maxHp);
    }
  });

  it('emits no regen for a hero with no SPI', () => {
    const soulless = makeHero({ stats: statBlock({ str: 12, vit: 10, spi: 0 }) });
    const log = simulate(soulless, CONTESTED, 11);
    expect(log.events.filter((e) => e.type === 'REGEN')).toHaveLength(0);
  });

  it('lets the hero act first — the opening event is always the hero swinging', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const opening = simulate(WEAK_HERO, CONTESTED, seed).events[0];
      expect(opening?.actor).toBe('HERO');
      expect(['ATTACK', 'CRIT']).toContain(opening?.type);
    }
  });

  it('can win on turn one against a trivial encounter', () => {
    const trivial: Encounter = { id: 'enc-rat', name: 'Sewer Rat', hp: 1, attack: 1, defence: 0, level: 1 };
    // Zero AGI, so the crit roll can never land and the event list is exact.
    const bruiser = makeHero({ level: 10, stats: statBlock({ str: 30, agi: 0, vit: 15 }) });
    const log = simulate(bruiser, trivial, 1);
    expect(log.turns).toBe(1);
    expect(log.outcome).toBe('WIN');
    expect(log.events.map((e) => e.type)).toEqual(['ATTACK', 'HIT', 'FAINT', 'VICTORY']);
  });

  it('normalises content-authored encounter numbers to integers', () => {
    // Encounters are hand-tuned content; a fractional HP in a data file must not put a
    // fractional HP into every event of that fight.
    const sloppy: Encounter = { id: 'enc-sloppy', name: 'Rounding Error', hp: 40.6, attack: 12.4, defence: 3.7, level: 4 };
    const log = simulate(makeHero(), sloppy, 8);
    for (const event of log.events) {
      expect(Number.isInteger(event.enemyHp)).toBe(true);
      expect(Number.isInteger(event.heroHp)).toBe(true);
      expect(Number.isInteger(event.amount)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Balance sanity
 * -------------------------------------------------------------------------- */

describe('simulate — balance', () => {
  const winRate = (hero: Hero, encounter: Encounter): number => {
    const wins = SEEDS.filter((seed) => simulate(hero, encounter, seed).outcome === 'WIN').length;
    return wins / SEEDS.length;
  };

  it('has a strictly stronger hero win materially more often', () => {
    // Property test over hundreds of seeds. STRONG_HERO is better on every stat AND higher
    // level, so if this ever inverts, a formula in `derive.ts` is reading the wrong stat.
    const strong = winRate(STRONG_HERO, CONTESTED);
    const weak = winRate(WEAK_HERO, CONTESTED);
    expect(strong).toBeGreaterThan(weak);
    expect(strong - weak).toBeGreaterThan(0.4);
    expect(strong).toBeGreaterThan(0.75);
  });

  it('never has the weaker hero out-win the stronger one, on any encounter', () => {
    for (const encounter of [ENCOUNTER, CONTESTED, WALL]) {
      expect(winRate(STRONG_HERO, encounter)).toBeGreaterThanOrEqual(winRate(WEAK_HERO, encounter));
    }
  });

  it('finishes a fight faster the stronger the hero is', () => {
    const turnsFor = (hero: Hero): number =>
      SEEDS.reduce((total, seed) => total + simulate(hero, CONTESTED, seed).turns, 0) / SEEDS.length;
    expect(turnsFor(STRONG_HERO)).toBeLessThan(turnsFor(WEAK_HERO));
  });

  it('lands criticals at roughly the derived rate', () => {
    // The crit roll is the second draw of every hero strike; a wrong comparison here would
    // silently make AGI worthless or overwhelming.
    const rogue = makeHero({ heroClass: 'ROGUE', level: 10, stats: statBlock({ agi: 50, vit: 18, str: 5 }) });
    const expected = deriveCombat(rogue).critPct / 100;
    let swings = 0;
    let crits = 0;
    for (const seed of SEEDS) {
      for (const event of simulate(rogue, WALL, seed).events) {
        if (event.actor !== 'HERO') continue;
        if (event.type === 'CRIT') crits += 1;
        if (event.type === 'CRIT' || event.type === 'ATTACK') swings += 1;
      }
    }
    expect(swings).toBeGreaterThan(1000);
    expect(Math.abs(crits / swings - expected)).toBeLessThan(0.05);
  });

  it('never lets an enemy crit — encounters carry no crit stat in v0.1.0', () => {
    const enemyCrits = SEEDS.flatMap((seed) => simulate(WEAK_HERO, CONTESTED, seed).events).filter(
      (e) => e.actor === 'ENEMY' && e.type === 'CRIT',
    );
    expect(enemyCrits).toHaveLength(0);
  });
});
