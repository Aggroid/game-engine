/**
 * The set-log quality multiplier — what logging a strength session PROPERLY is worth.
 *
 * THE PRODUCT PROBLEM THIS SOLVES. No health platform exposes sets, reps or weights: HealthKit
 * hands over "traditional strength training, 47 minutes" and nothing else. So the engine cannot
 * tell a 47-minute session of five heavy squats from a 47-minute session of leaning on a rack,
 * and the modality weight has to price the average of the two. A player who does the work is
 * paid the same as a player who does not.
 *
 * Typing in your sets is the only way to close that gap, and it is genuine friction — a minute
 * of admin after every session — so it has to be worth something. It also must NEVER be
 * required: the contract makes `StrengthSet` optional everywhere, the game must feel complete
 * without it, and a player who logs nothing loses no EP at all. This is a bonus, never a
 * penalty, exactly like the protein modifier.
 *
 * THREE PROPERTIES, ALL LOAD-BEARING:
 *  1. STRENGTH ONLY. A modality whose worth is already measurable — a swim, a run, a walk — has
 *     nothing to gain here, and paying a bonus for typing set data against a swim would just be
 *     paying for typing. `computeEffortPoints` applies this to the strength portion alone.
 *  2. DIMINISHING AND UNREACHABLE. `work / (work + half)` is concave and asymptotic: one set
 *     cannot max it, the tenth set is worth less than the second, and no amount of logging ever
 *     reaches `SET_LOG_QUALITY_MAX`. A linear ramp with a cap would instead teach players the
 *     exact number of sets at which typing stops paying.
 *  3. SELF-REPORTED, THEREFORE BOUNDED. Because nobody can verify this data, the honest design
 *     is to make lying about it worth at most 25% rather than to attempt detection. A cheater
 *     gains a quarter; an honest user is never accused of anything.
 */
import type { Modality, StrengthSet } from '../contracts/types';

import {
  NEUTRAL_MULTIPLIER,
  SET_LOG_BODYWEIGHT_LOAD_KG,
  SET_LOG_HALF_CREDIT_WORK,
  SET_LOG_QUALITY_MAX,
} from './constants';

/**
 * The one modality set logging applies to.
 *
 * Named rather than inlined because it is load-bearing in `effort.ts`: it is the difference
 * between "a quality bonus for the work we cannot measure" and "a bonus for typing".
 */
export const STRENGTH_MODALITY: Modality = 'strength';

/**
 * Credited work for one set, in kilogram-reps.
 *
 * Non-finite or negative numbers are floored to zero rather than rejected. The schemas at the
 * backend boundary already refuse nonsense, but this package is imported directly too, and a
 * `NaN` here would propagate through the multiplier into `Math.round` and land a `NaN` in an
 * append-only ledger — the one failure this repo cannot recover from. A negative set is
 * clamped for the same reason it cannot simply be summed: negative work would let a crafted
 * payload cancel out real sets and hide the multiplier's own inputs.
 */
function creditedWork(set: StrengthSet): number {
  const reps = Number.isFinite(set.reps) ? Math.max(0, set.reps) : 0;
  const weight = Number.isFinite(set.weightKg) ? Math.max(0, set.weightKg) : 0;

  // A bodyweight movement is logged as 0 kg by contract — real work, priced accordingly.
  const load = weight > 0 ? weight : SET_LOG_BODYWEIGHT_LOAD_KG;

  return reps * load;
}

/**
 * The quality multiplier earned by a set-by-set log of a strength session.
 *
 * Pure, total, monotonic non-decreasing in the sets logged, and strictly below
 * `SET_LOG_QUALITY_MAX` for every finite input.
 *
 * @param sets The sets the user typed in, if any. `undefined` and `[]` both mean "not logged"
 *             and both return the neutral multiplier — absence of data is never a penalty.
 * @returns A multiplier in `[1, SET_LOG_QUALITY_MAX)`.
 */
export function setLogQualityMultiplier(sets?: readonly StrengthSet[]): number {
  let work = 0;
  for (const set of sets ?? []) {
    work += creditedWork(set);
  }

  const earnedShare = work / (work + SET_LOG_HALF_CREDIT_WORK);

  return NEUTRAL_MULTIPLIER + (SET_LOG_QUALITY_MAX - NEUTRAL_MULTIPLIER) * earnedShare;
}
