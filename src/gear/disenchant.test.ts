import { RARITIES, type Rarity } from '../contracts/types';
import { STAT_BUDGET_MULTIPLIER_BY_RARITY } from './constants';
import {
  DISENCHANT_MIN_GOLD,
  DISENCHANT_GOLD_PER_ITEM_LEVEL,
  disenchantValue,
} from './disenchant';
import { ITEM_CATALOGUE } from './catalogue';
import { rollItem } from './roll';

/**
 * A GOLD SOURCE, and the only one that is not training — so the tests are as
 * much about what it must stay BELOW as about what it pays.
 */

describe('what breaking an item is worth', () => {
  it('pays more for a higher item level', () => {
    expect(disenchantValue('UNCOMMON', 20)).toBeGreaterThan(disenchantValue('UNCOMMON', 5));
  });

  /** One table with the stat budget, so the two cannot disagree about tiers. */
  it('pays more for a better tier, on the same curve the stat budget uses', () => {
    const ordered = RARITIES.map((rarity: Rarity) => disenchantValue(rarity, 10));

    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]!).toBeGreaterThanOrEqual(ordered[i - 1]!);
    }
    expect(STAT_BUDGET_MULTIPLIER_BY_RARITY.LEGENDARY).toBeGreaterThan(
      STAT_BUDGET_MULTIPLIER_BY_RARITY.POOR,
    );
  });

  it('always pays something, so breaking a level-1 grey is worth the tap', () => {
    expect(disenchantValue('POOR', 1)).toBeGreaterThanOrEqual(DISENCHANT_MIN_GOLD);
    expect(disenchantValue('POOR', 0)).toBeGreaterThanOrEqual(DISENCHANT_MIN_GOLD);
  });

  it('is always a whole number of gold', () => {
    for (const rarity of RARITIES) {
      for (let level = 1; level <= 40; level += 1) {
        expect(Number.isInteger(disenchantValue(rarity, level))).toBe(true);
      }
    }
  });

  it('never returns NaN for a nonsense level', () => {
    expect(disenchantValue('RARE', Number.NaN)).toBe(DISENCHANT_MIN_GOLD);
  });

  /**
   * QUALITY IS NOT A FACTOR, on purpose. A well-rolled item should be SOLD, not
   * broken — paying more for a good roll would put the two in competition and
   * make the wrong choice sometimes correct.
   */
  it('pays the same whatever the roll', () => {
    const template = ITEM_CATALOGUE.find((item) => item.rarity === 'RARE')!;
    const good = rollItem(template, 10, 1);
    const bad = rollItem(template, 10, 999);

    expect(good.quality).not.toBe(bad.quality);
    expect(disenchantValue('RARE', good.itemLevel)).toBe(
      disenchantValue('RARE', bad.itemLevel),
    );
  });

  /**
   * ============================================================================
   * IT MUST STAY WELL BELOW WHAT A PLAYER WOULD PAY.
   * ============================================================================
   * If breaking an item ever beat selling it, the auction house stops being the
   * way gear moves. A green at level 10 is worth a handful of gold here and
   * hundreds on the board — this pins the order of magnitude, not the number.
   */
  it('is worth far less than a listing', () => {
    // The cheapest thing anyone may list, from `MIN_LISTING_PRICE` in the backend.
    const cheapestListing = 10;
    expect(disenchantValue('UNCOMMON', 10)).toBeLessThan(cheapestListing * 5);
  });

  it('states its own rate, so nothing has to hardcode it', () => {
    expect(DISENCHANT_GOLD_PER_ITEM_LEVEL).toBeGreaterThan(0);
  });
});
