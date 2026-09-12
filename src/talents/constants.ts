/**
 * The rules a talent build has to satisfy. Tuning lives here, not in the trees.
 */

/**
 * Points a hero has to spend, given their level.
 *
 * ONE PER LEVEL-UP, so a level-1 hero has none: they have not levelled up yet.
 * Stated as a function rather than as `level - 1` at each call site, because
 * "how many points does level N give" is precisely the kind of rule that gets
 * copied and then diverges.
 */
export function talentPointsForLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.trunc(level) - 1);
}

/**
 * Points that must already sit in a tree before its next tier opens.
 *
 * Tier 1 is free, tier 2 needs 5 in that tree, tier 3 needs 10. THIS IS THE
 * RULE THAT MAKES THREE TREES PRODUCE MORE THAN THREE BUILDS: reaching a
 * capstone costs ten points that cannot be spent anywhere else, so going deep
 * is a real trade rather than a free label.
 *
 * Five is chosen against the tree shape: tier 1 holds two talents of three
 * ranks, so exactly filling tier 1 opens tier 2 with nothing left over. A
 * player who wants depth has no filler to buy on the way.
 */
export const TALENT_TIER_POINT_STEP = 5;

/** How many tiers each tree has. */
export const TALENT_MAX_TIER = 3;

/**
 * A capstone's rank cap.
 *
 * One rank, always: a capstone is a decision, and a decision with a slider is
 * a slider.
 */
export const CAPSTONE_MAX_RANK = 1;

/** Rank cap for everything that is not a capstone. */
export const STANDARD_MAX_RANK = 3;
