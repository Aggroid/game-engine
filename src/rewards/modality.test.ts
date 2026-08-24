/**
 * Mapping tests. The value here is not that `'running'` maps to `cardio_steady` — it is
 * that the mapper is TOTAL and cannot be made to throw, because it sits directly on the
 * dirtiest input the product takes and an exception here means a failed sync in the field.
 */
import { MODALITIES, type Modality } from '../contracts/types';

import { ACTIVITY_TYPE_BY_MODALITY, createRandom } from './__fixtures__/support';
import { UNKNOWN_MODALITY, normaliseModality } from './modality';

describe('normaliseModality', () => {
  describe('HealthKit vocabulary', () => {
    const cases: ReadonlyArray<readonly [string, Modality]> = [
      ['HKWorkoutActivityTypeRunning', 'cardio_steady'],
      ['HKWorkoutActivityTypeWalking', 'walk'],
      ['HKWorkoutActivityTypeHiking', 'walk'],
      ['HKWorkoutActivityTypeCycling', 'cycle'],
      ['HKWorkoutActivityTypeSwimming', 'swim'],
      ['HKWorkoutActivityTypeFunctionalStrengthTraining', 'strength'],
      ['HKWorkoutActivityTypeTraditionalStrengthTraining', 'strength'],
      ['HKWorkoutActivityTypeHighIntensityIntervalTraining', 'cardio_intense'],
      ['HKWorkoutActivityTypeTennis', 'sport_racket'],
      ['HKWorkoutActivityTypeBadminton', 'sport_racket'],
      ['HKWorkoutActivityTypeSquash', 'sport_racket'],
      ['HKWorkoutActivityTypeSoccer', 'sport_team'],
      ['HKWorkoutActivityTypeBasketball', 'sport_team'],
      ['HKWorkoutActivityTypeYoga', 'mobility'],
      ['HKWorkoutActivityTypePilates', 'mobility'],
      ['HKWorkoutActivityTypeFlexibility', 'mobility'],
      ['HKWorkoutActivityTypeMindAndBody', 'recovery'],
      ['HKWorkoutActivityTypeCooldown', 'recovery'],
      ['HKWorkoutActivityTypePreparationAndRecovery', 'recovery'],
    ];

    it.each(cases)('maps %s to %s', (raw, expected) => {
      expect(normaliseModality(raw)).toBe(expected);
    });
  });

  describe('Health Connect vocabulary', () => {
    const cases: ReadonlyArray<readonly [string, Modality]> = [
      ['EXERCISE_TYPE_RUNNING', 'cardio_steady'],
      ['EXERCISE_TYPE_RUNNING_TREADMILL', 'cardio_steady'],
      ['EXERCISE_TYPE_WALKING', 'walk'],
      ['EXERCISE_TYPE_BIKING', 'cycle'],
      ['EXERCISE_TYPE_SWIMMING_POOL', 'swim'],
      ['EXERCISE_TYPE_STRENGTH_TRAINING', 'strength'],
      ['EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING', 'cardio_intense'],
      ['EXERCISE_TYPE_BADMINTON', 'sport_racket'],
      ['EXERCISE_TYPE_FOOTBALL_AMERICAN', 'sport_team'],
      ['EXERCISE_TYPE_YOGA', 'mobility'],
      ['EXERCISE_TYPE_STRETCHING', 'mobility'],
      ['EXERCISE_TYPE_GUIDED_BREATHING', 'recovery'],
    ];

    it.each(cases)('maps %s to %s', (raw, expected) => {
      expect(normaliseModality(raw)).toBe(expected);
    });
  });

  describe('third-party and human spellings', () => {
    const cases: ReadonlyArray<readonly [string, Modality]> = [
      ['running', 'cardio_steady'],
      ['Running', 'cardio_steady'],
      ['RUNNING', 'cardio_steady'],
      ['trail_running', 'cardio_steady'],
      ['trailRunning', 'cardio_steady'],
      ['Trail Running', 'cardio_steady'],
      ['outdoor-run', 'cardio_steady'],
      ['HIIT', 'cardio_intense'],
      ['hiit', 'cardio_intense'],
      ['Padel', 'sport_racket'],
      ['padel_tennis', 'sport_racket'],
      ['Table Tennis', 'sport_racket'],
      ['coolDown', 'recovery'],
      ['cool_down', 'recovery'],
      ['Mindfulness', 'recovery'],
      ['weight lifting', 'strength'],
      ['Kickboxing', 'cardio_intense'],
      ['nordic walking', 'walk'],
      ['Tai Chi', 'mobility'],
    ];

    it.each(cases)('maps %s to %s', (raw, expected) => {
      expect(normaliseModality(raw)).toBe(expected);
    });
  });

  describe('near misses that substring matching would get wrong', () => {
    it('does not read PaddleSports (kayaking) as padel', () => {
      expect(normaliseModality('HKWorkoutActivityTypePaddleSports')).toBe('cardio_steady');
    });

    it('matches kickboxing on its own token, not via boxing', () => {
      expect(normaliseModality('kickboxing')).toBe('cardio_intense');
      expect(normaliseModality('boxing')).toBe('cardio_intense');
    });

    it('does not read Resistance Training as rest', () => {
      expect(normaliseModality('resistance training')).toBe('strength');
    });

    it('scores water polo as a team sport rather than swimming', () => {
      expect(normaliseModality('HKWorkoutActivityTypeWaterPolo')).toBe('sport_team');
    });
  });

  describe('degrading to other', () => {
    const unknowns = [
      '',
      '   ',
      '____',
      '123',
      'HKWorkoutActivityTypeSomethingInventedInIOS30',
      'com.example.MysteryVendorThing',
      'ǫʞ๏ unicode soup',
    ];

    it.each(unknowns)('maps %p to other without throwing', (raw) => {
      expect(normaliseModality(raw)).toBe(UNKNOWN_MODALITY);
    });

    it('exposes other as the documented fallback', () => {
      expect(UNKNOWN_MODALITY).toBe('other');
    });
  });

  describe('totality', () => {
    it('returns a member of the taxonomy for any random string, never throwing', () => {
      const next = createRandom(20260817);
      const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-.';

      for (let i = 0; i < 2000; i += 1) {
        const length = Math.floor(next() * 24);
        let raw = '';
        for (let c = 0; c < length; c += 1) {
          raw += alphabet.charAt(Math.floor(next() * alphabet.length));
        }

        expect(MODALITIES).toContain(normaliseModality(raw));
      }
    });

    it('has a fixture activity string for every modality in the taxonomy', () => {
      for (const modality of MODALITIES) {
        expect(normaliseModality(ACTIVITY_TYPE_BY_MODALITY[modality])).toBe(modality);
      }
    });
  });
});
