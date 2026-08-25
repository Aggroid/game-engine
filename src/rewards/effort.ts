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
  EquippedItems,
  IntensityTier,
  Modality,
  StrengthSet,
} from '../contracts/types';
import { gearConversionMultiplier } from '../gear/setBonuses';

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
import { STRENGTH_MODALITY, setLogQualityMultiplier } from './setLog';

/** An intensity value together with the rung of the fidelity ladder that produced it. */
interface ResolvedIntensity {
  intensity: number;
  tier: IntensityTier;
}

/**
 * The optional extras a caller may know about a session, beyond what the device reported.
 *
 * WHY A BAG AND NOT MORE POSITIONAL PARAMETERS: both of these are genuinely optional and more
 * will follow (§ set logging landed after gear, and neither existed at M0). A third and fourth
 * positional optional would fossilise the order in which features happened to be built, and
 * every consumer would have to pass `undefined` to skip one. A bag also keeps this
 * additive — `computeEffortPoints(activity, ctx)` is still exactly what it was, which matters
 * because this package is a versioned git dependency in two other repositories.
 */
export interface EffortOptions {
  /**
   * The sets the user typed in for a strength session, if any. Earns the set-log quality
   * multiplier on strength work and is ignored for every other modality.
   */
  sets?: readonly StrengthSet[];
  /**
   * What the hero is wearing. Only ever read for `modalityConversionBonus` from ACTIVE set
   * bonuses — gear's stat bonuses belong to combat derivation, not to the reward economy,
   * or wearing a heavier chestplate would earn a player more XP for the same run.
   */
  equipped?: EquippedItems;
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
 * Two of the terms are OPTIONAL EXTRAS the device could never report (see `EffortOptions`):
 * a set-by-set log, which earns a quality multiplier on STRENGTH work only, and the hero's
 * equipment, whose active set bonuses may convert one modality more efficiently. Both default
 * to neutral, so `computeEffortPoints(activity, ctx)` scores exactly as it always did.
 *
 * @param activity One logged session, raw platform `activityType` and all.
 * @param ctx      The player and moment facts the engine may not look up for itself,
 *                 including the day's and week's banked EP that drive the caps.
 * @param options  Optional extras: logged sets, and what the hero is wearing.
 * @returns `rawEp` (pre-cap), `ep` (payable), the `intensityTier` and `modality` actually
 *          used, and a `capReason` when a cap trimmed the score.
 */
export function computeEffortPoints(
  activity: ActivityInput,
  ctx: EngineContext,
  options?: EffortOptions,
): EffortResult {
  const modality = normaliseModality(activity.activityType);
  const minutes = toMinutes(activity.durationSec);
  const { intensity, tier } = resolveIntensity(activity, ctx, modality);

  // Strength only. Anywhere else this is neutral, because anywhere else the work is already
  // measurable and the bonus would be paying for typing rather than for training.
  const setQuality =
    modality === STRENGTH_MODALITY
      ? setLogQualityMultiplier(options?.sets)
      : NEUTRAL_MULTIPLIER;

  const gearConversion = gearConversionMultiplier(options?.equipped, modality);

  const rawEp = Math.max(
    0,
    Math.round(
      minutes *
        intensity *
        MODALITY_WEIGHT[modality] *
        resolveModifiers(activity, ctx) *
        setQuality *
        gearConversion,
    ),
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
