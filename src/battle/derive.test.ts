/**
 * `deriveCombat` is the reason `Hero` has no `hp` or `attack` column. These tests pin the
 * two properties that justify that design: it is pure, and class is the only thing that
 * changes which stat feeds attack.
 */
import {
  HERO_CLASSES,
  STAT_KEYS,
  type EquippedItems,
  type Hero,
  type HeroClass,
  type StatBlock,
} from '../contracts/types';
import { IRONBOUND_SET_ID, WINDRUNNER_SET_ID, itemsInSet } from '../gear/catalogue';
import { applyGear } from '../gear/equip';
import {
  ATTACK_BASE,
  ATTACK_PER_PRIMARY,
  ATTACK_PER_LEVEL,
  CLASS_BASE_STATS,
  DEFENCE_PER_LEVEL,
  DODGE_PCT_BASE,
  DODGE_PCT_PER_AGI,
  CLASS_PRIMARY_STAT,
  CRIT_PCT_MAX,
  CRIT_PCT_PER_AGI,
  DEFENCE_PER_VIT,
  HP_BASE,
  HP_PER_LEVEL,
  HP_PER_VIT,
  REGEN_PER_SPI,
  STAMINA_BASE,
  STAMINA_PER_END,
} from './constants';
import { deriveCombat } from './derive';

const statBlock = (overrides: Partial<StatBlock> = {}): StatBlock => ({
  str: 10,
  agi: 12,
  end: 14,
  vit: 16,
  foc: 18,
  spi: 20,
  ...overrides,
});

const makeHero = (overrides: Partial<Hero> = {}): Hero => ({
  id: 'hero-1',
  name: 'Test Subject',
  heroClass: 'WARRIOR',
  level: 5,
  xp: 4200,
  gold: 130,
  stats: statBlock(),
  ...overrides,
});

describe('deriveCombat', () => {
  /**
   * Every term written out, INCLUDING the two the fixture does not state: class
   * base stats fold into the line before derivation, and level scales attack
   * and defence as well as HP from 0.6.0. Computed from the constants so a
   * retune moves this with the code.
   */
  it('derives every combat value from level, class, base stats and training', () => {
    const hero = makeHero();
    const base = CLASS_BASE_STATS[hero.heroClass];
    const primary = CLASS_PRIMARY_STAT[hero.heroClass];
    const stat = (key: keyof StatBlock) => hero.stats[key] + base[key];

    expect(deriveCombat(hero)).toEqual({
      hp: Math.round(HP_BASE + stat('vit') * HP_PER_VIT + hero.level * HP_PER_LEVEL),
      attack: Math.round(
        ATTACK_BASE + stat(primary) * ATTACK_PER_PRIMARY + hero.level * ATTACK_PER_LEVEL,
      ),
      defence: Math.round(stat('vit') * DEFENCE_PER_VIT + hero.level * DEFENCE_PER_LEVEL),
      critPct: stat('agi') * CRIT_PCT_PER_AGI,
      regen: Math.round(stat('spi') * REGEN_PER_SPI),
      stamina: Math.round(STAMINA_BASE + stat('end') * STAMINA_PER_END),
      dodgePct: DODGE_PCT_BASE + stat('agi') * DODGE_PCT_PER_AGI,
    });
  });

  it('is pure — it does not mutate the hero it reads', () => {
    const hero = makeHero();
    const before = JSON.parse(JSON.stringify(hero)) as Hero;
    deriveCombat(hero);
    deriveCombat(hero);
    expect(hero).toEqual(before);
  });

  it('returns the same values for the same hero, every time', () => {
    const hero = makeHero();
    expect(deriveCombat(hero)).toEqual(deriveCombat(hero));
  });

  it.each(HERO_CLASSES)('derives %s attack from its own primary stat', (heroClass: HeroClass) => {
    const primary = CLASS_PRIMARY_STAT[heroClass];
    // One stat high, the rest at zero: whichever class reads the high stat is the only one
    // that ends up above the floor.
    const focused = makeHero({
      heroClass,
      stats: { str: 0, agi: 0, end: 0, vit: 0, foc: 0, spi: 0, [primary]: 30 },
    });
    const empty = makeHero({ heroClass, stats: statBlock({ str: 0, agi: 0, end: 0, vit: 0, foc: 0, spi: 0 }) });

    /*
     * The formula gained two terms in 0.6.0: CLASS BASE STATS fold into the
     * stat line before derivation, and LEVEL scales attack. Computed from the
     * constants rather than restated as literals, so a retune moves the test
     * with the code instead of against it.
     */
    const base = CLASS_BASE_STATS[heroClass][primary];
    const levelTerm = focused.level * ATTACK_PER_LEVEL;

    expect(deriveCombat(focused).attack).toBe(
      Math.round(ATTACK_BASE + (30 + base) * ATTACK_PER_PRIMARY + levelTerm),
    );
    expect(deriveCombat(empty).attack).toBe(
      Math.round(ATTACK_BASE + base * ATTACK_PER_PRIMARY + empty.level * ATTACK_PER_LEVEL),
    );
    expect(deriveCombat(focused).attack).toBeGreaterThan(deriveCombat(empty).attack);
  });

  /**
   * CHANGED IN 0.6.0, and the change is the point. This used to assert every
   * class produced the SAME attack from its own primary stat — one distinct
   * value across all five. That was the right assertion when a class was
   * nothing but a pointer to a stat.
   *
   * Class base stats mean a Warrior and a Mage with equally high primaries no
   * longer hit for the same amount, which is what having a base stat MEANS. So
   * the intent that survives is the one underneath: every class benefits from
   * its own primary, and none reads another's.
   */
  it('has every class read its OWN primary stat, and no other', () => {
    for (const heroClass of HERO_CLASSES) {
      const primary = CLASS_PRIMARY_STAT[heroClass];
      const flat = statBlock({ str: 1, agi: 1, end: 1, vit: 1, foc: 1, spi: 1 });

      const onPrimary = deriveCombat(
        makeHero({ heroClass, stats: { ...flat, [primary]: 40 } }),
      ).attack;

      // Raising any OTHER stat must not move attack at all.
      for (const other of STAT_KEYS.filter((key) => key !== primary)) {
        const onOther = deriveCombat(
          makeHero({ heroClass, stats: { ...flat, [other]: 40 } }),
        ).attack;
        expect(onOther).toBeLessThan(onPrimary);
      }
    }
  });

  it('maps each class to a distinct, valid stat', () => {
    const primaries = HERO_CLASSES.map((c) => CLASS_PRIMARY_STAT[c]);
    expect(primaries).toEqual(['str', 'foc', 'agi', 'spi', 'vit']);
    expect(new Set(primaries).size).toBe(HERO_CLASSES.length);
  });

  it('caps crit chance so an all-AGI build cannot crit on every swing', () => {
    const glassCannon = makeHero({ heroClass: 'ROGUE', stats: statBlock({ agi: 10000 }) });
    expect(deriveCombat(glassCannon).critPct).toBe(CRIT_PCT_MAX);
  });

  /**
   * A ZERO-AGI HERO NO LONGER HAS ZERO CRIT, and that is deliberate: every
   * class has base AGI from 0.6.0, so a class STARTS somewhere rather than at
   * nothing. The floor is the class's own, and it is small.
   */
  it('floors crit at the class base rather than at zero', () => {
    for (const heroClass of HERO_CLASSES) {
      const untrained = deriveCombat(makeHero({ heroClass, stats: statBlock({ agi: 0 }) }));
      const expected = CLASS_BASE_STATS[heroClass].agi * CRIT_PCT_PER_AGI;

      expect(untrained.critPct).toBeCloseTo(expected, 5);
      expect(untrained.critPct).toBeLessThan(CRIT_PCT_MAX);
    }
  });

  it('scales HP with both VIT and level', () => {
    const base = deriveCombat(makeHero({ level: 1, stats: statBlock({ vit: 5 }) })).hp;
    const levelled = deriveCombat(makeHero({ level: 2, stats: statBlock({ vit: 5 }) })).hp;
    const tanky = deriveCombat(makeHero({ level: 1, stats: statBlock({ vit: 6 }) })).hp;
    expect(levelled - base).toBe(HP_PER_LEVEL);
    expect(tanky - base).toBe(HP_PER_VIT);
  });

  it('returns integers for every value the contract declares integral', () => {
    // critPct is explicitly allowed to be fractional; everything else must be a whole
    // number or floats leak into emitted battle events.
    const derived = deriveCombat(makeHero({ stats: statBlock({ vit: 7, spi: 9, end: 11, str: 13 }) }));
    expect(Number.isInteger(derived.hp)).toBe(true);
    expect(Number.isInteger(derived.attack)).toBe(true);
    expect(Number.isInteger(derived.defence)).toBe(true);
    expect(Number.isInteger(derived.regen)).toBe(true);
    expect(Number.isInteger(derived.stamina)).toBe(true);
  });

  it('never returns a negative value for a degenerate hero', () => {
    const nothing = makeHero({
      level: 0,
      stats: { str: -5, agi: -5, end: -5, vit: -5, foc: -5, spi: -5 },
    });
    const derived = deriveCombat(nothing);
    for (const value of Object.values(derived)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

/**
 * Gear reaches combat the same way stats do: as a projection, never as stored state. These
 * tests pin the compatibility promise as hard as the behaviour — the one-argument call is what
 * `backend` and `mobile-app` already ship, and it must keep meaning exactly what it meant.
 */
describe('deriveCombat with gear', () => {
  const fullSet = (setId: string): EquippedItems =>
    Object.fromEntries(itemsInSet(setId).map((piece) => [piece.slot, piece]));

  it('is identical to the one-argument call for a hero wearing nothing', () => {
    const hero = makeHero();
    expect(deriveCombat(hero, {})).toEqual(deriveCombat(hero));
  });

  it('derives from GEARED stats, so equipment shows up in the fight', () => {
    const hero = makeHero({ heroClass: 'WARRIOR' });
    const bare = deriveCombat(hero);
    const geared = deriveCombat(hero, fullSet(IRONBOUND_SET_ID));

    // ironbound is a STR/VIT set and WARRIOR attacks off STR, so all four must move.
    expect(geared.attack).toBeGreaterThan(bare.attack);
    expect(geared.hp).toBeGreaterThan(bare.hp);
    expect(geared.defence).toBeGreaterThan(bare.defence);
    expect(geared.stamina).toBeGreaterThanOrEqual(bare.stamina);
  });

  it('matches deriving from stats that already had the gear applied', () => {
    const hero = makeHero();
    const equipped = fullSet(IRONBOUND_SET_ID);
    const preGeared = makeHero({ stats: applyGear(hero.stats, equipped) });

    expect(deriveCombat(hero, equipped)).toEqual(deriveCombat(preGeared));
  });

  it('never writes gear into the hero — earned stats stay the fold of the ledger', () => {
    const hero = makeHero();
    const before = JSON.parse(JSON.stringify(hero)) as Hero;

    deriveCombat(hero, fullSet(WINDRUNNER_SET_ID));
    deriveCombat(hero, fullSet(IRONBOUND_SET_ID));

    expect(hero).toEqual(before);
  });

  it('is deterministic — the same hero and loadout always derive the same block', () => {
    const hero = makeHero();
    const equipped = fullSet(WINDRUNNER_SET_ID);
    expect(deriveCombat(hero, equipped)).toEqual(deriveCombat(hero, equipped));
  });

  it('keeps every integral value integral once gear is applied', () => {
    const derived = deriveCombat(makeHero(), fullSet(WINDRUNNER_SET_ID));
    expect(Number.isInteger(derived.hp)).toBe(true);
    expect(Number.isInteger(derived.attack)).toBe(true);
    expect(Number.isInteger(derived.defence)).toBe(true);
    expect(Number.isInteger(derived.regen)).toBe(true);
    expect(Number.isInteger(derived.stamina)).toBe(true);
  });

  it('still respects the crit ceiling for an AGI set on an AGI class', () => {
    const rogue = makeHero({ heroClass: 'ROGUE', stats: statBlock({ agi: 10000 }) });
    expect(deriveCombat(rogue, fullSet(WINDRUNNER_SET_ID)).critPct).toBe(CRIT_PCT_MAX);
  });
});
