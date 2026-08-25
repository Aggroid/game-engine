/**
 * Calendar arithmetic on `YYYY-MM-DD` strings, WITHOUT `Date`.
 *
 * WHY NOT `new Date(...)`, WHICH WOULD BE ONE LINE:
 *  1. `npm run check:pure` bans it outright, and the ban is not a style rule — see (2) and (3).
 *  2. `new Date('2026-03-14')` parses as UTC midnight while `new Date(2026, 2, 14)` parses as
 *     LOCAL midnight, so the difference between two dates silently depends on the timezone of
 *     whatever machine ran the code. A streak recomputed on a server in a different region would
 *     produce a different answer from identical inputs, which is exactly the class of bug that
 *     makes a replayable ledger unreplayable.
 *  3. Across a DST boundary two calendar dates are 23 or 25 hours apart, so the obvious
 *     `(b - a) / 86400000` is off by a fraction of a day twice a year — in opposite directions.
 *     Rounding it hides the bug; flooring it breaks a streak.
 *
 * So dates are converted to a DAY NUMBER — days since 1970-01-01 — with pure integer arithmetic,
 * and compared as integers. The algorithm is Howard Hinnant's `days_from_civil`, which is exact
 * for every proleptic Gregorian date, handles leap years and centuries without a table, and has
 * no notion of time, timezone or clock. Subtracting two day numbers is exact by construction.
 *
 * The engine never invents a date: `qualifyingDate` arrives from the caller, which alone knows
 * the user's timezone and rollover rule (see `EngineContext.localDate`).
 */

/** Days from 1970-01-01 to 0000-03-01, the shift between the era epoch and the Unix epoch. */
const DAYS_FROM_ERA_TO_UNIX_EPOCH = 719468;

/** Days in a 400-year Gregorian era — the cycle over which the calendar repeats exactly. */
const DAYS_PER_ERA = 146097;

/** Years per era. */
const YEARS_PER_ERA = 400;

/** Days in a common year, before leap corrections. */
const DAYS_PER_COMMON_YEAR = 365;

/** The month the algorithm starts its year on, so that a leap day lands at the END of a year. */
const MARCH = 3;

/** Months per year — used to rotate January and February into the previous year. */
const MONTHS_PER_YEAR = 12;

/**
 * Converts a `YYYY-MM-DD` string to days since 1970-01-01.
 *
 * A malformed string yields `NaN`, deliberately and without throwing. The schemas at the backend
 * boundary already reject bad dates, and the callers here treat a `NaN` difference as "these two
 * days are not adjacent" — which restarts a streak. That is the correct degradation: the same
 * "never throw on a user's real data" rule the modality mapper follows, and a restarted streak
 * is recoverable where a thrown exception in a nightly job is a silent outage.
 */
export function dayNumberFromDate(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));

  // Rotate so that March is month 0: a leap day then falls on the last day of the year, and the
  // month-length pattern becomes a single linear formula instead of a lookup table.
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / YEARS_PER_ERA);
  const yearOfEra = shiftedYear - era * YEARS_PER_ERA;
  const shiftedMonth = month + (month > 2 ? -MARCH : MONTHS_PER_YEAR - MARCH);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * DAYS_PER_COMMON_YEAR +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;

  return era * DAYS_PER_ERA + dayOfEra - DAYS_FROM_ERA_TO_UNIX_EPOCH;
}

/**
 * The exact inverse of `dayNumberFromDate` — Hinnant's `civil_from_days`.
 *
 * Needed so that `graceUsedOn` can name the day that was actually forgiven ("we covered
 * Tuesday") rather than the day the forgiveness was spent on. That is the difference between a
 * message a player understands and one they have to work out.
 */
export function dateFromDayNumber(dayNumber: number): string {
  const shifted = dayNumber + DAYS_FROM_ERA_TO_UNIX_EPOCH;
  const era = Math.floor(shifted / DAYS_PER_ERA);
  const dayOfEra = shifted - era * DAYS_PER_ERA;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) /
      DAYS_PER_COMMON_YEAR,
  );
  const shiftedYear = yearOfEra + era * YEARS_PER_ERA;
  const dayOfYear =
    dayOfEra -
    (DAYS_PER_COMMON_YEAR * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth + (shiftedMonth < 10 ? MARCH : MARCH - MONTHS_PER_YEAR);
  const year = shiftedYear + (month <= 2 ? 1 : 0);

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Whole days from `from` to `to`. Negative when `to` is earlier — a late-syncing watch really
 * does deliver yesterday's session after today's, and the caller needs to be able to see that.
 *
 * @param from Earlier `YYYY-MM-DD`.
 * @param to   Later `YYYY-MM-DD`.
 * @returns An exact integer difference, or `NaN` if either string is not a date.
 */
export function daysBetween(from: string, to: string): number {
  return dayNumberFromDate(to) - dayNumberFromDate(from);
}
