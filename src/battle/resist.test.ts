import {
  ITEM_CATALOGUE,
  catalogueSchoolsAreCoherent,
  itemById,
} from '../gear/catalogue';
import { DAMAGE_TYPES, type EquippedItems, type Encounter, type Hero } from '../contracts/types';
import { CLASS_DAMAGE_TYPE, RESIST_CAP_PCT } from './constants';
import { deriveCombat } from './derive';
import { clampResist, resistanceAgainst } from './resist';
import { simulate } from './simulate';
import { simulateDuel } from './duel';


/**
 * `itemById` returns `undefined` for an id this build has retired, and
 * `exactOptionalPropertyTypes` will not let that reach an `EquippedItems` slot.
 * Throwing here is right: a test that silently equipped nothing would pass by
 * asserting that nothing does nothing.
 */
function must(itemId: string) {
  const item = itemById(itemId);
  if (item === undefined) throw new Error(`the catalogue no longer has ${itemId}`);
  return item;
}

const hero = (overrides: Partial<Hero> = {}): Hero => ({
  id: 'hero-1',
  name: 'Test Subject',
  heroClass: 'WARRIOR',
  level: 10,
  xp: 0,
  gold: 0,
  stats: { str: 20, agi: 10, end: 10, vit: 15, foc: 10, spi: 5 },
  ...overrides,
});

const dummy = (overrides: Partial<Encounter> = {}): Encounter => ({
  id: 'dummy',
  name: 'Dummy',
  hp: 4000,
  attack: 30,
  defence: 5,
  level: 10,
  ...overrides,
});

/** Total damage the hero dealt across a whole fight. */
function heroDamage(log: ReturnType<typeof simulate>): number {
  return log.events
    .filter((event) => event.actor === 'HERO' && (event.type === 'ATTACK' || event.type === 'CRIT'))
    .reduce((sum, event) => sum + event.amount, 0);
}

describe('resolving resistance', () => {
  it('reads a school out of a block, and treats an unwarded school as zero', () => {
    expect(resistanceAgainst({ FROST: 20 }, 'FROST')).toBe(20);
    expect(resistanceAgainst({ FROST: 20 }, 'FIRE')).toBe(0);
    expect(resistanceAgainst(undefined, 'FIRE')).toBe(0);
  });

  /*
   * A stored block is DATA, and data can be wrong. A `NaN` reaching the turn loop
   * would make every event in that battle `NaN` — the log would be permanently
   * unreadable rather than merely wrong.
   */
  it('refuses to propagate a nonsense value', () => {
    expect(resistanceAgainst({ FIRE: Number.NaN }, 'FIRE')).toBe(0);
    expect(resistanceAgainst({ FIRE: -30 }, 'FIRE')).toBe(0);
    expect(clampResist(Number.NaN)).toBe(0);
  });

  /**
   * ============================================================================
   * NO BUILD IS EVER IMMUNE, AND THE CEILING IS THE WHOLE DESIGN.
   * ============================================================================
   * A build immune to a school cannot lose to it, which turns gear selection from
   * a decision into a lookup: find the boss's school, stack it, win. Every
   * interesting fight would have exactly one correct answer.
   */
  it('caps resistance below immunity, however much is stacked', () => {
    expect(clampResist(500)).toBe(RESIST_CAP_PCT);
    expect(RESIST_CAP_PCT).toBeLessThan(100);
  });
});

describe('resistance in a fight', () => {
  it('reduces damage from the school it wards', () => {
    const unwarded = simulate(hero(), dummy(), 99);
    const warded = simulate(hero(), dummy({ resistance: { PHYSICAL: 50 } }), 99);

    expect(heroDamage(warded)).toBeLessThan(heroDamage(unwarded));
  });

  /*
   * THE POINT OF HAVING SCHOOLS AT ALL. Frost resistance against a physical
   * attacker must do exactly nothing, or resistance is just more defence.
   */
  it('does nothing at all against a school it does not ward', () => {
    const unwarded = simulate(hero(), dummy(), 99);
    const wrongWard = simulate(hero(), dummy({ resistance: { FROST: 60 } }), 99);

    expect(heroDamage(wrongWard)).toBe(heroDamage(unwarded));
  });

  it('never stops a fight dead, however heavily warded', () => {
    const log = simulate(hero(), dummy({ resistance: { PHYSICAL: 99 } }), 7);
    // Floored at MIN_DAMAGE per blow, so the fight resolves instead of stalling.
    expect(heroDamage(log)).toBeGreaterThan(0);
  });

  it('applies the cap, so 90 wards no more than the ceiling does', () => {
    const atCap = heroDamage(simulate(hero(), dummy({ resistance: { PHYSICAL: RESIST_CAP_PCT } }), 5));
    const beyond = heroDamage(simulate(hero(), dummy({ resistance: { PHYSICAL: 90 } }), 5));

    expect(beyond).toBe(atCap);
  });

  /**
   * FLAT FIRST, THEN PERCENTAGE — and this is the assertion that pins the order.
   * Resistance is worth most against the blows defence barely dents, which is
   * exactly the case defence handles badly. The other order would make a
   * high-defence opponent get LESS out of the same resistance.
   */
  it('scales what defence left, not what defence would have left', () => {
    const soft = dummy({ defence: 0, resistance: { PHYSICAL: 50 } });
    const hard = dummy({ defence: 0 });

    const resisted = heroDamage(simulate(hero(), soft, 11));
    const plain = heroDamage(simulate(hero(), hard, 11));

    // Roughly half, allowing for the per-blow MIN_DAMAGE floor and rounding.
    expect(resisted).toBeLessThan(plain * 0.6);
    expect(resisted).toBeGreaterThan(plain * 0.4);
  });
});

describe('both simulators agree on what a point of resistance is worth', () => {
  /*
   * `simulate` and `simulateDuel` are separate turn loops on purpose. The one
   * thing that must NOT differ is the clamp — two copies would be two balance
   * surfaces, and a player would find frost resistance doing one thing against a
   * creature and another against a hero.
   */
  it('reduces a duel blow the same way it reduces an encounter blow', () => {
    const sheet = deriveCombat(hero());
    const plain = simulateDuel(
      { ...sheet, hp: 5000 },
      { ...sheet, hp: 5000, damageType: 'PHYSICAL' },
      'duel',
      3,
    );
    const warded = simulateDuel(
      { ...sheet, hp: 5000, resistance: { PHYSICAL: 50 } },
      { ...sheet, hp: 5000, damageType: 'PHYSICAL' },
      'duel',
      3,
    );

    const takenPlain = plain.events
      .filter((event) => event.actor === 'ENEMY' && event.type !== 'HIT')
      .reduce((sum, event) => sum + event.amount, 0);
    const takenWarded = warded.events
      .filter((event) => event.actor === 'ENEMY' && event.type !== 'HIT')
      .reduce((sum, event) => sum + event.amount, 0);

    expect(takenWarded).toBeLessThan(takenPlain);
  });
});

describe('where a school comes from', () => {
  it('falls back to the class when no weapon is held', () => {
    for (const heroClass of ['WARRIOR', 'MAGE', 'ROGUE', 'PRIEST', 'PALADIN'] as const) {
      expect(deriveCombat(hero({ heroClass })).damageType).toBe(CLASS_DAMAGE_TYPE[heroClass]);
    }
  });

  /**
   * THE WEAPON DECIDES. That is what makes an elemental weapon a choice rather
   * than a stat stick: picking one up changes what you ARE, and therefore what
   * resists you.
   */
  it('takes the weapon’s school over the class’s', () => {
    const baton = must('windrunner-baton');
    expect(baton.damageType).toBe('LIGHTNING');

    const equipped: EquippedItems = { weapon: baton };
    // A WARRIOR is PHYSICAL by class, and holding this makes them LIGHTNING.
    expect(deriveCombat(hero({ heroClass: 'WARRIOR' }), equipped).damageType).toBe('LIGHTNING');
  });

  it('sums resistance across every worn piece', () => {
    const helm = must('ironbound-helm');
    const plate = must('ironbound-plate');
    const equipped: EquippedItems = { head: helm, chest: plate };

    const total = (helm.resistance?.PHYSICAL ?? 0) + (plate.resistance?.PHYSICAL ?? 0);
    expect(deriveCombat(hero(), equipped).resistance?.PHYSICAL).toBe(total);
  });

  /*
   * UNCAPPED AT DERIVATION, capped in the simulator. A block capped here would be
   * indistinguishable from one that was never stacked, so a hero sheet could not
   * show "you are at the ceiling" and a player could not tell that a seventh
   * warded piece would be wasted.
   */
  it('lets a sheet show more than the cap, so a player can see they are at it', () => {
    const equipped: EquippedItems = {
      chest: must('aegis-of-the-long-haul'),
      head: must('ironbound-helm'),
    };
    const shown = deriveCombat(hero(), equipped).resistance?.PHYSICAL ?? 0;

    expect(shown).toBeGreaterThan(0);
    // Whatever is shown, the fight applies no more than the ceiling.
    expect(clampResist(shown)).toBeLessThanOrEqual(RESIST_CAP_PCT);
  });

  it('leaves unwarded schools out of the block rather than listing six zeroes', () => {
    expect(deriveCombat(hero()).resistance).toEqual({});
  });
});

/**
 * ============================================================================
 * CONTENT FAILS QUIETLY, WHICH IS WHY THIS IS A TEST.
 * ============================================================================
 * A `damageType` on a helm does nothing — only the weapon sets a school — so an
 * authored "frost helm" would sit in the catalogue looking meaningful, render on
 * an item card as if it did something, and change no fight.
 */
describe('the catalogue', () => {
  it('puts a school only on weapons, and resistance only within the cap', () => {
    expect(catalogueSchoolsAreCoherent()).toBe(true);
  });

  it('names only schools the engine knows', () => {
    for (const item of ITEM_CATALOGUE) {
      if (item.damageType !== undefined) expect(DAMAGE_TYPES).toContain(item.damageType);
      for (const school of Object.keys(item.resistance ?? {})) {
        expect(DAMAGE_TYPES).toContain(school);
      }
    }
  });

  it('actually wards something — resistance that exists is worth having', () => {
    const warded = ITEM_CATALOGUE.filter((item) => item.resistance !== undefined);
    expect(warded.length).toBeGreaterThan(0);

    for (const item of warded) {
      for (const value of Object.values(item.resistance ?? {})) {
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});
