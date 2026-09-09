import {
  ROLL_QUALITY_MAX,
  ROLL_QUALITY_MIN,
  STAT_COUNT_BY_RARITY,
} from './constants';
import { rollItem, statBudgetFor, totalStats } from './roll';
import { RARITIES, type Item, type Rarity } from '../contracts/types';

/**
 * Rolled instances.
 *
 * The properties worth pinning are not "does it return an object" but the ones
 * the economy rests on: that a roll is reproducible, that the tier ladder is
 * respected on average, and that the ladder OVERLAPS at the edges — because a
 * top-rolled RARE beating a bottom-rolled EPIC is the entire reason an auction
 * house has anything to price.
 */

function template(overrides: Partial<Item> = {}): Item {
  return {
    id: 'tpl-helm',
    name: 'Ironbound Helm',
    slot: 'head',
    rarity: 'RARE',
    // Deliberately non-empty: the roll must IGNORE this. A template describes a
    // shape, and honouring its stats would make every instance partly identical.
    statBonus: { str: 999 },
    levelRequirement: 4,
    ...overrides,
  };
}

describe('determinism', () => {
  it('is fully reproducible from its seed', () => {
    const a = rollItem(template(), 20, 12345);
    const b = rollItem(template(), 20, 12345);
    expect(a).toEqual(b);
  });

  it('produces different instances from different seeds', () => {
    const rolls = [1, 2, 3, 4, 5].map(seed => rollItem(template(), 20, seed));
    const signatures = new Set(rolls.map(r => JSON.stringify(r.statBonus) + r.quality));
    // Not a strict guarantee for any given pair, but five identical rolls from
    // five seeds would mean the seed is not reaching the RNG at all.
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('records the seed it was rolled from, so a disputed item can be re-derived', () => {
    const rolled = rollItem(template(), 20, 999);
    expect(rolled.rollSeed).toBe(999);
    expect(rollItem(template(), 20, rolled.rollSeed)).toEqual(rolled);
  });

  it('ignores the template stats entirely', () => {
    const rolled = rollItem(template({ statBonus: { str: 999 } }), 10, 7);
    expect(totalStats(rolled)).toBeLessThan(999);
  });
});

describe('the level requirement closes the alt-trading hole', () => {
  /**
   * The template asks for level 4. With a tradeable item that would let a
   * level-4 alt buy level-23 stats off the auction house.
   */
  it('requires the item level, not the template level', () => {
    const rolled = rollItem(template({ levelRequirement: 4 }), 23, 1);
    expect(rolled.levelRequirement).toBe(23);
  });

  it('means you can only wear what you could have won', () => {
    for (const itemLevel of [1, 12, 20, 40]) {
      expect(rollItem(template(), itemLevel, 3).levelRequirement).toBe(itemLevel);
    }
  });
});

describe('the budget is respected', () => {
  it.each(RARITIES)('%s never exceeds its budget', (rarity: Rarity) => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rolled = rollItem(template({ rarity }), 20, seed);
      // Flooring plus the remainder top-up lands within a point of the budget.
      expect(totalStats(rolled)).toBeLessThanOrEqual(statBudgetFor(20, rarity));
    }
  });

  it.each(RARITIES)('%s stays inside the quality band', (rarity: Rarity) => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const { quality } = rollItem(template({ rarity }), 20, seed);
      expect(quality).toBeGreaterThanOrEqual(ROLL_QUALITY_MIN);
      expect(quality).toBeLessThanOrEqual(ROLL_QUALITY_MAX);
    }
  });

  it('scales with item level', () => {
    const low = rollItem(template(), 5, 42);
    const high = rollItem(template(), 40, 42);
    expect(totalStats(high)).toBeGreaterThan(totalStats(low));
  });
});

describe('stat count widens with rarity', () => {
  it.each(RARITIES)('%s carries the stated number of stats', (rarity: Rarity) => {
    const [min, max] = STAT_COUNT_BY_RARITY[rarity];
    for (let seed = 1; seed <= 100; seed += 1) {
      const count = Object.keys(rollItem(template({ rarity }), 20, seed).statBonus).length;
      expect(count).toBeGreaterThanOrEqual(min);
      expect(count).toBeLessThanOrEqual(max);
    }
  });

  it('never lists a stat that contributes nothing', () => {
    for (const rarity of RARITIES) {
      for (let seed = 1; seed <= 50; seed += 1) {
        const { statBonus } = rollItem(template({ rarity }), 20, seed);
        for (const value of Object.values(statBonus)) {
          expect(value).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never puts everything in one stat at the top tier', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 100; seed += 1) {
      counts.add(Object.keys(rollItem(template({ rarity: 'LEGENDARY' }), 20, seed).statBonus).length);
    }
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
  });
});

describe('the ladder holds on average but OVERLAPS at the edges', () => {
  function averageTotal(rarity: Rarity, samples = 300): number {
    let sum = 0;
    for (let seed = 1; seed <= samples; seed += 1) {
      sum += totalStats(rollItem(template({ rarity }), 20, seed));
    }
    return sum / samples;
  }

  it('each tier beats the one below it on average', () => {
    const averages = RARITIES.map(rarity => averageTotal(rarity));
    for (let index = 1; index < averages.length; index += 1) {
      expect(averages[index] as number).toBeGreaterThan(averages[index - 1] as number);
    }
  });

  function range(rarity: Rarity, samples = 400): { min: number; max: number } {
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (let seed = 1; seed <= samples; seed += 1) {
      const total = totalStats(rollItem(template({ rarity }), 20, seed));
      min = Math.min(min, total);
      max = Math.max(max, total);
    }
    return { min, max };
  }

  /**
   * THE POINT OF THE WHOLE MODULE. If the tiers never overlapped, colour would
   * be all the information an item carries, every item of a tier would be
   * interchangeable, and an auction house would have nothing to discover a
   * price for. A great blue beating a poor purple is what makes gear worth
   * reading.
   */
  it('UNCOMMON, RARE and EPIC overlap with their neighbours', () => {
    const uncommon = range('UNCOMMON');
    const rare = range('RARE');
    const epic = range('EPIC');

    expect(uncommon.max).toBeGreaterThan(rare.min);
    expect(rare.max).toBeGreaterThan(epic.min);
  });

  /**
   * And the two ends deliberately do NOT overlap. POOR is vendor fodder, so it
   * must never rival something worth wearing; LEGENDARY drops at weight 1
   * against POOR's 60, so luck on a purple must never substitute for it.
   */
  it('POOR never reaches UNCOMMON, and EPIC never reaches LEGENDARY', () => {
    expect(range('POOR').max).toBeLessThan(range('UNCOMMON').min);
    expect(range('EPIC').max).toBeLessThan(range('LEGENDARY').min);
  });
});

describe('set membership survives the roll', () => {
  it('carries setId through when the template has one', () => {
    expect(rollItem(template({ setId: 'set-ironbound' }), 20, 1).setId).toBe('set-ironbound');
  });

  it('omits it entirely when the template has none', () => {
    expect(rollItem(template(), 20, 1).setId).toBeUndefined();
  });
});
