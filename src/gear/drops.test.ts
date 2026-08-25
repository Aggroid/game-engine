/**
 * Drop roll tests.
 *
 * A drop is a durable, disputable event, so the first test is the important one: the same
 * seeded generator produces the same drops forever. The rest pin the two promises the drop
 * table makes to a player — the weights mean what they say, and nothing can drop that the
 * hero could not wear.
 */
import { RARITIES, type Item, type Rarity } from '../contracts/types';
import { createRandom } from '../rewards/__fixtures__/support';

import { ITEM_CATALOGUE, itemById } from './catalogue';
import { DEFAULT_RARITY_WEIGHTS, LEVEL_REQUIREMENT_BY_RARITY } from './constants';
import { DROP_POOL_BY_RARITY, eligibleDrops, rollDrop } from './drops';

/** A level nothing in the catalogue is gated above — every tier is reachable. */
const MAX_LEVEL = 99;

/** Enough rolls for a 1-in-100 rarity to land within a couple of points of its weight. */
const DISTRIBUTION_ROLLS = 40000;

/** Tolerance on each rarity's share, in percentage points of the whole. */
const DISTRIBUTION_TOLERANCE = 0.015;

const roll = (seed: number, count: number, heroLevel = MAX_LEVEL): Array<Item | null> => {
  const rng = createRandom(seed);
  return Array.from({ length: count }, () => rollDrop(rng, heroLevel));
};

describe('the drop pools', () => {
  it('bucket the whole catalogue and nothing else', () => {
    const pooled = RARITIES.flatMap((rarity) => DROP_POOL_BY_RARITY[rarity]);
    expect(pooled).toHaveLength(ITEM_CATALOGUE.length);
    expect(new Set(pooled.map((item) => item.id)).size).toBe(ITEM_CATALOGUE.length);
  });

  it.each(RARITIES)('put every %s item in its own bucket', (rarity: Rarity) => {
    for (const item of DROP_POOL_BY_RARITY[rarity]) {
      expect(item.rarity).toBe(rarity);
    }
  });

  it('filter to what the hero can actually wear', () => {
    expect(eligibleDrops('LEGENDARY', 1)).toEqual([]);
    expect(eligibleDrops('LEGENDARY', LEVEL_REQUIREMENT_BY_RARITY.LEGENDARY).length).toBeGreaterThan(0);
    expect(eligibleDrops('COMMON', 1).length).toBeGreaterThan(0);
  });
});

describe('rollDrop determinism', () => {
  it('produces an identical sequence for an identical seed', () => {
    expect(roll(20260817, 50)).toEqual(roll(20260817, 50));
  });

  it('produces a different sequence for a different seed', () => {
    expect(roll(1, 50)).not.toEqual(roll(2, 50));
  });

  it('consumes exactly two numbers per roll that finds an item', () => {
    let calls = 0;
    const rng = (): number => {
      calls += 1;
      return 0;
    };

    expect(rollDrop(rng, MAX_LEVEL)).not.toBeNull();
    expect(calls).toBe(2);
  });

  it('is a pure function of its arguments — no hidden state between rolls', () => {
    const first = rollDrop(createRandom(7), MAX_LEVEL);
    const second = rollDrop(createRandom(7), MAX_LEVEL);
    expect(first).toBe(second);
  });
});

describe('rollDrop rarity distribution', () => {
  it('roughly matches the configured weights over many rolls', () => {
    const rng = createRandom(4242);
    const counts: Record<Rarity, number> = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 };

    for (let i = 0; i < DISTRIBUTION_ROLLS; i += 1) {
      const item = rollDrop(rng, MAX_LEVEL);
      counts[(item as Item).rarity] += 1;
    }

    const totalWeight = RARITIES.reduce((sum, rarity) => sum + DEFAULT_RARITY_WEIGHTS[rarity], 0);
    for (const rarity of RARITIES) {
      const observed = counts[rarity] / DISTRIBUTION_ROLLS;
      const expected = DEFAULT_RARITY_WEIGHTS[rarity] / totalWeight;
      expect(Math.abs(observed - expected)).toBeLessThan(DISTRIBUTION_TOLERANCE);
    }
  });

  it('honours a caller override, keeping defaults for the rarities left out', () => {
    const rng = createRandom(99);
    const bossChest = { LEGENDARY: 1000 };
    const drops = Array.from({ length: 200 }, () => rollDrop(rng, MAX_LEVEL, bossChest));

    const legendary = drops.filter((item) => item?.rarity === 'LEGENDARY').length;
    // 1000 against the default 100 or so: almost everything, but the other tiers still exist.
    expect(legendary).toBeGreaterThan(180);
    expect(legendary).toBeLessThan(200);
  });

  it('lets a caller exclude a tier entirely by zeroing its weight', () => {
    const rng = createRandom(5);
    const drops = Array.from({ length: 500 }, () =>
      rollDrop(rng, MAX_LEVEL, { COMMON: 0, RARE: 0 }),
    );

    expect(drops.some((item) => item?.rarity === 'COMMON')).toBe(false);
    expect(drops.some((item) => item?.rarity === 'RARE')).toBe(false);
    expect(drops.every((item) => item !== null)).toBe(true);
  });

  it('returns null without touching the rng when every weight is zero', () => {
    let calls = 0;
    const rng = (): number => {
      calls += 1;
      return 0.5;
    };
    const noWeights = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 };

    expect(rollDrop(rng, MAX_LEVEL, noWeights)).toBeNull();
    expect(calls).toBe(0);
  });

  it('survives an out-of-contract rng that returns exactly 1', () => {
    const dropped = rollDrop(() => 1, MAX_LEVEL);
    // The tail of both draws: the last weighted rarity, and the last item in its pool.
    const mythic = DROP_POOL_BY_RARITY.MYTHIC;
    expect(dropped).toBe(mythic[mythic.length - 1]);
  });
});

describe('rollDrop level gating', () => {
  it('never hands a level 1 hero a level 18 item', () => {
    const legendary = itemById('windrunner-baton') as Item;
    expect(legendary.levelRequirement).toBe(18);

    const drops = roll(31337, 5000, 1);
    for (const item of drops) {
      if (item !== null) {
        expect(item.levelRequirement).toBeLessThanOrEqual(1);
      }
    }
    expect(drops).not.toContain(legendary);
  });

  it('returns null rather than falling back to a tier the hero has outgrown', () => {
    // A legendary rolled by a level 1 hero drops nothing at all: falling back to a common
    // would quietly make the low-level distribution richer than the weights say.
    expect(rollDrop(() => 0, 1, { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 1, MYTHIC: 0 })).toBeNull();
  });

  it('yields something for a level 1 hero more often than not', () => {
    const drops = roll(11, 1000, 1);
    const found = drops.filter((item) => item !== null).length;
    // COMMON alone is 60% of the weight, and every common is level 1.
    expect(found).toBeGreaterThan(500);
  });

  it('opens each tier up exactly at its level gate', () => {
    for (const rarity of RARITIES) {
      const gate = LEVEL_REQUIREMENT_BY_RARITY[rarity];
      const onlyThisTier = Object.fromEntries(
        RARITIES.map((other) => [other, other === rarity ? 1 : 0]),
      );

      expect(rollDrop(() => 0, gate - 1, onlyThisTier)).toBeNull();
      expect(rollDrop(() => 0, gate, onlyThisTier)).not.toBeNull();
    }
  });
});
