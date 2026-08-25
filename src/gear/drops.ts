/**
 * Loot rolls.
 *
 * THE RNG IS AN ARGUMENT AND IS NEVER CREATED HERE. That is the same rule the battle
 * simulator lives by, for the same reason: a drop is a durable, disputable event ("the game
 * gave me nothing for that fight"), so it must be replayable from the seed that produced it.
 * A `Math.random()` — or even a `createRng()` — inside this module would make every historical
 * drop unreproducible, and `npm run check:pure` bans the first outright.
 *
 * The caller owns the seed AND the decision to roll at all: whether a battle win, a quest
 * completion or a levelling milestone deserves a roll is a game-design question this module
 * has no view on. Given a roll, this module answers only "what dropped".
 *
 * THE DROP TABLE IS THE CATALOGUE, bucketed by rarity. One table, not two: a separate drop
 * table would immediately drift from the catalogue, and the first symptom would be a
 * legendary that can drop but cannot be looked up.
 */
import type { Item, Rarity } from '../contracts/types';
import { RARITIES } from '../contracts/types';

import { ITEM_CATALOGUE } from './catalogue';
import { DEFAULT_RARITY_WEIGHTS } from './constants';

/**
 * The drop pools, in catalogue order within each rarity.
 *
 * Built once at module load, which is safe precisely because the catalogue is immutable data
 * — there is no clock, no environment and no I/O involved in deriving it.
 *
 * ORDER IS PART OF THE CONTRACT: a roll indexes into a pool, so reordering the catalogue
 * changes what a given seed drops. That is an `ENGINE_VERSION` bump, not a cosmetic edit.
 */
export const DROP_POOL_BY_RARITY: Readonly<Record<Rarity, readonly Item[]>> = Object.fromEntries(
  RARITIES.map((rarity): [Rarity, readonly Item[]] => [
    rarity,
    ITEM_CATALOGUE.filter((item) => item.rarity === rarity),
  ]),
) as Record<Rarity, readonly Item[]>;

/**
 * The items of one rarity a hero of this level could actually wear.
 *
 * @param rarity    The rarity band to look in.
 * @param heroLevel The hero's level. Items gated above it are excluded, never merely flagged.
 */
export function eligibleDrops(rarity: Rarity, heroLevel: number): readonly Item[] {
  return DROP_POOL_BY_RARITY[rarity].filter((item) => item.levelRequirement <= heroLevel);
}

/**
 * Draws a rarity from the weights, consuming exactly one number from `rng`.
 *
 * Walks `RARITIES` in canonical order and accumulates: a weight of zero is simply never
 * selected, so a caller can exclude a tier by zeroing it instead of having to know the shape of
 * the table. Returns `null` only for a weight table that sums to zero — a caller asking for
 * nothing gets nothing, and the `rng` is left untouched so no draw is silently consumed.
 */
function drawRarity(rng: () => number, weights: Readonly<Record<Rarity, number>>): Rarity | null {
  const total = RARITIES.reduce((sum, rarity) => sum + Math.max(0, weights[rarity]), 0);
  if (total <= 0) {
    return null;
  }

  const target = rng() * total;
  let cumulative = 0;

  for (const rarity of RARITIES) {
    cumulative += Math.max(0, weights[rarity]);
    if (target < cumulative) {
      return rarity;
    }
  }

  // Tail: reached only by an out-of-contract `rng` returning exactly 1. The `total > 0` guard
  // above guarantees at least one rarity carries weight, so the last of them always exists —
  // no `??` fallback here, because a fallback nothing can reach is untestable by construction.
  const weighted = RARITIES.filter((rarity) => weights[rarity] > 0);

  return weighted[weighted.length - 1] as Rarity;
}

/**
 * Rolls one item drop.
 *
 * TWO RNG DRAWS, IN A FIXED ORDER: rarity first, then which item of that rarity. Fixed
 * because the number and order of draws is itself versioned behaviour — insert a third draw
 * and every stored seed produces a different drop from then on.
 *
 * RETURNS `null` WHEN THE ROLLED RARITY HAS NOTHING THIS HERO CAN WEAR, and deliberately does
 * NOT re-roll into a lower tier. Falling back would quietly hand low-level heroes a richer
 * effective distribution than the weights say, which makes the weights untestable and the
 * economy unexplainable. "You were not high enough level for what dropped" is a thing the UI
 * can say; "the drop table lies below level 12" is not.
 *
 * @param rng          A generator of floats in `[0, 1)`, owned and seeded by the CALLER.
 * @param heroLevel    The hero's level. Nothing gated above it can ever be returned.
 * @param rarityWeights Optional partial override of `DEFAULT_RARITY_WEIGHTS` — a boss chest
 *                      or an onboarding boost. Rarities left out keep their default weight.
 * @returns The item that dropped, or `null` when nothing eligible was available.
 */
export function rollDrop(
  rng: () => number,
  heroLevel: number,
  rarityWeights?: Readonly<Partial<Record<Rarity, number>>>,
): Item | null {
  const weights: Record<Rarity, number> = Object.fromEntries(
    RARITIES.map((rarity): [Rarity, number] => [
      rarity,
      rarityWeights?.[rarity] ?? DEFAULT_RARITY_WEIGHTS[rarity],
    ]),
  ) as Record<Rarity, number>;

  const rarity = drawRarity(rng, weights);
  if (rarity === null) {
    return null;
  }

  const pool = eligibleDrops(rarity, heroLevel);
  if (pool.length === 0) {
    return null;
  }

  // Clamped because `rng` is a caller-supplied function: the contract says `[0, 1)`, but a
  // sloppy implementation returning exactly 1 must not index off the end of the pool.
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));

  return pool[index] as Item;
}
