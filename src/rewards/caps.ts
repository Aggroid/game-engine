/**
 * Effort caps — the duty-of-care layer of the economy.
 *
 * WHY CAPS EXIST, IN ORDER OF IMPORTANCE:
 *  1. SAFETY. An economy that pays linearly for volume is an economy that pays people to
 *     overtrain, and a progress bar is an unusually effective way to talk someone into a
 *     stress fracture. Past a sane daily load the game stops asking for more. This is not
 *     a monetisation lever and must never be sold as one.
 *  2. ANTI-FARMING. Manual entry and spoofed devices are unavoidable in this genre.
 *     A hard weekly ceiling makes an unlimited cheat worth a bounded amount, which turns
 *     cheating from an arms race into a non-problem.
 *
 * WHY THE REASON IS RETURNED RATHER THAN THE REWARD SILENTLY SHRINKING: "I trained and
 * got nothing" is the single most support-generating, most trust-destroying outcome in
 * this genre. The caller gets `rawEp`, `ep` and the reason so the UI can say "you have
 * hit this week's ceiling, rest up" instead of showing a mysterious zero.
 *
 * PURE AND CONTEXT-FED: today's and this week's totals arrive on `EngineContext`. The
 * engine has no store and no clock, and the training-day/week buckets are the caller's
 * product decision (see `EngineContext` in the contract) — which is exactly what makes a
 * ledger replay to the same hero forever.
 */
import type { CapReason, EngineContext } from '../contracts/types';

import {
  DAILY_DIMINISH_FACTOR,
  DAILY_SOFT_CAP_EP,
  WEEKLY_HARD_CAP_EP,
} from './constants';

/** What `applyCaps` returns: the EP actually payable, and why it was trimmed. */
export interface CapResult {
  /** EP payable after both caps. Integer, never negative, never greater than `rawEp`. */
  ep: number;
  /** Which cap did the trimming. Absent when nothing was capped. */
  capReason?: CapReason;
}

/**
 * Applies the daily soft cap and the weekly hard cap to a raw effort score.
 *
 * Daily: EP earned while the day's total is still under `DAILY_SOFT_CAP_EP` pays in full;
 * everything past that line is multiplied by `DAILY_DIMINISH_FACTOR`. A single session
 * can straddle the line, so it is split — paying the whole session at the taper just
 * because its last minute crossed the cap would punish the honest long-session user.
 *
 * Weekly: an absolute ceiling against `epThisWeek`. It is applied AFTER the daily taper
 * and reported in preference to it, because when both bind, the weekly one is the one the
 * user needs explained ("nothing more this week" is different advice from "less per hour").
 *
 * MONOTONIC BY CONSTRUCTION: more raw effort never yields less EP. A non-monotonic cap
 * would create a band where training more pays less, which is both absurd and exactly the
 * kind of thing a player finds before the test suite does.
 *
 * @param rawEp Uncapped effort points. Coerced to a non-negative integer defensively —
 *              the caps are the last thing between raw arithmetic and a durable ledger
 *              row, so a float or a negative here must not survive into hero state.
 * @param ctx   Carries `epToday` and `epThisWeek`, both already banked (post-cap) totals.
 * @returns The payable EP and, when trimmed, the reason.
 */
export function applyCaps(rawEp: number, ctx: EngineContext): CapResult {
  const bounded = Math.max(0, Math.trunc(rawEp));

  const dailyHeadroom = Math.max(0, DAILY_SOFT_CAP_EP - ctx.epToday);
  const atFullRate = Math.min(bounded, dailyHeadroom);
  const atTaperedRate = bounded - atFullRate;
  const afterDaily = atFullRate + Math.round(atTaperedRate * DAILY_DIMINISH_FACTOR);

  const weeklyHeadroom = Math.max(0, WEEKLY_HARD_CAP_EP - ctx.epThisWeek);
  const ep = Math.min(afterDaily, weeklyHeadroom);

  if (ep < afterDaily) {
    return { ep, capReason: 'WEEKLY_HARD' };
  }

  if (afterDaily < bounded) {
    return { ep, capReason: 'DAILY_SOFT' };
  }

  return { ep };
}
