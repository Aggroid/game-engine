import { hashToSeed, partSeed } from './seed';

/**
 * A run stores ONE seed and re-derives everything from it — but it is fought out
 * of order, so the caller must be able to ask "what is behind THIS node?" without
 * walking the stream from the start. These are the properties that makes safe.
 */
describe('hashToSeed', () => {
  it('is stable for the same string, forever', () => {
    expect(hashToSeed('f3-n2')).toBe(hashToSeed('f3-n2'));
  });

  it('always returns a uint32, which is what the PRNG takes', () => {
    for (const value of ['', 'a', 'f10-n3-e2', '🜂 non-ascii', 'x'.repeat(500)]) {
      const seed = hashToSeed(value);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });

  it('does not throw on an empty string, which would be a way to crash a run', () => {
    expect(() => hashToSeed('')).not.toThrow();
  });

  it('spreads: near-identical node ids do not collide', () => {
    const ids = [];
    for (let floor = 1; floor <= 10; floor += 1) {
      for (let node = 1; node <= 3; node += 1) ids.push(`f${floor}-n${node}`);
    }
    const seeds = ids.map(hashToSeed);
    expect(new Set(seeds).size).toBe(ids.length);
  });
});

describe('partSeed', () => {
  it('is stable for the same run and the same part', () => {
    expect(partSeed(99, 'f2-n1')).toBe(partSeed(99, 'f2-n1'));
  });

  it('differs between two parts of one run, and between two runs', () => {
    expect(partSeed(99, 'f2-n1')).not.toBe(partSeed(99, 'f2-n2'));
    expect(partSeed(99, 'f2-n1')).not.toBe(partSeed(100, 'f2-n1'));
  });

  /*
   * A separator that cannot appear in an id. Without it ('a','bc') and
   * ('ab','c') would seed identically — two different doors reliably hiding the
   * same fight, which reads as a bug in the dungeon rather than in a hash.
   */
  it('cannot be collided by re-splitting the parts', () => {
    expect(partSeed(1, 'a', 'bc')).not.toBe(partSeed(1, 'ab', 'c'));
  });

  it('survives a nonsensical run seed rather than propagating NaN', () => {
    expect(Number.isInteger(partSeed(Number.NaN, 'f1-n1'))).toBe(true);
    expect(Number.isInteger(partSeed(-1.5, 'f1-n1'))).toBe(true);
  });
});
