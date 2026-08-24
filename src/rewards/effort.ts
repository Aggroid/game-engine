/**
 * Activity -> Effort Points. The one conversion the entire product rests on.
 *
 *     EP = durationMinutes * intensity * modalityWeight * modifiers   (rounded to integer)
 *
 * Duration is measured, modality is mapped, the modifiers are small and honest — so all
 * of the difficulty lives in ONE term: how hard was it? Real device data cannot answer
 * that consistently. Heart rate is missing whenever the strap was not worn, calories are
 * missing on some platforms and fabricated on others, and the activity type is a string
 * from a vocabulary nobody controls. So intensity resolves down a LADDER OF FIDELITY and
 * always records which rung it landed on:
 *
 *   1. HR_ZONES   measured physiology. Karvonen when resting HR is known, %max otherwise.
 *   2. MET_TABLE  published metabolic cost of the RECOGNISED activity type.
 *   3. CALORIES   the device's own kcal estimate, per minute.
 *   4. FLOOR      nothing at all. Pay a floor rate; never throw, never zero.
 *
 * WHY `MET_TABLE` OUTRANKS `CALORIES`: a published MET figure for a known activity is a
 * better estimate than a consumer device's kcal model, which is itself usually derived
 * from an activity type and a body mass. Calories rank third because they are the only
 * signal left when the engine does not even know what the user did.
 *
 * WHY THE TIER IS RETURNED: it is the difference between an unexplainable reward and an
 * explainable one ("no heart rate, no calories — floor rate applied, wear your watch next
 * time"), and it lets a later backfill be recognised as a FIDELITY UPGRADE rather than a
 * change of mind. Two identical-looking sessions scoring differently is a support ticket
 * unless the engine says why.
 *
 * Output is an INTEGER by repo invariant: floats fold order-dependently and would make a
 * replayed ledger disagree with the hero it produced.
 */
import type {
  ActivityInput,
  EffortResult,
  EngineContext,
  IntensityTier,
  Modality,
} from '../contracts/types';

import { applyCaps } from './caps';
import {
  INTENSITY_FLOOR,
  INTENSITY_MAX,
  INTENSITY_MIN,
  KCAL_PER_MIN_REFERENCE,
  MET_TABLE,
  MODALITY_WEIGHT,
  NEUTRAL_MULTIPLIER,
  PROTEIN_ADEQUACY_MAX_BONUS,
  REFERENCE_HR_MAX_FRACTION,
  REFERENCE_HR_RESERVE,
  REFERENCE_MET,
  SECONDS_PER_MINUTE,
  TRUST_MULTIPLIER,
} from './constants';
import { UNKNOWN_MODALITY, normaliseModality } from './modality';

/** An intensity value together with the rung of the fidelity ladder that produced it. */
interface ResolvedIntensity {
  intensity: number;
  tier: IntensityTier;
}

/**
 * Is this optional measurement present AND usable as a divisor or a rate?
 *
 * The schemas at the backend boundary already reject nonsense, but this package is also
 * imported directly and its own invariants must not depend on someone else validating
 * first. A `NaN` or a zero max heart rate slipping into a division produces `NaN` EP,
 * which rounds to `NaN`, lands in a ledger, and corrupts a hero permanently. Cheap guard,
 * catastrophic failure avoided.
 */
function isUsable(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

/** Holds any resolved intensity inside the sane band, whatever tier produced it. */
function clampIntensity(value: number): number {
  return Math.min(INTENSITY_MAX, Math.max(INTENSITY_MIN, value));
}

/** Whole seconds from the device -> minutes for the EP formula. Never negative. */
function toMinutes(durationSec: number): number {
  return Math.max(0, durationSec) / SECONDS_PER_MINUTE;
}

/**
 * Walks the fidelity ladder and returns the best intensity signal available.
 *
 * The `MET_TABLE` rung is SKIPPED for `UNKNOWN_MODALITY`. This is the important subtlety
 * in this file: the MET table has a row for every modality, so taking it unconditionally
 * would make the `CALORIES` and `FLOOR` rungs unreachable and turn "we have no idea what
 * this activity was" into a confident metabolic claim. An unrecognised string is evidence
 * of nothing, so the ladder keeps descending.
 */
function resolveIntensity(
  activity: ActivityInput,
  ctx: EngineContext,
  modality: Modality,
): ResolvedIntensity {
  const avgHr = activity.avgHr;
  const maxHr = ctx.maxHr;
  const restingHr = ctx.restingHr;

  if (isUsable(avgHr) && isUsable(maxHr)) {
    // Karvonen: the fraction of the heart rate RESERVE being used. Strictly better than
    // %max because it accounts for the individual's floor — the difference between a
    // resting 45 and a resting 70 is most of a training zone.
    if (isUsable(restingHr) && maxHr > restingHr) {
      const reserveUsed = (avgHr - restingHr) / (maxHr - restingHr);
      return {
        intensity: clampIntensity(reserveUsed / REFERENCE_HR_RESERVE),
        tier: 'HR_ZONES',
      };
    }

    return {
      intensity: clampIntensity(avgHr / maxHr / REFERENCE_HR_MAX_FRACTION),
      tier: 'HR_ZONES',
    };
  }

  if (modality !== UNKNOWN_MODALITY) {
    return {
      intensity: clampIntensity(MET_TABLE[modality] / REFERENCE_MET),
      tier: 'MET_TABLE',
    };
  }

  const activeKcal = activity.activeKcal;
  const minutes = toMinutes(activity.durationSec);
  if (isUsable(activeKcal) && minutes > 0) {
    return {
      intensity: clampIntensity(activeKcal / minutes / KCAL_PER_MIN_REFERENCE),
      tier: 'CALORIES',
    };
  }

  return { intensity: INTENSITY_FLOOR, tier: 'FLOOR' };
}

/**
 * The multiplicative modifiers: how much the engine trusts the record, and whether the
 * user actually fed the adaptation they trained for.
 *
 * Nutrition is UPSIDE ONLY. Unknown protein intake is not treated as zero protein —
 * absence of data is not evidence of a bad day, and an app that quietly docks rewards for
 * not logging food is an app that teaches people to log food compulsively.
 */
function resolveModifiers(activity: ActivityInput, ctx: EngineContext): number {
  const trust = TRUST_MULTIPLIER[activity.trustTier];

  const proteinAdequacy = ctx.proteinAdequacy;
  const nutrition = isUsable(proteinAdequacy)
    ? NEUTRAL_MULTIPLIER + Math.min(NEUTRAL_MULTIPLIER, proteinAdequacy) * PROTEIN_ADEQUACY_MAX_BONUS
    : NEUTRAL_MULTIPLIER;

  return trust * nutrition;
}

/**
 * Scores one logged activity.
 *
 * Pure, total and deterministic: same activity plus same context always yields the same
 * result, on any machine, in any year. Nothing is read from the environment and nothing
 * is thrown — a missing signal costs fidelity, never the reward.
 *
 * @param activity One logged session, raw platform `activityType` and all.
 * @param ctx      The player and moment facts the engine may not look up for itself,
 *                 including the day's and week's banked EP that drive the caps.
 * @returns `rawEp` (pre-cap), `ep` (payable), the `intensityTier` and `modality` actually
 *          used, and a `capReason` when a cap trimmed the score.
 */
export function computeEffortPoints(activity: ActivityInput, ctx: EngineContext): EffortResult {
  const modality = normaliseModality(activity.activityType);
  const minutes = toMinutes(activity.durationSec);
  const { intensity, tier } = resolveIntensity(activity, ctx, modality);

  const rawEp = Math.max(
    0,
    Math.round(minutes * intensity * MODALITY_WEIGHT[modality] * resolveModifiers(activity, ctx)),
  );

  const { ep, capReason } = applyCaps(rawEp, ctx);

  // Spread rather than assign: `exactOptionalPropertyTypes` makes an explicit
  // `capReason: undefined` a different thing from an absent key, and the contract says
  // absent means "nothing was capped".
  return {
    ep,
    rawEp,
    intensityTier: tier,
    modality,
    ...(capReason !== undefined ? { capReason } : {}),
  };
}
