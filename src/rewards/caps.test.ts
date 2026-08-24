/**
 * Cap tests.
 *
 * These guard a SAFETY behaviour before a game behaviour: the caps are what stop the app
 * paying people to overtrain. A regression here is not a balance bug, it is a duty-of-care
 * failure, so the seven-day burst test below is deliberately written as an attack.
 */
import { ACTIVITY_TYPE_BY_MODALITY, activity, context, createRandom } from './__fixtures__/support';
import { applyCaps } from './caps';
import { DAILY_DIMINISH_FACTOR, DAILY_SOFT_CAP_EP, WEEKLY_HARD_CAP_EP } from './constants';
import { computeEffortPoints } from './effort';

describe('applyCaps — the daily soft cap', () => {
  it('leaves a normal session completely alone', () => {
    expect(applyCaps(120, context())).toEqual({ ep: 120 });
  });

  it('reports no reason when nothing was capped', () => {
    expect(applyCaps(120, context()).capReason).toBeUndefined();
  });

  it('splits a session that straddles the soft cap instead of tapering all of it', () => {
    const alreadyBanked = DAILY_SOFT_CAP_EP - 50;
    const result = applyCaps(150, context({ epToday: alreadyBanked }));

    // 50 EP of headroom at full rate, the remaining 100 at the taper.
    expect(result).toEqual({
      ep: 50 + Math.round(100 * DAILY_DIMINISH_FACTOR),
      capReason: 'DAILY_SOFT',
    });
  });

  it('tapers the whole session once the day is already past the soft cap', () => {
    const result = applyCaps(100, context({ epToday: DAILY_SOFT_CAP_EP }));

    expect(result).toEqual({ ep: Math.round(100 * DAILY_DIMINISH_FACTOR), capReason: 'DAILY_SOFT' });
  });

  it('still pays something well past the cap — a real long day is not worth zero', () => {
    const result = applyCaps(300, context({ epToday: DAILY_SOFT_CAP_EP * 2 }));

    expect(result.ep).toBeGreaterThan(0);
    expect(result.capReason).toBe('DAILY_SOFT');
  });
});

describe('applyCaps — the weekly hard cap', () => {
  it('trims to the remaining weekly headroom and says so', () => {
    const result = applyCaps(100, context({ epThisWeek: WEEKLY_HARD_CAP_EP - 30 }));

    expect(result).toEqual({ ep: 30, capReason: 'WEEKLY_HARD' });
  });

  it('pays exactly nothing once the week is spent', () => {
    const result = applyCaps(500, context({ epThisWeek: WEEKLY_HARD_CAP_EP }));

    expect(result).toEqual({ ep: 0, capReason: 'WEEKLY_HARD' });
  });

  it('cannot be exceeded even by an absurd single session', () => {
    const result = applyCaps(Number.MAX_SAFE_INTEGER, context());

    expect(result.ep).toBeLessThanOrEqual(WEEKLY_HARD_CAP_EP);
  });

  it('reports the weekly cap in preference to the daily one when both bind', () => {
    const result = applyCaps(
      500,
      context({ epToday: DAILY_SOFT_CAP_EP, epThisWeek: WEEKLY_HARD_CAP_EP - 10 }),
    );

    // The user needs "nothing more this week", not "less per hour" — different advice.
    expect(result).toEqual({ ep: 10, capReason: 'WEEKLY_HARD' });
  });
});

describe('applyCaps — defensive normalisation', () => {
  it('never returns a negative payout', () => {
    expect(applyCaps(-500, context())).toEqual({ ep: 0 });
  });

  it('never lets a fractional score into the ledger', () => {
    expect(applyCaps(120.9, context())).toEqual({ ep: 120 });
  });

  it('is monotonic non-decreasing in raw effort at every point on the curve', () => {
    for (const epToday of [0, DAILY_SOFT_CAP_EP - 25, DAILY_SOFT_CAP_EP, DAILY_SOFT_CAP_EP * 3]) {
      for (const epThisWeek of [0, WEEKLY_HARD_CAP_EP - 100, WEEKLY_HARD_CAP_EP]) {
        const ctx = context({ epToday, epThisWeek });
        let previous = -1;

        for (let rawEp = 0; rawEp <= 900; rawEp += 1) {
          const { ep } = applyCaps(rawEp, ctx);
          expect(ep).toBeGreaterThanOrEqual(previous);
          previous = ep;
        }
      }
    }
  });

  it('never pays more than was earned', () => {
    const next = createRandom(99);

    for (let i = 0; i < 1000; i += 1) {
      const rawEp = Math.floor(next() * 3000);
      const { ep } = applyCaps(
        rawEp,
        context({
          epToday: Math.floor(next() * 1200),
          epThisWeek: Math.floor(next() * 3000),
        }),
      );

      expect(ep).toBeLessThanOrEqual(rawEp);
      expect(Number.isInteger(ep)).toBe(true);
    }
  });
});

describe('the caps under a seven-day burst', () => {
  it('holds the weekly ceiling against someone training all day, every day', () => {
    const hard = ACTIVITY_TYPE_BY_MODALITY.cardio_intense;
    let epThisWeek = 0;
    const dailyTotals: number[] = [];
    const reasons: Array<string | undefined> = [];

    for (let day = 0; day < 7; day += 1) {
      let epToday = 0;

      // Four two-hour sessions a day, every day. Nobody should be doing this.
      for (let session = 0; session < 4; session += 1) {
        const result = computeEffortPoints(
          activity({ activityType: hard, durationSec: 2 * 3600 }),
          context({ epToday, epThisWeek }),
        );

        epToday += result.ep;
        epThisWeek += result.ep;
        reasons.push(result.capReason);
      }

      dailyTotals.push(epToday);
    }

    expect(epThisWeek).toBeLessThanOrEqual(WEEKLY_HARD_CAP_EP);
    expect(epThisWeek).toBe(WEEKLY_HARD_CAP_EP);

    // The week degrades: each day is worth no more than the one before it.
    for (let day = 1; day < dailyTotals.length; day += 1) {
      expect(dailyTotals[day] as number).toBeLessThanOrEqual(dailyTotals[day - 1] as number);
    }

    // ...and the last day pays literally nothing, with the reason attached so the app can
    // say why rather than showing a silent zero.
    expect(dailyTotals[6]).toBe(0);
    expect(reasons[reasons.length - 1]).toBe('WEEKLY_HARD');
    expect(dailyTotals).toMatchSnapshot();
  });

  it('rewards a sane week far better per hour than an insane one', () => {
    const hard = ACTIVITY_TYPE_BY_MODALITY.cardio_intense;

    const scoreWeek = (sessionsPerDay: number, hours: number): number => {
      let epThisWeek = 0;

      for (let day = 0; day < 7; day += 1) {
        let epToday = 0;
        for (let session = 0; session < sessionsPerDay; session += 1) {
          const result = computeEffortPoints(
            activity({ activityType: hard, durationSec: hours * 3600 }),
            context({ epToday, epThisWeek }),
          );
          epToday += result.ep;
          epThisWeek += result.ep;
        }
      }

      return epThisWeek;
    };

    const sane = scoreWeek(1, 1);
    const insane = scoreWeek(4, 2);

    expect(insane / (7 * 4 * 2)).toBeLessThan(sane / (7 * 1 * 1));
  });
});
