/**
 * ASCEND rewards — THE TUNING SURFACE.
 *
 * EVERY VALUE IN THIS FILE IS PROVISIONAL, pending the M0 economy spreadsheet.
 * They are first-principles placeholders chosen to sit in a sane range, not balanced
 * numbers. Replacing the lot must stay a ONE-FILE change: no tuning number may appear
 * anywhere else in `src/rewards`, so that a rebalance is a diff of this file plus a
 * bump of `ENGINE_VERSION`, and never an archaeology exercise across the logic.
 *
 * Anything derived from these values (a level threshold, an EP total) is computed, never
 * written down twice — a second copy is how an economy silently develops two truths.
 *
 * A change here changes the output of every reward-producing function, so it is a
 * versioned behaviour change: bump `ENGINE_VERSION`, never reuse a version number.
 */
import type { HeroClass, Modality, StatKey, TrustTier } from '../contracts/types';

/* -------------------------------------------------------------------------- *
 * Units and identities — NOT tuning.
 *
 * These are here so that no bare number appears in the logic at all, but they are
 * facts and algebraic identities, not dials. Nobody rebalances the length of a minute.
 * -------------------------------------------------------------------------- */

/** Seconds per minute. `ActivityInput` carries seconds; the EP formula is per minute. */
export const SECONDS_PER_MINUTE = 60;

/** The multiplicative identity — the value of "no modifier applied". */
export const NEUTRAL_MULTIPLIER = 1;

/* -------------------------------------------------------------------------- *
 * Intensity
 * -------------------------------------------------------------------------- */

/**
 * Published Compendium of Physical Activities MET values, one per normalised modality.
 *
 * MET is metabolic equivalent of task: multiples of resting metabolic rate. These are
 * real published figures rather than invented game numbers, which is what makes the
 * `MET_TABLE` tier defensible to a user ("we scored this as a 7.0 MET activity") and
 * what stops the tier ladder from being three flavours of guesswork.
 *
 * Each value is the mid-range figure for a typical recreational effort; a user going
 * harder or easier than typical is exactly what the higher-fidelity `HR_ZONES` tier is
 * for, and why MET sits BELOW it in the resolution order.
 *
 * `other` carries a value because the type demands one for every modality, but it is
 * deliberately never read: an unrecognised activity string is not evidence of any
 * particular metabolic cost, so `other` falls through to calories or the floor instead
 * of being scored off a number the engine just made up. See `effort.ts`.
 */
export const MET_TABLE: Readonly<Record<Modality, number>> = {
  strength: 5.0,
  cardio_steady: 7.0,
  cardio_intense: 9.8,
  sport_racket: 7.3,
  sport_team: 7.0,
  swim: 8.3,
  cycle: 7.5,
  mobility: 2.5,
  walk: 3.5,
  recovery: 2.0,
  other: 4.0,
};

/**
 * The MET value that maps to an intensity multiplier of exactly 1.0.
 *
 * 6.0 MET is the conventional boundary between moderate and vigorous activity, so an
 * hour of genuinely vigorous work is worth about an hour's EP and the multiplier stays
 * legible: a number near 1.0 means "a normal training hour".
 */
export const REFERENCE_MET = 6.0;

/**
 * Intensity used when NO signal at all is available — no heart rate, no recognised
 * activity type, no calories.
 *
 * Deliberately below 1.0 and above zero: the engine must never throw on, and never
 * zero out, a workout a user really did (patchy device data is normal, not fraud),
 * but an unevidenced session must not out-earn an evidenced one, or the floor becomes
 * the optimal way to log everything.
 */
export const INTENSITY_FLOOR = 0.5;

/** Lower clamp on any resolved intensity. Guards against sensor noise scoring near zero. */
export const INTENSITY_MIN = 0.4;

/**
 * Upper clamp on any resolved intensity.
 *
 * The single most important number for anti-farming on the calories tier: a device (or a
 * hand-edited payload) reporting an absurd kcal burn can never be worth more than twice
 * a normal training minute.
 */
export const INTENSITY_MAX = 2.0;

/**
 * Active kilocalories per minute that map to an intensity multiplier of 1.0.
 *
 * ~8 kcal/min is roughly a 6 MET hour for an average adult, which keeps the `CALORIES`
 * tier on the same scale as the `MET_TABLE` tier — the tiers must agree to within noise,
 * or a device backfill would look like a reward change to the user.
 */
export const KCAL_PER_MIN_REFERENCE = 8.0;

/**
 * The fraction of heart-rate RESERVE (Karvonen) that maps to intensity 1.0.
 *
 * 70% HRR is a solid tempo effort — the thing a training hour is measured against.
 */
export const REFERENCE_HR_RESERVE = 0.7;

/**
 * The fraction of MAX heart rate that maps to intensity 1.0, used when resting HR is
 * unknown and the reserve cannot be computed.
 *
 * Set so that a typical athlete scores the same on both HR routes (70% HRR and 75% HRmax
 * are the same effort for a normal resting rate): dropping from Karvonen to plain %max
 * must be a loss of PRECISION, not a change in payout.
 */
export const REFERENCE_HR_MAX_FRACTION = 0.75;

/* -------------------------------------------------------------------------- *
 * Modality worth
 * -------------------------------------------------------------------------- */

/**
 * What a minute of each modality is worth to the economy, before intensity.
 *
 * Intensity already captures how hard the minute was, so this dial captures what MET
 * cannot: adaptation value and grindability. Everything sits near 1.0 on purpose —
 * a wide spread here would tell players to train the spreadsheet instead of their sport.
 *
 * `walk` and `recovery` are held low not because they are worthless (they are the two
 * healthiest things on the list) but because they are the two easiest to accumulate
 * passively and semi-accidentally; a step count must not out-earn a session.
 */
export const MODALITY_WEIGHT: Readonly<Record<Modality, number>> = {
  strength: 1.1,
  cardio_steady: 1.0,
  cardio_intense: 1.1,
  sport_racket: 1.0,
  sport_team: 1.0,
  swim: 1.05,
  cycle: 0.95,
  mobility: 0.8,
  walk: 0.6,
  recovery: 0.6,
  other: 0.9,
};

/* -------------------------------------------------------------------------- *
 * Modifiers
 * -------------------------------------------------------------------------- */

/**
 * How much a session is worth by provenance.
 *
 * A fitness RPG is trivially cheatable through manual entry, and the only two ways to
 * handle that are to reject entries or to price them. Rejecting punishes the honest user
 * whose watch died mid-session, so the engine prices instead: manual work still counts,
 * it just counts for less. The spread is deliberately mild — a cheater has to work at
 * it either way, and an honest user must never feel accused.
 */
export const TRUST_MULTIPLIER: Readonly<Record<TrustTier, number>> = {
  DEVICE_VERIFIED: 1.0,
  APP_TRACKED: 0.95,
  MANUAL: 0.8,
};

/**
 * Ceiling of the nutrition buff, applied at `proteinAdequacy === 1`.
 *
 * Deliberately small and STRICTLY A BONUS — never a penalty. The engine models the real
 * fact that training without protein adapts worse, but an app that docks a user's reward
 * for under-eating is an app that coaches disordered eating. Upside only, and capped low
 * enough that logging food is a nudge rather than a second job.
 */
export const PROTEIN_ADEQUACY_MAX_BONUS = 0.15;

/**
 * Ceiling of the future set-log quality modifier — the reward for logging a strength
 * session set by set instead of dropping in a duration.
 *
 * RESERVED, not yet applied: `ActivityInput` carries no set data at M0, so nothing reads
 * this today. It lives here now so that when set logging lands, its dial is already in
 * the one file a rebalance touches, rather than being invented inline under deadline.
 */
export const SET_LOG_QUALITY_MAX = 1.25;

/* -------------------------------------------------------------------------- *
 * Caps — duty of care first, anti-farming second
 * -------------------------------------------------------------------------- */

/**
 * Daily EP past which further EP is taxed rather than paid in full.
 *
 * Roughly three to four hours of real training. THIS IS A SAFETY LIMIT BEFORE IT IS A
 * GAME LIMIT: an economy that pays linearly for volume pays users to overtrain, and the
 * first serious injury attributable to a progress bar is both a person hurt and an
 * existential product problem. Past this line the game stops asking for more.
 */
export const DAILY_SOFT_CAP_EP = 400;

/**
 * What EP beyond the daily soft cap is worth. Soft, not hard, so a genuine tournament
 * day or long hike still visibly counts for something.
 */
export const DAILY_DIMINISH_FACTOR = 0.4;

/**
 * Absolute weekly EP ceiling. Nothing earns past it.
 *
 * The soft cap can be defeated by simply training every day, so there is a hard line
 * behind it. Set near the weekly load of a committed amateur athlete: reaching it should
 * be an achievement, and exceeding it should be worth nothing at all, so that grinding —
 * and cheating — are pointless rather than merely inefficient.
 */
export const WEEKLY_HARD_CAP_EP = 2000;

/* -------------------------------------------------------------------------- *
 * EP conversion
 * -------------------------------------------------------------------------- */

/** XP granted per EP. EP is the single currency of real effort; XP is its progression face. */
export const XP_PER_EP = 1.0;

/** Gold granted per EP. Below XP so that gear lags levels and the shop stays a choice. */
export const GOLD_PER_EP = 0.5;

/**
 * Stat points granted per EP, before modality routing and class bias.
 *
 * Two orders of magnitude below XP on purpose: XP is the fast, visible dopamine loop,
 * stats are the slow build that makes a six-month-old hero mean something.
 */
export const STAT_POINTS_PER_EP = 0.05;

/* -------------------------------------------------------------------------- *
 * Level curve
 * -------------------------------------------------------------------------- */

/**
 * XP required to reach level 2, and the scale factor of the whole curve.
 *
 * At the provisional rates one solid training hour is roughly 70-110 EP, so level 2
 * lands inside the first or second real session — the new-user loop must close on day
 * one, before the habit exists.
 */
export const LEVEL_CURVE_BASE = 120;

/**
 * Curvature of the cumulative XP requirement.
 *
 * Superlinear, so levels stretch as a hero matures and a veteran's level means more than
 * a beginner's; kept well under 2 so the curve never becomes the wall where a real,
 * consistent trainee stops seeing movement.
 */
export const LEVEL_CURVE_EXPONENT = 1.55;

/* -------------------------------------------------------------------------- *
 * Routing tables
 *
 * These live here rather than in `routing.ts` for one reason: the repo invariant is that
 * every tuning value has exactly one home, and these are the highest-leverage tuning
 * values in the package — they decide what a workout BUILDS. `routing.ts` re-exports
 * them under the same names and owns the lookup logic, so importers may take them from
 * either module and a rebalance still touches one file.
 * -------------------------------------------------------------------------- */

/**
 * Which stats a modality builds, as a share of that activity's stat pool.
 *
 * Shares sum to ~1.0 per modality so that no modality is quietly worth more total stat
 * points than another — the modality's WORTH is `MODALITY_WEIGHT`'s job, and letting two
 * dials both control magnitude is how economies become impossible to reason about.
 *
 * Data, not logic: adding a modality is a row here, never a branch in a function.
 */
export const MODALITY_STAT_WEIGHTS: Readonly<
  Record<Modality, Readonly<Partial<Record<StatKey, number>>>>
> = {
  strength: { str: 0.6, vit: 0.4 },
  cardio_steady: { end: 0.7, vit: 0.3 },
  cardio_intense: { end: 0.5, agi: 0.3, foc: 0.2 },
  sport_racket: { agi: 0.5, end: 0.3, foc: 0.2 },
  sport_team: { agi: 0.35, end: 0.35, foc: 0.3 },
  swim: { end: 0.6, foc: 0.4 },
  cycle: { end: 0.7, str: 0.3 },
  mobility: { agi: 0.5, spi: 0.3, foc: 0.2 },
  walk: { end: 0.6, spi: 0.4 },
  recovery: { spi: 1.0 },
  other: { str: 0.2, agi: 0.2, end: 0.2, vit: 0.2, foc: 0.1, spi: 0.1 },
};

/** The bias applied when a class has no opinion about a modality. */
export const CLASS_BIAS_NEUTRAL = 1.0;

/**
 * How efficiently each class converts each modality. Omitted entries are neutral.
 *
 * This is the mechanic the whole game hangs off: the same workout is worth different
 * amounts to different heroes, so choosing a class is choosing a training identity
 * rather than a colour scheme. Every specialist therefore also carries a DELIBERATE
 * NEGLECT PENALTY on what it avoids — an upside with no downside is not a choice.
 *
 * The penalties are shallow (never below 0.8) because the modality a class is bad at is
 * still real exercise a real person did, and the app must not tell them it was worthless.
 *
 * PALADIN is the deliberate generalist: no specialism and NO penalty anywhere, plus the
 * only positive bias on `other`, so the player whose training does not fit the taxonomy
 * (or who does something different every week) has a class that rewards exactly that.
 * A true variety bonus needs a view across sessions, which `computeEffortPoints` — a
 * pure function of ONE activity — deliberately does not have.
 *
 * Data, not logic: rebalancing a class is editing a row, never touching a function.
 */
export const CLASS_MODALITY_BIAS: Readonly<
  Record<HeroClass, Readonly<Partial<Record<Modality, number>>>>
> = {
  WARRIOR: { strength: 1.25, cardio_intense: 1.05, swim: 0.9, mobility: 0.85, recovery: 0.8 },
  ROGUE: { cardio_intense: 1.25, sport_racket: 1.2, walk: 0.9, strength: 0.85, recovery: 0.85 },
  MAGE: { swim: 1.25, mobility: 1.2, cardio_intense: 0.95, sport_team: 0.9, strength: 0.8 },
  PRIEST: { recovery: 1.3, walk: 1.25, mobility: 1.1, strength: 0.9, cardio_intense: 0.85 },
  PALADIN: { other: 1.15, mobility: 1.05, walk: 1.05 },
};
