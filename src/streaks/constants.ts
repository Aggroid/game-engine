/**
 * ASCEND streaks — THE TUNING SURFACE.
 *
 * PROVISIONAL, like every other tuning file here.
 *
 * THE ONE THING THESE NUMBERS MUST NEVER BUY: earned progress. A streak multiplies nothing that
 * has already been banked, and losing one takes nothing away — no XP, no gold, no stats, no
 * gear. Streak loss is the single biggest churn trigger in this category precisely because most
 * apps make it a punishment; here it costs the multiplier on FUTURE effort and not one point of
 * what the player already did in the real world.
 */

/**
 * Missed days forgiven per rolling week.
 *
 * ONE. A single unplanned day — a fever, a delayed flight, a newborn — is not a lapse in
 * training, it is a week. Forgiving it automatically (and TELLING the player it was forgiven,
 * via `graceUsedOn`) removes the one mechanic that reliably makes people quit an app they were
 * otherwise enjoying. More than one would make the streak meaningless; none makes it cruel.
 */
export const GRACE_DAYS_PER_WEEK = 1;

/**
 * The gap, in days, that grace can cover.
 *
 * Two day-numbers apart means exactly ONE missed day between two qualifying ones. Grace never
 * bridges a longer gap: a forgiveness budget that stretches to cover a fortnight is not
 * forgiveness, it is a streak that does not mean anything.
 */
export const GRACE_COVERABLE_GAP_DAYS = 2;

/** The value `current` resets to on a break, and the value a first-ever qualifying day sets. */
export const STREAK_START = 1;

/**
 * Extra multiplier earned per consecutive day.
 *
 * Small and linear: the reward for consistency should accrue over weeks, not deliver a jackpot
 * on day three. At 2% a day, a fortnight of training is worth about a quarter more.
 */
export const STREAK_MULTIPLIER_PER_DAY = 0.02;

/**
 * Ceiling on the streak multiplier.
 *
 * Reached at 26 consecutive days and held forever after. A ceiling exists so that a hero who has
 * trained for a year is not permanently, unreachably ahead of one who started last month — and,
 * more importantly, so that nobody feels they must train through an injury to protect a number
 * that is still going up.
 */
export const STREAK_MULTIPLIER_MAX = 1.5;

/**
 * Rounding grain for the multiplier — NOT tuning, an identity.
 *
 * `1 + 3 * 0.02` is `1.0600000000000001` in binary floating point. The multiplier is displayed to
 * players and multiplied into rewards, so it is rounded to two decimals here rather than leaking
 * that into a UI or a ledger.
 */
export const MULTIPLIER_PRECISION = 100;
