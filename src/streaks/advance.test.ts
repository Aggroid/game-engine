/**
 * Streak tests — the whole table, because every row of it is a churn decision.
 *
 * The property test at the bottom is the most valuable one in this file: `longest` must be
 * monotonic non-decreasing across ANY sequence of calls. It is the record of what the player
 * once did, and a mechanic that can quietly lower it is a mechanic that edits the past.
 */
import type { StreakState } from '../contracts/types';
import { createRandom, deepFreeze } from '../rewards/__fixtures__/support';

import { advanceStreak, createStreakState, streakMultiplier } from './advance';
import {
  GRACE_DAYS_PER_WEEK,
  STREAK_MULTIPLIER_MAX,
  STREAK_MULTIPLIER_PER_DAY,
  STREAK_START,
} from './constants';
import { dateFromDayNumber, dayNumberFromDate, daysBetween } from './dates';

/**
 * A mid-streak hero. The multiplier is DERIVED from `current` rather than passed in, so the
 * fixture cannot describe a state the engine would never have produced — a hand-written
 * multiplier that disagrees with the streak would make the no-op tests below meaningless.
 */
const state = (overrides: Partial<StreakState> = {}): StreakState => {
  const merged: StreakState = {
    ...createStreakState(),
    current: 3,
    longest: 9,
    lastQualifyingDate: '2026-03-14',
    ...overrides,
  };

  return { ...merged, multiplier: overrides.multiplier ?? streakMultiplier(merged.current) };
};

/** `offset` days after 2026-03-14, computed the same way the engine does. */
const day = (offset: number): string => dateFromDayNumber(dayNumberFromDate('2026-03-14') + offset);

describe('createStreakState', () => {
  it('starts a hero who has never trained with a full forgiveness budget', () => {
    expect(createStreakState()).toEqual({
      current: 0,
      longest: 0,
      lastQualifyingDate: null,
      graceRemaining: GRACE_DAYS_PER_WEEK,
      graceUsedOn: null,
      multiplier: 1,
    });
  });
});

describe('advanceStreak — the first qualifying day', () => {
  it('starts the streak', () => {
    const advanced = advanceStreak(createStreakState(), '2026-03-14', false);

    expect(advanced).toMatchObject({
      current: STREAK_START,
      longest: STREAK_START,
      lastQualifyingDate: '2026-03-14',
      graceRemaining: GRACE_DAYS_PER_WEEK,
      graceUsedOn: null,
    });
  });
});

describe('advanceStreak — consecutive days', () => {
  it('increments once per day, and tracks the longest run', () => {
    let current = createStreakState();
    const seen: number[] = [];

    for (let offset = 0; offset < 5; offset += 1) {
      current = advanceStreak(current, day(offset), false);
      seen.push(current.current);
    }

    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(current.longest).toBe(5);
    expect(current.graceRemaining).toBe(GRACE_DAYS_PER_WEEK);
    expect(current.graceUsedOn).toBeNull();
  });

  it('raises the multiplier as the streak grows', () => {
    const short = advanceStreak(state({ current: 1 }), day(1), false);
    const long = advanceStreak(state({ current: 20 }), day(1), false);

    expect(long.multiplier).toBeGreaterThan(short.multiplier);
  });
});

describe('advanceStreak — a repeated or backdated day', () => {
  it('is a no-op for a second session on the same day', () => {
    const before = state();
    expect(advanceStreak(before, before.lastQualifyingDate as string, false)).toEqual(before);
  });

  it('is a no-op for a session that arrives late from yesterday', () => {
    // A watch that was offline really does deliver yesterday's session after today's. Moving
    // `lastQualifyingDate` backwards would make tomorrow look like a gap.
    const before = state();
    const advanced = advanceStreak(before, day(-1), false);

    expect(advanced).toEqual(before);
    expect(advanced.lastQualifyingDate).toBe(before.lastQualifyingDate);
  });
});

describe('advanceStreak — a one-day gap', () => {
  it('SURVIVES on grace, and records the day that was forgiven', () => {
    const before = state({ graceRemaining: 1 });
    const advanced = advanceStreak(before, day(2), false);

    expect(advanced.current).toBe(before.current + 1);
    expect(advanced.graceRemaining).toBe(0);
    expect(advanced.graceUsedOn).toBe(day(1));
    expect(advanced.lastQualifyingDate).toBe(day(2));
  });

  it('breaks when the budget is spent — and keeps `longest` and the record of the spend', () => {
    const before = state({ graceRemaining: 0, graceUsedOn: '2026-03-08' });
    const advanced = advanceStreak(before, day(2), false);

    expect(advanced.current).toBe(STREAK_START);
    expect(advanced.longest).toBe(before.longest);
    expect(advanced.graceRemaining).toBe(0);
    expect(advanced.graceUsedOn).toBe('2026-03-08');
    expect(advanced.multiplier).toBe(1);
  });

  it('spends the budget once, not twice', () => {
    const first = advanceStreak(state({ graceRemaining: 1 }), day(2), false);
    const second = advanceStreak(first, day(4), false);

    expect(first.current).toBe(4);
    expect(second.current).toBe(STREAK_START);
    expect(second.longest).toBe(first.longest);
  });
});

describe('advanceStreak — a longer gap', () => {
  it.each([3, 4, 7, 30, 400])('breaks after a %s-day gap', (gap: number) => {
    const advanced = advanceStreak(state({ graceRemaining: 1 }), day(gap), false);

    expect(advanced.current).toBe(STREAK_START);
    expect(advanced.longest).toBe(9);
    // Grace is NOT spent on a gap it could never bridge — a hidden loss for nothing.
    expect(advanced.graceRemaining).toBe(1);
  });
});

describe('advanceStreak — the forgiveness budget', () => {
  it('refills on a new rolling week', () => {
    const spent = state({ graceRemaining: 0 });
    expect(advanceStreak(spent, day(1), true).graceRemaining).toBe(GRACE_DAYS_PER_WEEK);
  });

  it('does not refill within a week', () => {
    const spent = state({ graceRemaining: 0 });
    expect(advanceStreak(spent, day(1), false).graceRemaining).toBe(0);
  });

  it('refills in time to save the gap that crossed into the new week', () => {
    const spent = state({ graceRemaining: 0 });
    const advanced = advanceStreak(spent, day(2), true);

    expect(advanced.current).toBe(spent.current + 1);
    expect(advanced.graceRemaining).toBe(GRACE_DAYS_PER_WEEK - 1);
  });

  it('never banks more than one week of forgiveness', () => {
    let current = state({ graceRemaining: GRACE_DAYS_PER_WEEK });
    for (let week = 1; week <= 4; week += 1) {
      current = advanceStreak(current, day(week), true);
      expect(current.graceRemaining).toBe(GRACE_DAYS_PER_WEEK);
    }
  });
});

describe('advanceStreak — what a break may never cost', () => {
  it('never lowers `longest`', () => {
    const before = state({ current: 12, longest: 40, graceRemaining: 0 });
    expect(advanceStreak(before, day(10), false).longest).toBe(40);
  });

  it('raises `longest` only when the current run passes it', () => {
    const belowRecord = advanceStreak(state({ current: 3, longest: 9 }), day(1), false);
    expect(belowRecord.longest).toBe(9);

    const newRecord = advanceStreak(state({ current: 9, longest: 9 }), day(1), false);
    expect(newRecord.longest).toBe(10);
  });

  it('returns nothing but streak state — it cannot touch xp, gold or stats', () => {
    const advanced = advanceStreak(state(), day(1), false);
    expect(Object.keys(advanced).sort()).toEqual([
      'current',
      'graceRemaining',
      'graceUsedOn',
      'lastQualifyingDate',
      'longest',
      'multiplier',
    ]);
  });

  it('never mutates the state it was given', () => {
    const before = deepFreeze(state());
    expect(() => advanceStreak(before, day(1), false)).not.toThrow();
    expect(before.current).toBe(3);
  });
});

describe('streakMultiplier', () => {
  it('is neutral for a hero with no streak, and for the first day', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(STREAK_START)).toBe(1);
  });

  it('rises by the per-day rate', () => {
    expect(streakMultiplier(2)).toBeCloseTo(1 + STREAK_MULTIPLIER_PER_DAY, 10);
    expect(streakMultiplier(6)).toBeCloseTo(1 + 5 * STREAK_MULTIPLIER_PER_DAY, 10);
  });

  it('is free of binary floating-point noise, because players read it', () => {
    for (let current = 0; current < 60; current += 1) {
      const multiplier = streakMultiplier(current);
      expect(Math.round(multiplier * 100) / 100).toBe(multiplier);
    }
  });

  it('caps, so nobody has to train through an injury to protect a number', () => {
    expect(streakMultiplier(10000)).toBe(STREAK_MULTIPLIER_MAX);
  });

  it('is monotonic non-decreasing', () => {
    for (let current = 1; current < 200; current += 1) {
      expect(streakMultiplier(current + 1)).toBeGreaterThanOrEqual(streakMultiplier(current));
    }
  });
});

describe('advanceStreak — malformed input', () => {
  it('restarts rather than throwing on a date it cannot parse', () => {
    const advanced = advanceStreak(state(), 'not-a-date', false);
    expect(advanced.current).toBe(STREAK_START);
    expect(advanced.longest).toBe(9);
  });
});

describe('advanceStreak — property: `longest` is monotonic non-decreasing', () => {
  it('holds across any sequence of qualifying days, gaps, repeats and weeks', () => {
    const next = createRandom(20260817);
    let current = createStreakState();
    let seenLongest = 0;

    for (let step = 0; step < 4000; step += 1) {
      // Any jump from a backdated day to a month-long gap, and a new week one time in seven.
      const jump = Math.floor(next() * 12) - 2;
      const isNewWeek = next() < 1 / 7;
      const date =
        current.lastQualifyingDate === null
          ? day(step)
          : dateFromDayNumber(dayNumberFromDate(current.lastQualifyingDate) + jump);

      const advanced = advanceStreak(current, date, isNewWeek);

      expect(advanced.longest).toBeGreaterThanOrEqual(seenLongest);
      expect(advanced.longest).toBeGreaterThanOrEqual(advanced.current);
      expect(advanced.current).toBeGreaterThanOrEqual(0);
      expect(advanced.graceRemaining).toBeGreaterThanOrEqual(0);
      expect(advanced.graceRemaining).toBeLessThanOrEqual(GRACE_DAYS_PER_WEEK);
      expect(advanced.multiplier).toBeGreaterThanOrEqual(1);
      expect(advanced.multiplier).toBeLessThanOrEqual(STREAK_MULTIPLIER_MAX);

      seenLongest = advanced.longest;
      current = advanced;
    }

    // The walk actually exercised the interesting cases rather than one branch 4000 times.
    expect(seenLongest).toBeGreaterThan(2);
  });
});

describe('date arithmetic without `Date`', () => {
  it('round-trips every day of a leap year and its neighbours', () => {
    for (let offset = -400; offset < 1200; offset += 1) {
      const date = dateFromDayNumber(dayNumberFromDate('2024-01-01') + offset);
      expect(dayNumberFromDate(date)).toBe(dayNumberFromDate('2024-01-01') + offset);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('knows the epoch', () => {
    expect(dayNumberFromDate('1970-01-01')).toBe(0);
    expect(dateFromDayNumber(0)).toBe('1970-01-01');
  });

  it('counts a leap day, and skips the one a century does not have', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    // 1900 was not a leap year; 2000 was.
    expect(daysBetween('1900-02-28', '1900-03-01')).toBe(1);
    expect(daysBetween('2000-02-28', '2000-03-01')).toBe(2);
  });

  it('crosses a year boundary as one day', () => {
    expect(daysBetween('2024-12-31', '2025-01-01')).toBe(1);
  });

  it('is signed, so a backdated day is visible as one', () => {
    expect(daysBetween('2026-03-14', '2026-03-10')).toBe(-4);
    expect(daysBetween('2026-03-14', '2026-03-14')).toBe(0);
  });

  it('is immune to DST, which is the entire reason it exists', () => {
    // The last Sunday in March, when Europe/Sofia loses an hour: 23 real hours, one calendar day.
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1);
    expect(daysBetween('2026-03-29', '2026-03-30')).toBe(1);
    // And the October night that gains one.
    expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1);
    expect(daysBetween('2026-10-25', '2026-10-26')).toBe(1);
  });

  it('yields NaN for a string that is not a date, rather than throwing', () => {
    expect(dayNumberFromDate('nonsense')).toBeNaN();
    expect(daysBetween('2026-03-14', 'tomorrow-ish')).toBeNaN();
    expect(daysBetween('whenever', '2026-03-14')).toBeNaN();
  });

  it('handles dates before the epoch', () => {
    expect(daysBetween('1969-12-31', '1970-01-01')).toBe(1);
    expect(dateFromDayNumber(-1)).toBe('1969-12-31');
    expect(dayNumberFromDate('1900-01-01')).toBeLessThan(0);
  });
});
