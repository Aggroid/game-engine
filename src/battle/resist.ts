import type { DamageType, ResistanceBlock } from '../contracts/types';
import { RESIST_CAP_PCT } from './constants';

/**
 * Resolving resistance into a number a blow can be scaled by.
 *
 * ============================================================================
 * ITS OWN LEAF MODULE, SHARED BY BOTH SIMULATORS.
 * ============================================================================
 * `simulate` and `simulateDuel` are deliberately separate turn loops, and the
 * one thing that must NOT differ between them is what a point of resistance is
 * worth. Two copies of the clamp would be two balance surfaces, and they would
 * drift the first time either was retuned — a player would find that frost
 * resistance did one thing against a creature and another against a hero.
 *
 * Zero imports beyond the contract and one constant, so it cannot participate in
 * a cycle — the same discipline `version.ts` keeps.
 */

/**
 * A hero or creature's resistance to one school, in percentage points.
 *
 * A school nobody warded is ABSENT from the block rather than zero, so this is
 * where absence becomes a number. Guarded against a stored block holding
 * something that is not one: a `NaN` here would make a whole battle `NaN`, and
 * that log would be permanently unreadable rather than merely wrong.
 */
export function resistanceAgainst(
  resistance: ResistanceBlock | undefined,
  school: DamageType,
): number {
  const value = resistance?.[school];
  return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}

/**
 * Caps resistance at the ceiling, so no build is ever immune.
 *
 * See `RESIST_CAP_PCT`: immunity to a school is a build that cannot lose to it,
 * which turns gear selection from a decision into a lookup.
 */
export function clampResist(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(RESIST_CAP_PCT, Math.max(0, pct));
}
