/**
 * Set-log quality multiplier tests.
 *
 * Three properties, all of them product decisions rather than maths preferences:
 *  - ONE SET CANNOT MAX IT. Otherwise the optimal way to use the feature is to type one set.
 *  - THE CEILING IS NEVER REACHED. `SET_LOG_QUALITY_MAX` is a bound, not a checkpoint: a cliff
 *    is where a player learns the exact number of sets at which typing stops paying.
 *  - IT TOUCHES STRENGTH AND NOTHING ELSE. A swim with sets attached scores exactly as a swim.
 */
import { MODALITIES, type Modality, type StrengthSet } from '../contracts/types';

import { ACTIVITY_TYPE_BY_MODALITY, activity, context } from './__fixtures__/support';
import {
  NEUTRAL_MULTIPLIER,
  SET_LOG_BODYWEIGHT_LOAD_KG,
  SET_LOG_HALF_CREDIT_WORK,
  SET_LOG_QUALITY_MAX,
} from './constants';
import { computeEffortPoints } from './effort';
import { STRENGTH_MODALITY, setLogQualityMultiplier } from './setLog';

/** A working set: eight reps at sixty kilos. */
const set = (overrides: Partial<StrengthSet> = {}): StrengthSet => ({
  exercise: 'back squat',
  reps: 8,
  weightKg: 60,
  ...overrides,
});

/** `count` identical sets — the shape of a real logged session. */
const session = (count: number, overrides: Partial<StrengthSet> = {}): StrengthSet[] =>
  Array.from({ length: count }, () => set(overrides));

/** How much of the available bonus a multiplier has earned, as a fraction of the whole. */
const earnedShare = (multiplier: number): number =>
  (multiplier - NEUTRAL_MULTIPLIER) / (SET_LOG_QUALITY_MAX - NEUTRAL_MULTIPLIER);

describe('setLogQualityMultiplier', () => {
  it('is neutral when nothing was logged — absence of data is never a penalty', () => {
    expect(setLogQualityMultiplier()).toBe(NEUTRAL_MULTIPLIER);
    expect(setLogQualityMultiplier([])).toBe(NEUTRAL_MULTIPLIER);
  });

  it('pays something for a single set', () => {
    expect(setLogQualityMultiplier([set()])).toBeGreaterThan(NEUTRAL_MULTIPLIER);
  });

  it('does NOT let one set max it, however heavy that set is', () => {
    expect(earnedShare(setLogQualityMultiplier([set()]))).toBeLessThan(0.25);

    const absurd = setLogQualityMultiplier([set({ reps: 100, weightKg: 500 })]);
    expect(absurd).toBeLessThan(SET_LOG_QUALITY_MAX);
  });

  it('approaches the ceiling for a huge log without ever reaching it', () => {
    const heavy = setLogQualityMultiplier(session(200, { reps: 10, weightKg: 200 }));

    expect(heavy).toBeGreaterThan(SET_LOG_QUALITY_MAX - 0.01);
    expect(heavy).toBeLessThan(SET_LOG_QUALITY_MAX);
  });

  it('never exceeds the ceiling, at any volume anyone could ever type', () => {
    for (const count of [1, 5, 20, 100, 10000]) {
      expect(setLogQualityMultiplier(session(count, { reps: 50, weightKg: 400 }))).toBeLessThan(
        SET_LOG_QUALITY_MAX,
      );
    }
  });

  it('pays half the available bonus at exactly the half-credit tonnage', () => {
    const half = setLogQualityMultiplier([set({ reps: 1, weightKg: SET_LOG_HALF_CREDIT_WORK })]);
    expect(earnedShare(half)).toBeCloseTo(0.5, 10);
  });

  it('rises with more sets, and with heavier ones', () => {
    const totals = [1, 2, 4, 8, 16].map((count) => setLogQualityMultiplier(session(count)));
    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i] as number).toBeGreaterThan(totals[i - 1] as number);
    }

    expect(setLogQualityMultiplier([set({ weightKg: 120 })])).toBeGreaterThan(
      setLogQualityMultiplier([set({ weightKg: 60 })]),
    );
    expect(setLogQualityMultiplier([set({ reps: 12 })])).toBeGreaterThan(
      setLogQualityMultiplier([set({ reps: 6 })]),
    );
  });

  it('has diminishing returns — the tenth set is worth less than the second', () => {
    const at = (count: number): number => setLogQualityMultiplier(session(count));
    const secondSetGain = at(2) - at(1);
    const tenthSetGain = at(10) - at(9);

    expect(tenthSetGain).toBeGreaterThan(0);
    expect(tenthSetGain).toBeLessThan(secondSetGain);
  });

  it('credits bodyweight work, which the contract logs as zero kilograms', () => {
    const pressUps = setLogQualityMultiplier([set({ exercise: 'press-up', reps: 20, weightKg: 0 })]);
    expect(pressUps).toBeGreaterThan(NEUTRAL_MULTIPLIER);
    // Priced at the notional bodyweight load, not at zero and not at a barbell's worth.
    expect(pressUps).toBe(setLogQualityMultiplier([set({ reps: 20, weightKg: SET_LOG_BODYWEIGHT_LOAD_KG })]));
  });

  it('never lets nonsense reach the ledger — NaN and negatives score as no work', () => {
    expect(setLogQualityMultiplier([set({ reps: Number.NaN })])).toBe(NEUTRAL_MULTIPLIER);
    expect(setLogQualityMultiplier([set({ reps: 8, weightKg: Number.NaN })])).toBe(
      setLogQualityMultiplier([set({ reps: 8, weightKg: 0 })]),
    );
    expect(setLogQualityMultiplier([set({ reps: -100, weightKg: -100 })])).toBe(NEUTRAL_MULTIPLIER);
    expect(setLogQualityMultiplier([set({ reps: Number.POSITIVE_INFINITY })])).toBe(
      NEUTRAL_MULTIPLIER,
    );
  });

  it('does not mutate the sets it reads', () => {
    const sets = Object.freeze([Object.freeze(set())]) as readonly StrengthSet[];
    expect(() => setLogQualityMultiplier(sets)).not.toThrow();
  });
});

describe('computeEffortPoints with logged sets', () => {
  const strength = () =>
    activity({ activityType: ACTIVITY_TYPE_BY_MODALITY.strength, durationSec: 3600 });

  it('scores a strength session unchanged when nothing was logged', () => {
    const bare = computeEffortPoints(strength(), context());
    expect(computeEffortPoints(strength(), context(), {})).toEqual(bare);
    expect(computeEffortPoints(strength(), context(), { sets: [] })).toEqual(bare);
  });

  it('pays more for a strength session logged set by set', () => {
    const bare = computeEffortPoints(strength(), context());
    const logged = computeEffortPoints(strength(), context(), { sets: session(12) });

    expect(logged.ep).toBeGreaterThan(bare.ep);
    expect(logged.modality).toBe(STRENGTH_MODALITY);
  });

  it('never pays more than the ceiling for it', () => {
    const bare = computeEffortPoints(strength(), context());
    const absurd = computeEffortPoints(strength(), context(), {
      sets: session(500, { reps: 40, weightKg: 300 }),
    });

    expect(absurd.rawEp).toBeLessThanOrEqual(Math.round(bare.rawEp * SET_LOG_QUALITY_MAX));
  });

  it('keeps EP integral, as every ledger-bound number must be', () => {
    for (const count of [1, 3, 7, 19]) {
      const scored = computeEffortPoints(strength(), context(), { sets: session(count) });
      expect(Number.isInteger(scored.ep)).toBe(true);
      expect(Number.isInteger(scored.rawEp)).toBe(true);
    }
  });

  it.each(MODALITIES.filter((modality) => modality !== STRENGTH_MODALITY))(
    'leaves %s completely unaffected by logged sets',
    (modality: Modality) => {
      const session_ = activity({
        activityType: ACTIVITY_TYPE_BY_MODALITY[modality],
        durationSec: 3600,
      });

      expect(computeEffortPoints(session_, context(), { sets: session(20) })).toEqual(
        computeEffortPoints(session_, context()),
      );
    },
  );
});
