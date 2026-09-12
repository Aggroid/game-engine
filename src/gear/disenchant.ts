import { STAT_BUDGET_MULTIPLIER_BY_RARITY } from './constants';
import type { Rarity } from '../contracts/types';

/**
 * Breaking an item down for gold.
 *
 * ============================================================================
 * A GOLD SOURCE, AND THE ONLY ONE THAT IS NOT TRAINING. SO: SMALL.
 * ============================================================================
 * The economy already mints gold every session and burns it in exactly two
 * places — the auction house's cut and re-rolling. Adding a third faucet needs
 * saying plainly rather than slipping in: this makes inflation slightly worse,
 * and it is worth it because the alternative is worse still.
 *
 * The alternative being the current state: a POOR item cannot be worn by
 * anyone who has outlevelled it, cannot be sold on the board (grey is excluded
 * so it does not bury real listings), and cannot be thrown away. It is a row in
 * your bag that exists to be scrolled past. Dead inventory is a tax on every
 * future screen that lists it.
 *
 * DELIBERATELY WORSE THAN SELLING. The value is a fraction of what the same
 * item fetches from a player, so disenchanting is what you do with junk and
 * never what you do with something good. If these two ever cross, the auction
 * house stops being the way to move gear.
 */

/** Gold per point of item level, before the rarity multiplier. */
export const DISENCHANT_GOLD_PER_ITEM_LEVEL = 2;

/** Floor, so breaking a level-1 grey is still worth the tap. */
export const DISENCHANT_MIN_GOLD = 3;

/**
 * Value of breaking an item down.
 *
 * Scales on the SAME rarity multiplier the stat budget uses, so a purple is
 * worth more than a green for exactly the reason it is better — one table, not
 * two that can disagree.
 *
 * Quality is deliberately NOT a factor. A well-rolled item should be sold, not
 * broken; paying more for a good roll would put the two in competition and make
 * the wrong choice sometimes correct.
 */
export function disenchantValue(rarity: Rarity, itemLevel: number): number {
  if (!Number.isFinite(itemLevel)) return DISENCHANT_MIN_GOLD;

  const level = Math.max(1, Math.trunc(itemLevel));
  const multiplier = STAT_BUDGET_MULTIPLIER_BY_RARITY[rarity] ?? 1;
  const raw = level * DISENCHANT_GOLD_PER_ITEM_LEVEL * multiplier;

  return Math.max(DISENCHANT_MIN_GOLD, Math.round(raw));
}
