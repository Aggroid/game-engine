/**
 * Effort scoring tests.
 *
 * The snapshot matrix at the top is the regression net: every modality crossed with every
 * available-signal combination, so ANY change to a MET value, a modality weight, a
 * reference constant or the resolution order shows up as a reviewable diff rather than as
 * a quiet economy shift nobody notices until players do.
 */
import {
  MODALITIES,
  type ActivityInput,
  type EngineContext,
  type EquippedItems,
  type Modality,
} from '../contracts/types';
import { IRONBOUND_SET_ID, WINDRUNNER_SET_ID, itemsInSet } from '../gear/catalogue';

import { ACTIVITY_TYPE_BY_MODALITY, activity, context, createRandom } from './__fixtures__/support';
import {
  DAILY_SOFT_CAP_EP,
  INTENSITY_FLOOR,
  INTENSITY_MAX,
  INTENSITY_MIN,
  MET_TABLE,
  MODALITY_WEIGHT,
  PROTEIN_ADEQUACY_MAX_BONUS,
  REFERENCE_MET,
} from './constants';
import { computeEffortPoints } from './effort';

/** 30 minutes: long enough to be a real session, short enough never to reach a cap. */
const HALF_HOUR_SEC = 1800;
const ONE_HOUR_SEC = 3600;

/**
 * The four signal combinations a device can hand over, named for the tier they are MEANT
 * to reach. Which tier they actually reach depends on whether the activity type was
 * recognised, and pinning that down is the point of the matrix.
 */
const SIGNAL_SETS = {
  'hr + maxHr + restingHr': {
    activity: { avgHr: 150 } satisfies Partial<ActivityInput>,
    ctx: { maxHr: 190, restingHr: 55 } satisfies Partial<EngineContext>,
  },
  'no hr, no kcal': {
    activity: {} satisfies Partial<ActivityInput>,
    ctx: {} satisfies Partial<EngineContext>,
  },
  'kcal only': {
    activity: { activeKcal: 300 } satisfies Partial<ActivityInput>,
    ctx: {} satisfies Partial<EngineContext>,
  },
  'nothing at all': {
    activity: {} satisfies Partial<ActivityInput>,
    ctx: {} satisfies Partial<EngineContext>,
  },
} as const;

describe('computeEffortPoints — modality x signal matrix', () => {
  it('scores every modality against every available-signal combination', () => {
    const matrix: Record<string, unknown> = {};

    for (const modality of MODALITIES) {
      for (const [label, signals] of Object.entries(SIGNAL_SETS)) {
        matrix[`${modality} / ${label}`] = computeEffortPoints(
          activity({
            activityType: ACTIVITY_TYPE_BY_MODALITY[modality],
            durationSec: HALF_HOUR_SEC,
            ...signals.activity,
          }),
          context(signals.ctx),
        );
      }
    }

    expect(matrix).toMatchSnapshot();
  });

  it('reaches HR_ZONES for every modality when heart rate is available', () => {
    for (const modality of MODALITIES) {
      const result = computeEffortPoints(
        activity({ activityType: ACTIVITY_TYPE_BY_MODALITY[modality], avgHr: 150 }),
        context({ maxHr: 190, restingHr: 55 }),
      );

      expect(result).toMatchObject({ modality, intensityTier: 'HR_ZONES' });
    }
  });

  it('prefers the published MET value over the device kcal estimate for a known activity', () => {
    for (const modality of MODALITIES.filter((m): m is Modality => m !== 'other')) {
      const result = computeEffortPoints(
        activity({ activityType: ACTIVITY_TYPE_BY_MODALITY[modality], activeKcal: 300 }),
        context(),
      );

      expect(result.intensityTier).toBe('MET_TABLE');
    }
  });

  it('never claims a metabolic cost for an activity it did not recognise', () => {
    const withKcal = computeEffortPoints(
      activity({ activityType: 'com.example.MysteryVendorThing', activeKcal: 300 }),
      context(),
    );
    const withoutKcal = computeEffortPoints(
      activity({ activityType: 'com.example.MysteryVendorThing' }),
      context(),
    );

    expect(withKcal.intensityTier).toBe('CALORIES');
    expect(withoutKcal.intensityTier).toBe('FLOOR');
  });
});

describe('computeEffortPoints — the fidelity ladder', () => {
  it('uses Karvonen when heart rate, max and resting are all present', () => {
    const result = computeEffortPoints(
      activity({ avgHr: 150 }),
      context({ maxHr: 190, restingHr: 55 }),
    );

    // (150 - 55) / (190 - 55) = 0.7037 of reserve, against a 0.70 reference.
    expect(result.intensityTier).toBe('HR_ZONES');
    expect(result.ep).toBe(60);
  });

  it('falls back to plain %max when resting heart rate is unknown', () => {
    const karvonen = computeEffortPoints(
      activity({ avgHr: 150 }),
      context({ maxHr: 190, restingHr: 55 }),
    );
    const percentMax = computeEffortPoints(activity({ avgHr: 150 }), context({ maxHr: 190 }));

    expect(percentMax.intensityTier).toBe('HR_ZONES');
    // Losing resting HR is a loss of precision, not a change of payout.
    expect(Math.abs(percentMax.ep - karvonen.ep)).toBeLessThanOrEqual(5);
  });

  it('drops to the MET table when heart rate is reported but max heart rate is unknown', () => {
    const result = computeEffortPoints(activity({ avgHr: 150 }), context());

    expect(result.intensityTier).toBe('MET_TABLE');
    // 60 min * (7.0 / 6.0) MET * 1.0 weight = 70 EP.
    expect(result.ep).toBe(70);
  });

  it('uses the MET table when there is no heart rate but the activity type is known', () => {
    const result = computeEffortPoints(activity(), context());

    expect(result).toMatchObject({ intensityTier: 'MET_TABLE', modality: 'cardio_steady', ep: 70 });
  });

  it('uses calories when nothing else is available', () => {
    const result = computeEffortPoints(
      activity({ activityType: 'unknown vendor thing', activeKcal: 600 }),
      context(),
    );

    // 600 kcal / 60 min = 10 kcal/min, against an 8.0 reference = 1.25 intensity.
    expect(result.intensityTier).toBe('CALORIES');
    expect(result.ep).toBe(Math.round(60 * 1.25 * MODALITY_WEIGHT.other));
  });

  it('returns the floor, and does not throw, when there is no signal at all', () => {
    const run = (): ReturnType<typeof computeEffortPoints> =>
      computeEffortPoints(activity({ activityType: 'unknown vendor thing' }), context());

    expect(run).not.toThrow();
    expect(run()).toMatchObject({ intensityTier: 'FLOOR', modality: 'other' });
    expect(run().ep).toBe(Math.round(60 * INTENSITY_FLOOR * MODALITY_WEIGHT.other));
  });

  it('still pays a floor session more than nothing', () => {
    const result = computeEffortPoints(activity({ activityType: 'mystery' }), context());

    expect(result.ep).toBeGreaterThan(0);
  });
});

describe('computeEffortPoints — hostile and degenerate signals', () => {
  it('ignores a non-finite heart rate rather than producing NaN EP', () => {
    const result = computeEffortPoints(
      activity({ avgHr: Number.NaN }),
      context({ maxHr: 190, restingHr: 55 }),
    );

    expect(result.intensityTier).toBe('MET_TABLE');
    expect(Number.isInteger(result.ep)).toBe(true);
  });

  it('ignores a zero max heart rate rather than dividing by it', () => {
    const result = computeEffortPoints(activity({ avgHr: 150 }), context({ maxHr: 0 }));

    expect(result.intensityTier).toBe('MET_TABLE');
    expect(Number.isFinite(result.ep)).toBe(true);
  });

  it('falls back to %max when resting heart rate is not below max', () => {
    const result = computeEffortPoints(
      activity({ avgHr: 150 }),
      context({ maxHr: 190, restingHr: 190 }),
    );

    expect(result.intensityTier).toBe('HR_ZONES');
    expect(result.ep).toBe(Math.round(60 * (150 / 190 / 0.75)));
  });

  it('clamps an absurd calorie report to the intensity ceiling', () => {
    const result = computeEffortPoints(
      activity({ activityType: 'mystery', activeKcal: 100000 }),
      context(),
    );

    expect(result.ep).toBe(Math.round(60 * INTENSITY_MAX * MODALITY_WEIGHT.other));
  });

  it('clamps sensor-noise heart rate to the intensity floor rather than scoring near zero', () => {
    const result = computeEffortPoints(
      activity({ avgHr: 30 }),
      context({ maxHr: 190, restingHr: 55 }),
    );

    expect(result.ep).toBe(Math.round(60 * INTENSITY_MIN * MODALITY_WEIGHT.cardio_steady));
  });

  it('scores a zero-length session as zero without throwing', () => {
    const result = computeEffortPoints(activity({ durationSec: 0 }), context());

    expect(result).toMatchObject({ ep: 0, rawEp: 0 });
  });

  it('scores a negative-length session as zero without throwing', () => {
    const result = computeEffortPoints(activity({ durationSec: -600 }), context());

    expect(result).toMatchObject({ ep: 0, rawEp: 0 });
  });

  it('cannot be made to produce a non-integer or negative score', () => {
    const next = createRandom(4242);

    for (let i = 0; i < 500; i += 1) {
      const modality = MODALITIES[Math.floor(next() * MODALITIES.length)] as Modality;
      const result = computeEffortPoints(
        activity({
          activityType: ACTIVITY_TYPE_BY_MODALITY[modality],
          durationSec: Math.floor(next() * 20000),
          avgHr: 40 + next() * 180,
          activeKcal: next() * 3000,
        }),
        context({
          maxHr: 120 + next() * 100,
          restingHr: 35 + next() * 60,
          epToday: Math.floor(next() * 900),
          epThisWeek: Math.floor(next() * 2500),
          proteinAdequacy: next(),
        }),
      );

      expect(Number.isInteger(result.ep)).toBe(true);
      expect(Number.isInteger(result.rawEp)).toBe(true);
      expect(result.ep).toBeGreaterThanOrEqual(0);
      expect(result.ep).toBeLessThanOrEqual(result.rawEp);
    }
  });
});

describe('computeEffortPoints — modifiers', () => {
  it('prices provenance: device-verified beats app-tracked beats manual', () => {
    const score = (trustTier: ActivityInput['trustTier']): number =>
      computeEffortPoints(activity({ trustTier }), context()).ep;

    expect(score('DEVICE_VERIFIED')).toBeGreaterThan(score('APP_TRACKED'));
    expect(score('APP_TRACKED')).toBeGreaterThan(score('MANUAL'));
  });

  it('applies the protein bonus as upside only, capped at its ceiling', () => {
    // A four-hour session, so the ratio is not dominated by integer rounding, and small
    // enough that the daily cap does not join in and confuse the measurement.
    const long = { durationSec: 4 * ONE_HOUR_SEC };
    const unknown = computeEffortPoints(activity(long), context()).ep;
    const starved = computeEffortPoints(activity(long), context({ proteinAdequacy: 0 })).ep;
    const fed = computeEffortPoints(activity(long), context({ proteinAdequacy: 1 })).ep;

    // Unknown intake is never treated as a failure to eat.
    expect(starved).toBe(unknown);
    expect(fed).toBeGreaterThan(unknown);
    expect(fed / unknown).toBeCloseTo(1 + PROTEIN_ADEQUACY_MAX_BONUS, 2);
  });

  it('scales the protein bonus with adequacy', () => {
    const half = computeEffortPoints(activity(), context({ proteinAdequacy: 0.5 })).ep;
    const full = computeEffortPoints(activity(), context({ proteinAdequacy: 1 })).ep;
    const none = computeEffortPoints(activity(), context({ proteinAdequacy: 0 })).ep;

    expect(half).toBeGreaterThan(none);
    expect(half).toBeLessThan(full);
  });

  it('cannot be pushed past the ceiling by an out-of-range adequacy value', () => {
    const fed = computeEffortPoints(activity(), context({ proteinAdequacy: 1 })).ep;
    const overfed = computeEffortPoints(activity(), context({ proteinAdequacy: 99 })).ep;

    expect(overfed).toBe(fed);
  });
});

describe('computeEffortPoints — the MET tier agrees with its published source', () => {
  it.each(MODALITIES.filter((m): m is Modality => m !== 'other'))(
    'scores an hour of %s straight off the MET table',
    (modality) => {
      const result = computeEffortPoints(
        activity({ activityType: ACTIVITY_TYPE_BY_MODALITY[modality], durationSec: ONE_HOUR_SEC }),
        context(),
      );

      // The intensity clamp applies to the MET tier too, which is why `recovery` (2.0 MET,
      // i.e. 0.33 of the reference) is scored at `INTENSITY_MIN` rather than at its raw
      // ratio: the floor is a deliberate promise that nothing real scores near zero.
      const intensity = Math.min(
        INTENSITY_MAX,
        Math.max(INTENSITY_MIN, MET_TABLE[modality] / REFERENCE_MET),
      );
      const expected = Math.round(60 * intensity * MODALITY_WEIGHT[modality]);

      expect(result.ep).toBe(expected);
    },
  );
});

describe('computeEffortPoints — properties', () => {
  it('is monotonic non-decreasing in duration', () => {
    const ctx = context();
    let previousEp = -1;
    let previousRaw = -1;

    for (let minutes = 1; minutes <= 600; minutes += 1) {
      const result = computeEffortPoints(activity({ durationSec: minutes * 60 }), ctx);

      expect(result.ep).toBeGreaterThanOrEqual(previousEp);
      expect(result.rawEp).toBeGreaterThanOrEqual(previousRaw);

      previousEp = result.ep;
      previousRaw = result.rawEp;
    }
  });

  it('is strictly increasing in duration below the daily cap', () => {
    const ctx = context();
    let previousEp = -1;

    for (let minutes = 1; minutes * 70 < DAILY_SOFT_CAP_EP * 60; minutes += 1) {
      const result = computeEffortPoints(activity({ durationSec: minutes * 60 }), ctx);
      if (result.rawEp >= DAILY_SOFT_CAP_EP) {
        break;
      }

      expect(result.ep).toBeGreaterThan(previousEp);
      previousEp = result.ep;
    }
  });

  it('pays a six-hour session meaningfully less than six one-hour sessions', () => {
    const hard = ACTIVITY_TYPE_BY_MODALITY.cardio_intense;

    const oneHour = computeEffortPoints(
      activity({ activityType: hard, durationSec: ONE_HOUR_SEC }),
      context(),
    ).ep;
    const sixHours = computeEffortPoints(
      activity({ activityType: hard, durationSec: 6 * ONE_HOUR_SEC }),
      context(),
    ).ep;

    expect(sixHours).toBeLessThan(oneHour * 6 * 0.85);
    // ...but never nothing: a real ultra-endurance day still visibly counts.
    expect(sixHours).toBeGreaterThan(oneHour * 3);
  });

  it('gives no advantage to splitting one long day into many short logs', () => {
    const hard = ACTIVITY_TYPE_BY_MODALITY.cardio_intense;

    const single = computeEffortPoints(
      activity({ activityType: hard, durationSec: 6 * ONE_HOUR_SEC }),
      context(),
    ).ep;

    let banked = 0;
    for (let session = 0; session < 6; session += 1) {
      banked += computeEffortPoints(
        activity({ activityType: hard, durationSec: ONE_HOUR_SEC }),
        context({ epToday: banked, epThisWeek: banked }),
      ).ep;
    }

    // Same work, same day, same payout — farming the cap by chopping it up must not pay.
    expect(Math.abs(banked - single)).toBeLessThanOrEqual(5);
  });
});

/**
 * Gear's one and only route into the reward economy: a completed set's
 * `modalityConversionBonus`. Gear STAT bonuses deliberately do not appear here — those are a
 * combat projection, and a heavier chestplate must never earn a player more XP for the same run.
 */
describe('computeEffortPoints with gear equipped', () => {
  const fullSet = (setId: string): EquippedItems =>
    Object.fromEntries(itemsInSet(setId).map((piece) => [piece.slot, piece]));

  const scored = (modality: Modality, equipped?: EquippedItems) =>
    computeEffortPoints(
      activity({ activityType: ACTIVITY_TYPE_BY_MODALITY[modality], durationSec: ONE_HOUR_SEC }),
      context(),
      equipped === undefined ? {} : { equipped },
    );

  it('scores exactly as before for a hero wearing nothing', () => {
    for (const modality of MODALITIES) {
      const bare = computeEffortPoints(
        activity({ activityType: ACTIVITY_TYPE_BY_MODALITY[modality], durationSec: ONE_HOUR_SEC }),
        context(),
      );
      expect(scored(modality)).toEqual(bare);
      expect(scored(modality, {})).toEqual(bare);
    }
  });

  it('pays a completed set more for the modality that set is about', () => {
    expect(scored('strength', fullSet(IRONBOUND_SET_ID)).ep).toBeGreaterThan(scored('strength').ep);
    expect(scored('cardio_steady', fullSet(WINDRUNNER_SET_ID)).ep).toBeGreaterThan(
      scored('cardio_steady').ep,
    );
  });

  it('pays nothing extra for a modality the set has no opinion about', () => {
    const iron = fullSet(IRONBOUND_SET_ID);
    for (const modality of MODALITIES.filter((m) => m !== 'strength')) {
      expect(scored(modality, iron).ep).toBe(scored(modality).ep);
    }
  });

  it('pays nothing for an incomplete set — the bonus is the reward for finishing it', () => {
    const partial = Object.fromEntries(
      itemsInSet(IRONBOUND_SET_ID)
        .slice(0, 1)
        .map((piece) => [piece.slot, piece]),
    );
    expect(scored('strength', partial).ep).toBe(scored('strength').ep);
  });

  it('keeps EP integral with gear applied', () => {
    const geared = scored('strength', fullSet(IRONBOUND_SET_ID));
    expect(Number.isInteger(geared.ep)).toBe(true);
    expect(Number.isInteger(geared.rawEp)).toBe(true);
  });

  it('stacks with a set log, both bounded, on a strength session', () => {
    const iron = fullSet(IRONBOUND_SET_ID);
    const both = computeEffortPoints(
      activity({ activityType: ACTIVITY_TYPE_BY_MODALITY.strength, durationSec: ONE_HOUR_SEC }),
      context(),
      { equipped: iron, sets: Array.from({ length: 12 }, () => ({ exercise: 'squat', reps: 8, weightKg: 60 })) },
    );

    expect(both.ep).toBeGreaterThan(scored('strength', iron).ep);
  });
});
