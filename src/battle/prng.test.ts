/**
 * The PRNG is the foundation the whole replay guarantee sits on: if this drifts, every
 * stored `BattleLog` in the database becomes unverifiable at once.
 */
import { createRng } from './prng';

const draw = (seed: number, count: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng());
};

describe('createRng', () => {
  it('produces an identical sequence for the same seed', () => {
    expect(draw(1234, 50)).toEqual(draw(1234, 50));
  });

  it('produces the same sequence from two generators drawn in lockstep', () => {
    const a = createRng(99);
    const b = createRng(99);
    for (let i = 0; i < 100; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it('diverges for different seeds', () => {
    const a = draw(1, 20);
    const b = draw(2, 20);
    expect(a).not.toEqual(b);
    // Not merely a shifted stream: no value should coincide by construction.
    expect(a.filter((v, i) => v === b[i])).toHaveLength(0);
  });

  it('advances — consecutive draws from one generator differ', () => {
    const rng = createRng(7);
    const values = new Set(Array.from({ length: 1000 }, () => rng()));
    // A stuck generator would collapse to a handful of values.
    expect(values.size).toBeGreaterThan(990);
  });

  it('stays within [0, 1) over many draws', () => {
    // Aggregated rather than asserted per draw: a hundred thousand `expect` calls is a slow
    // test, and min/max/finiteness carry exactly the same information.
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let allFinite = true;
    for (const seed of [0, 1, 42, 65535, 2 ** 31, 4294967295]) {
      const rng = createRng(seed);
      for (let i = 0; i < 20000; i += 1) {
        const value = rng();
        if (value < min) min = value;
        if (value > max) max = value;
        if (!Number.isFinite(value)) allFinite = false;
      }
    }
    expect(allFinite).toBe(true);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    // Sanity: the range is actually used, not clustered in a corner of it.
    expect(min).toBeLessThan(0.001);
    expect(max).toBeGreaterThan(0.999);
  });

  it('is roughly uniform across ten buckets', () => {
    const buckets = new Array<number>(10).fill(0);
    const rng = createRng(20240817);
    const draws = 100000;
    for (let i = 0; i < draws; i += 1) {
      const bucket = Math.floor(rng() * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    const expected = draws / 10;
    for (const count of buckets) {
      // ±5% of the expected bucket size — loose enough never to flake, tight enough to
      // catch a generator that has collapsed into part of the range.
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.05);
    }
  });

  it('coerces unusual seeds to a uint32 rather than misbehaving', () => {
    // A caller must not be able to break a battle with a negative or fractional seed.
    expect(draw(-1, 5)).toEqual(draw(4294967295, 5));
    expect(draw(1.5, 5)).toEqual(draw(1, 5));
    expect(draw(2 ** 32 + 3, 5)).toEqual(draw(3, 5));
  });

  it('is a pinned sequence — changing it is a SIM_VERSION bump', () => {
    // Frozen on purpose: this is the tripwire for someone "improving" the algorithm and
    // silently invalidating every historical battle log.
    expect(draw(1, 5)).toMatchSnapshot();
  });
});
