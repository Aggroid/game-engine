import type { HeroClass } from '../contracts/types';
import { TALENT_TIER_POINT_STEP, talentPointsForLevel } from './constants';
import { TALENTS_BY_ID, TALENT_TREES, TREE_BY_TALENT_ID } from './trees';
import { SPECS_BY_CLASS, type SpecId, type TalentAllocation } from './types';

/**
 * Spending and validating talent points.
 *
 * PURE, and the SERVER'S authority. A client may render a tree and predict what
 * a point would do, but `canSpendPoint` is what decides — the same rule the
 * hero sheet is derived from, so a client that disagreed would be showing a
 * build the server will not honour.
 */

export type SpendRejection =
  | 'UNKNOWN_TALENT'
  | 'WRONG_CLASS'
  | 'NO_POINTS_LEFT'
  | 'MAX_RANK'
  | 'TIER_LOCKED';

export type SpendDecision =
  | { ok: true; rank: number }
  | { ok: false; reason: SpendRejection; /** Points needed in this tree, for TIER_LOCKED. */ needed?: number };

/** Total points spent across every tree. */
export function pointsSpent(allocation: TalentAllocation): number {
  let total = 0;
  for (const ranks of Object.values(allocation)) {
    // Guarded: a stored allocation is data, and data can be wrong.
    if (Number.isFinite(ranks) && ranks > 0) total += Math.trunc(ranks);
  }
  return total;
}

/** Points spent in ONE tree — the number tier gating is measured against. */
export function pointsInTree(allocation: TalentAllocation, specId: SpecId): number {
  let total = 0;
  for (const [talentId, ranks] of Object.entries(allocation)) {
    if (!Number.isFinite(ranks) || ranks <= 0) continue;
    if (TREE_BY_TALENT_ID[talentId]?.id === specId) total += Math.trunc(ranks);
  }
  return total;
}

/** Points a hero has left to spend. */
export function pointsAvailable(level: number, allocation: TalentAllocation): number {
  return Math.max(0, talentPointsForLevel(level) - pointsSpent(allocation));
}

/** Points that must sit in a tree before `tier` opens. */
export function pointsRequiredForTier(tier: number): number {
  return Math.max(0, (Math.trunc(tier) - 1) * TALENT_TIER_POINT_STEP);
}

/**
 * Whether one more point may go into `talentId`.
 *
 * ORDER OF REFUSALS IS DELIBERATE, and it is ordered by what the player can do
 * about it. "This is not your class" is permanent; "no points left" resolves by
 * levelling; "the tier is locked" resolves by spending points they already
 * have. Reporting the last one first would send somebody to train when the real
 * answer was to spend.
 */
export function canSpendPoint(input: {
  heroClass: HeroClass;
  level: number;
  allocation: TalentAllocation;
  talentId: string;
}): SpendDecision {
  const { heroClass, level, allocation, talentId } = input;

  const talent = TALENTS_BY_ID[talentId];
  const tree = TREE_BY_TALENT_ID[talentId];
  if (talent === undefined || tree === undefined) {
    return { ok: false, reason: 'UNKNOWN_TALENT' };
  }

  /*
   * A hero may only spend in their OWN class's three trees. Checked against
   * `SPECS_BY_CLASS` rather than the tree's own `heroClass` so that the class
   * and its spec list cannot drift apart silently.
   */
  if (!SPECS_BY_CLASS[heroClass].includes(tree.id)) {
    return { ok: false, reason: 'WRONG_CLASS' };
  }

  const current = Math.max(0, Math.trunc(allocation[talentId] ?? 0));
  if (current >= talent.maxRank) return { ok: false, reason: 'MAX_RANK' };

  if (pointsAvailable(level, allocation) <= 0) {
    return { ok: false, reason: 'NO_POINTS_LEFT' };
  }

  const needed = pointsRequiredForTier(talent.tier);
  if (pointsInTree(allocation, tree.id) < needed) {
    return { ok: false, reason: 'TIER_LOCKED', needed };
  }

  return { ok: true, rank: current + 1 };
}

/**
 * Spends a point, returning a NEW allocation.
 *
 * Throws on a refusal rather than returning the old map. A silent no-op here
 * would be a point the player believes they spent and a tree that does not show
 * it — and the caller has `canSpendPoint` to ask first.
 */
export function spendPoint(input: {
  heroClass: HeroClass;
  level: number;
  allocation: TalentAllocation;
  talentId: string;
}): TalentAllocation {
  const decision = canSpendPoint(input);
  if (!decision.ok) {
    throw new Error(`Cannot spend a point on ${input.talentId}: ${decision.reason}`);
  }
  return { ...input.allocation, [input.talentId]: decision.rank };
}

/**
 * Whether a whole stored allocation is legal for this hero.
 *
 * NEEDED BECAUSE AN ALLOCATION OUTLIVES THE RULES THAT MADE IT. A build that
 * was legal at level 40 is not legal after a content change that removes a
 * talent, and a build stored by a newer client may reference talents this
 * engine has never heard of. Validating the whole map — rather than trusting it
 * because each point was checked once, long ago — is what stops a stale build
 * silently inflating a hero's combat numbers.
 *
 * Deliberately does NOT check tier gating against spend ORDER: the order points
 * went in is not stored and cannot be reconstructed. What it checks is that the
 * FINAL shape is reachable, which is the property that matters.
 */
export function validateAllocation(input: {
  heroClass: HeroClass;
  level: number;
  allocation: TalentAllocation;
}): { ok: true } | { ok: false; reason: SpendRejection; talentId: string } {
  const { heroClass, level, allocation } = input;
  const classSpecs = SPECS_BY_CLASS[heroClass];

  for (const [talentId, ranks] of Object.entries(allocation)) {
    if (!Number.isFinite(ranks) || Math.trunc(ranks) <= 0) continue;

    const talent = TALENTS_BY_ID[talentId];
    const tree = TREE_BY_TALENT_ID[talentId];
    if (talent === undefined || tree === undefined) {
      return { ok: false, reason: 'UNKNOWN_TALENT', talentId };
    }
    if (!classSpecs.includes(tree.id)) {
      return { ok: false, reason: 'WRONG_CLASS', talentId };
    }
    if (Math.trunc(ranks) > talent.maxRank) {
      return { ok: false, reason: 'MAX_RANK', talentId };
    }
    /*
     * Tier gating measured against the tree's TOTAL, this talent's own points
     * included. A capstone needs ten points in its tree, and its own single
     * point is one of them — which is how it works while you are spending.
     */
    if (pointsInTree(allocation, tree.id) < pointsRequiredForTier(talent.tier)) {
      return { ok: false, reason: 'TIER_LOCKED', talentId };
    }
  }

  if (pointsSpent(allocation) > talentPointsForLevel(level)) {
    return { ok: false, reason: 'NO_POINTS_LEFT', talentId: '' };
  }

  return { ok: true };
}

/** The three trees a class may spend in. */
export function treesForClass(heroClass: HeroClass) {
  return SPECS_BY_CLASS[heroClass].map((specId) => TALENT_TREES[specId]);
}
