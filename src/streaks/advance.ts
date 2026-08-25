/**
 * Streaks, with forgiveness built in.
 *
 * WHAT A STREAK IS ALLOWED TO DO: multiply FUTURE effort, and nothing else.
 * WHAT IT IS NEVER ALLOWED TO DO: touch anything already earned. Breaking a streak costs the
 * multiplier and not one point of XP, gold, stats or gear, and `longest` — the record of what
 * the player once did — is never lowered by anything. That is not generosity, it is the same
 * append-only principle the ledger runs on: the past happened, and a game mechanic does not get
 * to edit it.
 *
 * THE FORGIVENESS BUDGET. A single missed day is absorbed automatically when `graceRemaining`
 * allows, and the returned state records `graceUsedOn` so the app can SAY SO ("your Tuesday was
 * covered"). Silent forgiveness would be worse than none: the player would learn that missing a
 * day sometimes matters and sometimes does not, and stop trusting the number. The budget refills
 * on a new rolling week, which the caller declares — the engine has no clock and no opinion about
 * when a week starts, exactly as with `EngineContext.localDate`.
 *
 * DATES ARE STRINGS AND ARE COMPARED ARITHMETICALLY (see `dates.ts`). No `Date`, no timezone, no
 * DST, so a streak recomputed on any machine in any region produces the same answer forever.
 */
import type { StreakState } from '../contracts/types';

import {
  GRACE_COVERABLE_GAP_DAYS,
  GRACE_DAYS_PER_WEEK,
  MULTIPLIER_PRECISION,
  STREAK_MULTIPLIER_MAX,
  STREAK_MULTIPLIER_PER_DAY,
  STREAK_START,
} from './constants';
import { dateFromDayNumber, dayNumberFromDate, daysBetween } from './dates';

/** The parts of a streak that a single qualifying day can move. `longest` is derived, never set. */
interface Advance {
  current: number;
  lastQualifyingDate: string | null;
  graceRemaining: number;
  graceUsedOn: string | null;
}

/**
 * The reward multiplier a streak of this length has earned.
 *
 * Exported because the app needs to show both today's multiplier and what tomorrow's would be
 * ("train tomorrow for x1.14"), and computing that in the client would be a second implementation
 * of a rule that must have exactly one.
 *
 * @param current Consecutive qualifying days. Zero (a hero who has never trained) is neutral.
 */
export function streakMultiplier(current: number): number {
  const earned = 1 + Math.max(0, current - STREAK_START) * STREAK_MULTIPLIER_PER_DAY;
  const rounded = Math.round(earned * MULTIPLIER_PRECISION) / MULTIPLIER_PRECISION;

  return Math.min(STREAK_MULTIPLIER_MAX, rounded);
}

/**
 * The streak state of a hero who has never trained.
 *
 * Starts with a full grace budget rather than an empty one: the forgiveness week is a rolling
 * one, and a brand-new player is the last person who should be one missed day from a reset.
 */
export function createStreakState(): StreakState {
  return {
    current: 0,
    longest: 0,
    lastQualifyingDate: null,
    graceRemaining: GRACE_DAYS_PER_WEEK,
    graceUsedOn: null,
    multiplier: streakMultiplier(0),
  };
}

/**
 * Works out what one qualifying day does to a streak. Pure decision, no state assembly.
 *
 * The gap cases, in the order they are tested:
 *  - NEVER TRAINED (`lastQualifyingDate === null`): the streak starts.
 *  - GAP <= 0: the same day logged twice, or a backdated session arriving late from a watch that
 *    was offline. Both are no-ops. A same-day second workout must not count as a second day, and
 *    a late arrival must never move `lastQualifyingDate` BACKWARDS — that would make tomorrow
 *    look like a gap and break a streak that never lapsed.
 *  - GAP === 1: the ordinary consecutive day.
 *  - GAP === `GRACE_COVERABLE_GAP_DAYS` WITH BUDGET: exactly one missed day, forgiven. The streak
 *    CONTINUES (it did not restart, so it increments by one, not two — the forgiven day is
 *    covered, not credited) and the missed day's date is recorded for the UI.
 *  - EVERYTHING ELSE: a break. Longer gaps do NOT spend the grace budget, because spending it on
 *    a gap it cannot bridge would be a hidden loss — the player would find their one forgiveness
 *    day gone having received nothing for it.
 */
function resolve(state: StreakState, qualifyingDate: string, graceRemaining: number): Advance {
  const last = state.lastQualifyingDate;

  if (last === null) {
    return {
      current: STREAK_START,
      lastQualifyingDate: qualifyingDate,
      graceRemaining,
      graceUsedOn: state.graceUsedOn,
    };
  }

  const gap = daysBetween(last, qualifyingDate);

  if (gap <= 0) {
    return {
      current: state.current,
      lastQualifyingDate: last,
      graceRemaining,
      graceUsedOn: state.graceUsedOn,
    };
  }

  if (gap === 1) {
    return {
      current: state.current + 1,
      lastQualifyingDate: qualifyingDate,
      graceRemaining,
      graceUsedOn: state.graceUsedOn,
    };
  }

  if (gap === GRACE_COVERABLE_GAP_DAYS && graceRemaining > 0) {
    return {
      current: state.current + 1,
      lastQualifyingDate: qualifyingDate,
      graceRemaining: graceRemaining - 1,
      // The day that was forgiven, not the day the forgiveness was spent on: the app can then
      // name it, and naming it is the entire point of surfacing this at all.
      graceUsedOn: dateFromDayNumber(dayNumberFromDate(qualifyingDate) - 1),
    };
  }

  return {
    current: STREAK_START,
    lastQualifyingDate: qualifyingDate,
    graceRemaining,
    // Deliberately CARRIED, not cleared: `graceUsedOn` is a record of when forgiveness was last
    // spent. Erasing it on a break would delete the explanation for a budget that is still down.
    graceUsedOn: state.graceUsedOn,
  };
}

/**
 * Advances a streak by one qualifying day.
 *
 * @param state          The streak as stored. NEVER mutated.
 * @param qualifyingDate The training day that qualified, `YYYY-MM-DD`, computed by the CALLER
 *                       from the user's own timezone and rollover rule.
 * @param isNewWeek      Does this day open a new rolling forgiveness week? The caller decides,
 *                       because the engine has no clock and "when does a week start" is a product
 *                       question (a Monday? seven days from signup?), not a maths one.
 * @returns A NEW `StreakState`. `longest` is `max(longest, current)` and can therefore only ever
 *          rise — no path through this function lowers it, and no path touches xp, gold or stats,
 *          which this function cannot even see.
 */
export function advanceStreak(
  state: StreakState,
  qualifyingDate: string,
  isNewWeek: boolean,
): StreakState {
  // Refill FIRST, so a fresh week's forgiveness is available to the very gap that crossed into
  // it. Refilling afterwards would break a streak on Monday and hand back a full budget in the
  // same breath, which is the least explainable outcome available.
  const graceRemaining = isNewWeek ? GRACE_DAYS_PER_WEEK : state.graceRemaining;

  const advance = resolve(state, qualifyingDate, graceRemaining);

  return {
    current: advance.current,
    longest: Math.max(state.longest, advance.current),
    lastQualifyingDate: advance.lastQualifyingDate,
    graceRemaining: advance.graceRemaining,
    graceUsedOn: advance.graceUsedOn,
    multiplier: streakMultiplier(advance.current),
  };
}
