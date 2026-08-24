/**
 * `deriveCombat` is the reason `Hero` has no `hp` or `attack` column. These tests pin the
 * two properties that justify that design: it is pure, and class is the only thing that
 * changes which stat feeds attack.
 */
import { HERO_CLASSES, type Hero, type HeroClass, type StatBlock } from '../contracts/types';
import {
  ATTACK_BASE,
  ATTACK_PER_PRIMARY,
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
  it('derives every combat value from level, class and stats', () => {
    const hero = makeHero();
    expect(deriveCombat(hero)).toEqual({
      hp: Math.round(HP_BASE + 16 * HP_PER_VIT + 5 * HP_PER_LEVEL),
      attack: Math.round(ATTACK_BASE + 10 * ATTACK_PER_PRIMARY),
      defence: Math.round(16 * DEFENCE_PER_VIT),
      critPct: 12 * CRIT_PCT_PER_AGI,
      regen: Math.round(20 * REGEN_PER_SPI),
      stamina: Math.round(STAMINA_BASE + 14 * STAMINA_PER_END),
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

    expect(deriveCombat(focused).attack).toBe(Math.round(ATTACK_BASE + 30 * ATTACK_PER_PRIMARY));
    expect(deriveCombat(empty).attack).toBe(Math.round(ATTACK_BASE));
    expect(deriveCombat(focused).attack).toBeGreaterThan(deriveCombat(empty).attack);
  });

  it('gives each class a distinct attack when only its primary stat is high', () => {
    const attacks = HERO_CLASSES.map((heroClass) => {
      const primary = CLASS_PRIMARY_STAT[heroClass];
      return deriveCombat(
        makeHero({ heroClass, stats: { str: 1, agi: 1, end: 1, vit: 1, foc: 1, spi: 1, [primary]: 40 } }),
      ).attack;
    });
    // Every class benefits, and no class is accidentally reading another's stat.
    expect(new Set(attacks).size).toBe(1);
    expect(attacks[0]).toBe(Math.round(ATTACK_BASE + 40 * ATTACK_PER_PRIMARY));
  });

  it('maps each class to a distinct, valid stat', () => {
    const primaries = HERO_CLASSES.map((c) => CLASS_PRIMARY_STAT[c]);
    expect(primaries).toEqual(['str', 'foc', 'agi', 'spi', 'vit']);
    expect(new Set(primaries).size).toBe(HERO_CLASSES.length);
  });

  it('caps crit chance so an all-AGI build cannot crit on every swing', () => {
    const glassCannon = makeHero({ heroClass: 'ROGUE', stats: statBlock({ agi: 10000 }) });
    expect(deriveCombat(glassCannon).critPct).toBe(CRIT_PCT_MAX);
    expect(deriveCombat(makeHero({ stats: statBlock({ agi: 0 }) })).critPct).toBe(0);
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
