/**
 * ASCEND gear — THE TUNING SURFACE FOR EQUIPMENT.
 *
 * EVERY VALUE IN THIS FILE IS PROVISIONAL, pending the M0 economy spreadsheet. Same rule
 * as `rewards/constants.ts`: a rebalance of gear must be a diff of this file plus a bump
 * of `ENGINE_VERSION`, never an archaeology exercise across the logic.
 *
 * WHERE THE LINE BETWEEN THIS FILE AND `catalogue.ts` FALLS, AND WHY:
 *  - CONTENT lives in `catalogue.ts`: an item's id, name, slot, rarity and its own stat
 *    bonus. Those are inseparable from the item's identity — "Worn Barbell gives +3 STR"
 *    is what the item IS, and moving it here would leave a catalogue of empty husks.
 *  - CROSS-ITEM TUNING lives here: the level gate and shop price implied by a RARITY, the
 *    drop weights, and how many pieces a set bonus asks for. Those are dials that apply to
 *    every item at once, and every one of them is a number a designer will want to move
 *    without touching twenty-seven rows.
 *
 * The practical payoff is that no MYTHIC item can ever accidentally be sold for a COMMON
 * price, and no item can be given a hand-typed level gate that disagrees with its rarity:
 * the catalogue does not get to have an opinion about either.
 */
import type { Rarity } from '../contracts/types';

/* -------------------------------------------------------------------------- *
 * Rarity implications
 * -------------------------------------------------------------------------- */

/**
 * Minimum hero level for each rarity tier.
 *
 * Gear NEVER becomes obsolete in this game (§4.11) — the effort behind a piece was real, so
 * there is no expansion-style reset. The level gate is therefore the ONLY pacing tool left:
 * it decides when a piece enters a hero's life, not when it leaves it. The bands are wide on
 * purpose, so a LEGENDARY drop is an event a player remembers rather than a weekly event.
 */
export const LEVEL_REQUIREMENT_BY_RARITY: Readonly<Record<Rarity, number>> = {
  COMMON: 1,
  RARE: 6,
  EPIC: 12,
  LEGENDARY: 18,
  MYTHIC: 25,
};

/**
 * Shop price per rarity, or `null` for drop-only gear.
 *
 * Roughly quadrupling per tier, well ahead of `GOLD_PER_EP`, so that gear lags levels and
 * buying a tier up stays a deliberate saving decision rather than a Tuesday purchase.
 *
 * MYTHIC IS DELIBERATELY UNPRICED. It is the one tier that cannot be bought with volume,
 * because a top tier purchasable by grinding is a top tier that rewards overtraining — the
 * exact failure the daily and weekly caps exist to prevent.
 */
export const SHOP_PRICE_BY_RARITY: Readonly<Record<Rarity, number | null>> = {
  COMMON: 60,
  RARE: 240,
  EPIC: 900,
  LEGENDARY: 2600,
  MYTHIC: null,
};

/* -------------------------------------------------------------------------- *
 * Drops
 * -------------------------------------------------------------------------- */

/**
 * Relative weights of each rarity in a drop roll. Sums to 100, so a weight reads as a
 * percentage at a glance — which is what makes a rebalance conversation possible with
 * someone who does not read TypeScript.
 *
 * Weights, not probabilities, because a caller may pass its own partial override for a
 * boss chest or a first-week onboarding boost (see `rollDrop`), and weights compose under
 * override while probabilities would have to be renormalised by hand at every call site.
 */
export const DEFAULT_RARITY_WEIGHTS: Readonly<Record<Rarity, number>> = {
  COMMON: 60,
  RARE: 25,
  EPIC: 10,
  LEGENDARY: 4,
  MYTHIC: 1,
};

/* -------------------------------------------------------------------------- *
 * Set bonuses
 * -------------------------------------------------------------------------- */

/**
 * Pieces needed for the partial set bonus.
 *
 * Half a set. The partial tier exists so that a player who has three of six pieces is
 * already being rewarded for the set they are collecting — an all-or-nothing six-piece
 * bonus makes the first five pieces feel like nothing at all.
 */
export const SET_BONUS_PARTIAL_PIECES = 3;

/**
 * Pieces needed for the full set bonus — one item in every slot.
 *
 * Kept equal to `ITEM_SLOTS.length` so "full set" means what a player thinks it means.
 * Bonuses are CUMULATIVE: a six-piece hero holds both tiers at once, so the last piece
 * adds a bonus rather than swapping one out.
 */
export const SET_BONUS_FULL_PIECES = 6;
