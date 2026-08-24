/**
 * Raw platform activity strings -> the engine's normalised `Modality` taxonomy.
 *
 * THIS IS THE DIRTIEST INPUT THE ENGINE TAKES. HealthKit ships ~80 workout constants
 * (`HKWorkoutActivityTypeTraditionalStrengthTraining`), Health Connect ships its own set
 * in SCREAMING_SNAKE (`EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING`), third-party apps
 * write whatever they like ("Padel", "trail run", "coolDown"), and every one of those
 * vocabularies changes without warning on an OS release. The reward tables are written
 * once against eleven stable modalities instead of chasing that.
 *
 * TWO RULES, BOTH NON-NEGOTIABLE:
 *  1. NEVER THROW. An unrecognised string is a user's real workout, not a bug. It maps to
 *     `other`, which still earns — just off a lower-fidelity signal. Throwing here would
 *     mean a new watch model on release day silently failing every sync in the field.
 *  2. NEVER GUESS DESTRUCTIVELY. `ActivityInput` keeps the raw string forever, so a
 *     missing mapping added in a later engine version can be back-applied to old ledger
 *     rows. A wrong mapping is recoverable; a discarded input is not.
 *
 * Matching is whole-token, not substring: `'kickboxing'` does not match a `boxing` rule
 * and `'PaddleSports'` (kayaking) does not match `padel`. Substring matching on this
 * vocabulary produces confident, silent, wrong answers — the worst possible failure here.
 */
import type { Modality } from '../contracts/types';

/**
 * The modality an unrecognised activity string falls back to.
 *
 * Named because it is load-bearing in `effort.ts`: `other` is precisely the case where
 * the engine has NO idea what the user did, so it must not be scored from a MET table.
 */
export const UNKNOWN_MODALITY: Modality = 'other';

/**
 * Tokens that carry no meaning about the activity — platform prefixes and packaging.
 *
 * Dropped before matching so that `HKWorkoutActivityTypeYoga`, `EXERCISE_TYPE_YOGA` and
 * `"yoga"` all reduce to the same phrase and the rule table never has to know which
 * platform a string came from.
 */
const NOISE_TOKENS: ReadonlySet<string> = new Set([
  'hk',
  'workout',
  'activity',
  'type',
  'exercise',
  'session',
  'record',
  'segment',
  'health',
  'connect',
  'apple',
  'google',
  'android',
]);

/**
 * A single mapping rule: an exact token phrase, and the modality it implies.
 *
 * Ordered evaluation, first match wins, so the table itself encodes precedence. The few
 * places where order actually matters are commented at the point they matter.
 */
type MappingRule = readonly [phrase: string, modality: Modality];

/**
 * The mapping table. Data, not branching logic — a new platform string is a new row.
 *
 * Grouped by modality for review by a human, but evaluated top to bottom, so the groups
 * are also the precedence order. Alternate spellings are listed explicitly rather than
 * matched loosely, because whole-token matching means `'cycling'` and `'bicycling'` are
 * genuinely different tokens and a loose rule would be the thing that eats `padel`.
 */
const MAPPING_RULES: readonly MappingRule[] = [
  // Racket sports. `padel` only — NOT `paddle`, which is kayaking on HealthKit.
  ['table tennis', 'sport_racket'],
  ['ping pong', 'sport_racket'],
  ['tennis', 'sport_racket'],
  ['padel', 'sport_racket'],
  ['squash', 'sport_racket'],
  ['badminton', 'sport_racket'],
  ['racquetball', 'sport_racket'],
  ['racquet', 'sport_racket'],
  ['racket', 'sport_racket'],
  ['pickleball', 'sport_racket'],

  // Team sports. `water polo` precedes the swim group so it is scored as a sport.
  ['water polo', 'sport_team'],
  ['soccer', 'sport_team'],
  ['football', 'sport_team'],
  ['basketball', 'sport_team'],
  ['volleyball', 'sport_team'],
  ['handball', 'sport_team'],
  ['hockey', 'sport_team'],
  ['rugby', 'sport_team'],
  ['netball', 'sport_team'],
  ['lacrosse', 'sport_team'],
  ['cricket', 'sport_team'],
  ['baseball', 'sport_team'],
  ['softball', 'sport_team'],

  // Water.
  ['swimming', 'swim'],
  ['swim', 'swim'],
  ['water fitness', 'swim'],
  ['aqua', 'swim'],

  // Wheels.
  ['cycling', 'cycle'],
  ['bicycling', 'cycle'],
  ['biking', 'cycle'],
  ['bike', 'cycle'],
  ['handcycling', 'cycle'],
  ['spinning', 'cycle'],

  // Resistance work. `strength training` variants first; no bare `training` rule exists.
  ['strength', 'strength'],
  ['weightlifting', 'strength'],
  ['weight lifting', 'strength'],
  ['weight training', 'strength'],
  ['resistance training', 'strength'],
  ['powerlifting', 'strength'],
  ['calisthenics', 'strength'],
  ['bodyweight', 'strength'],
  ['core training', 'strength'],
  ['functional training', 'strength'],
  ['crossfit', 'strength'],

  // Hard cardio. Precedes steady cardio so `stair climbing` beats `stairs`.
  ['hiit', 'cardio_intense'],
  ['high intensity interval training', 'cardio_intense'],
  ['interval training', 'cardio_intense'],
  ['interval', 'cardio_intense'],
  ['sprint', 'cardio_intense'],
  ['sprints', 'cardio_intense'],
  ['circuit training', 'cardio_intense'],
  ['jump rope', 'cardio_intense'],
  ['skipping', 'cardio_intense'],
  ['boxing', 'cardio_intense'],
  ['kickboxing', 'cardio_intense'],
  ['martial arts', 'cardio_intense'],
  ['stair climbing', 'cardio_intense'],
  ['stairs', 'cardio_intense'],

  // Steady cardio.
  ['running', 'cardio_steady'],
  ['run', 'cardio_steady'],
  ['jogging', 'cardio_steady'],
  ['jog', 'cardio_steady'],
  ['treadmill', 'cardio_steady'],
  ['rowing', 'cardio_steady'],
  ['rower', 'cardio_steady'],
  ['elliptical', 'cardio_steady'],
  ['cross training', 'cardio_steady'],
  ['cardio', 'cardio_steady'],
  ['dance', 'cardio_steady'],
  ['dancing', 'cardio_steady'],
  ['aerobics', 'cardio_steady'],
  ['skiing', 'cardio_steady'],
  ['skating', 'cardio_steady'],
  ['paddle sports', 'cardio_steady'],
  ['paddleboarding', 'cardio_steady'],

  // Locomotion.
  ['walking', 'walk'],
  ['walk', 'walk'],
  ['hiking', 'walk'],
  ['hike', 'walk'],
  ['rucking', 'walk'],
  ['steps', 'walk'],
  ['wheelchair', 'walk'],

  // Mobility.
  ['yoga', 'mobility'],
  ['pilates', 'mobility'],
  ['stretching', 'mobility'],
  ['stretch', 'mobility'],
  ['flexibility', 'mobility'],
  ['mobility', 'mobility'],
  ['barre', 'mobility'],
  ['tai chi', 'mobility'],
  ['warm up', 'mobility'],
  ['warmup', 'mobility'],
  ['foam rolling', 'mobility'],

  // Recovery.
  ['mindfulness', 'recovery'],
  ['mind and body', 'recovery'],
  ['meditation', 'recovery'],
  ['breathing', 'recovery'],
  ['cooldown', 'recovery'],
  ['cool down', 'recovery'],
  ['recovery', 'recovery'],
  ['rest', 'recovery'],
  ['sauna', 'recovery'],
  ['massage', 'recovery'],
  ['sleep', 'recovery'],
];

/**
 * Reduces any platform spelling to a space-separated lower-case token phrase.
 *
 * `HKWorkoutActivityTypeTraditionalStrengthTraining` -> `traditional strength training`
 * `EXERCISE_TYPE_RUNNING_TREADMILL`                  -> `running treadmill`
 * `coolDown`                                         -> `cool down`
 *
 * The two camel-case splits run in this order on purpose: the first breaks an acronym
 * followed by a word (`HKWorkout` -> `HK Workout`), the second breaks the ordinary
 * lower-then-upper boundary. Reversed, the acronym case would be mangled.
 */
function canonicalise(raw: string): string {
  const tokens = raw
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 0 && !NOISE_TOKENS.has(token));

  return tokens.join(' ');
}

/**
 * Maps a raw platform activity string onto the engine's taxonomy.
 *
 * Case-insensitive and indifferent to snake_case, camelCase, SCREAMING_SNAKE, hyphens
 * and platform prefixes. Total: every possible string returns a `Modality`, including
 * `''`, `'   '` and a token soup no human would type.
 *
 * @param activityType The RAW string exactly as the device reported it.
 * @returns The matched modality, or `UNKNOWN_MODALITY` when nothing matches. Never throws.
 */
export function normaliseModality(activityType: string): Modality {
  // Padding both sides turns `includes` into whole-token containment, which is why
  // `kickboxing` cannot match a `boxing` rule.
  const phrase = ` ${canonicalise(activityType)} `;

  for (const [candidate, modality] of MAPPING_RULES) {
    if (phrase.includes(` ${candidate} `)) {
      return modality;
    }
  }

  return UNKNOWN_MODALITY;
}
