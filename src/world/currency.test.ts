import { createRng } from '../battle/prng';
import { CURRENCY_FULL_EP, KEY_DROP_CHANCE, SIGIL_DROP_CHANCE } from './constants';
import { rollSessionCurrency } from './currency';

/**
 * These two odds are the ENTIRE coupling between training and the PVE world.
 * Nothing else in the game turns real effort into access, so the properties that
 * protect them are worth more than the numbers themselves.
 */

/** Rolls `count` sessions at this effort and totals what they yielded. */
function over(count: number, ep: number): { keys: number; sigils: number } {
  let keys = 0;
  let sigils = 0;
  for (let seed = 0; seed < count; seed += 1) {
    const drop = rollSessionCurrency(createRng(seed), ep);
    keys += drop.keys;
    sigils += drop.sigils;
  }
  return { keys, sigils };
}

describe('determinism', () => {
  it('yields the same result from the same seed, forever', () => {
    expect(rollSessionCurrency(createRng(42), 50)).toEqual(rollSessionCurrency(createRng(42), 50));
  });

  /*
   * BOTH DRAWS, ALWAYS — even for a session that earned nothing. A conditional
   * draw would make the stream position depend on the branch, and every later
   * roll from the same seed would shift.
   */
  it('consumes exactly two numbers whatever the effort', () => {
    for (const ep of [0, -1, 12, 45, 500, Number.NaN]) {
      let draws = 0;
      rollSessionCurrency(() => {
        draws += 1;
        return 0.5;
      }, ep);
      expect(draws).toBe(2);
    }
  });
});

describe('effort decides the odds', () => {
  it('pays nothing for a session that earned nothing', () => {
    for (const ep of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rollSessionCurrency(() => 0, ep)).toEqual({ keys: 0, sigils: 0 });
    }
  });

  /*
   * A ten-minute walk and an hour under the bar must not be the same lottery
   * ticket, or the optimal strategy becomes many tiny logged sessions — gameable,
   * and the opposite of what this game exists to reward.
   */
  it('tapers in proportion below a full session', () => {
    const small = over(400, CURRENCY_FULL_EP / 6);
    const full = over(400, CURRENCY_FULL_EP);
    expect(full.keys).toBeGreaterThan(small.keys);
  });

  it('does not keep paying above a full session', () => {
    expect(over(200, CURRENCY_FULL_EP).keys).toBe(over(200, CURRENCY_FULL_EP * 10).keys);
  });

  it('never grants a fraction of a key, because the ledger folds integers', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const drop = rollSessionCurrency(createRng(seed), 60);
      expect(Number.isInteger(drop.keys)).toBe(true);
      expect(Number.isInteger(drop.sigils)).toBe(true);
      expect(drop.keys).toBeLessThanOrEqual(1);
      expect(drop.sigils).toBeLessThanOrEqual(1);
    }
  });
});

describe('the shape of the promise', () => {
  /**
   * "Common enough that a regular trainer always has a run available" is a
   * promise about the WORST week, not the average one. Four sessions must
   * reliably produce enough keys to have somewhere to go.
   */
  it('gives a regular trainer a dungeon to run', () => {
    const { keys } = over(400, CURRENCY_FULL_EP);
    expect(keys / 400).toBeGreaterThan(0.6);
  });

  it('is never a certainty, because a thing that always happens is invisible', () => {
    expect(KEY_DROP_CHANCE).toBeLessThan(1);
    expect(over(400, CURRENCY_FULL_EP).keys).toBeLessThan(400);
  });

  /**
   * A sigil buys one attempt at the wall that means "go train". It has to be
   * worth walking up to — roughly one every two or three weeks of training.
   */
  it('keeps sigils genuinely scarce, an order below keys', () => {
    const { keys, sigils } = over(1000, CURRENCY_FULL_EP);
    expect(sigils).toBeLessThan(keys / 5);
    expect(SIGIL_DROP_CHANCE).toBeLessThan(KEY_DROP_CHANCE / 5);
    // Scarce, but not a myth: a thousand sessions must produce some.
    expect(sigils).toBeGreaterThan(0);
  });
});
