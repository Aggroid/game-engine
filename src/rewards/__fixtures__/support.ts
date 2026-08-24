/**
 * Test support for the rewards suite. Excluded from the published build by
 * `tsconfig.build.json`, and bound by the same purity rules as the engine itself:
 * no clock, no ambient randomness, no I/O.
 *
 * The randomness here is SEEDED for the same reason the battle simulator's is: a property
 * test that fails once in fifty runs and then passes on retry teaches a team to re-run CI
 * instead of reading the failure. Seeded, a counterexample is reproducible forever.
 */
import type {
  ActivityInput,
  EngineContext,
  Hero,
  Modality,
  StatBlock,
  StatKey,
} from '../../contracts/types';
import { STAT_KEYS } from '../../contracts/types';

/** 2^32 — maps the 32-bit state onto the unit interval. */
const UINT32_RANGE = 4294967296;

/** Deterministic mulberry32 source. Same seed, same sequence, on every machine forever. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/** Fisher-Yates over a copy, driven by a seeded source. Never mutates the input. */
export function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const a = copy[i] as T;
    const b = copy[j] as T;
    copy[i] = b;
    copy[j] = a;
  }

  return copy;
}

/** A representative raw platform string for every modality — one per row of the taxonomy. */
export const ACTIVITY_TYPE_BY_MODALITY: Readonly<Record<Modality, string>> = {
  strength: 'HKWorkoutActivityTypeTraditionalStrengthTraining',
  cardio_steady: 'HKWorkoutActivityTypeRunning',
  cardio_intense: 'EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING',
  sport_racket: 'HKWorkoutActivityTypeTennis',
  sport_team: 'HKWorkoutActivityTypeSoccer',
  swim: 'HKWorkoutActivityTypeSwimming',
  cycle: 'HKWorkoutActivityTypeCycling',
  mobility: 'HKWorkoutActivityTypeYoga',
  walk: 'HKWorkoutActivityTypeWalking',
  recovery: 'HKWorkoutActivityTypeMindAndBody',
  other: 'com.example.MysteryVendorThing',
};

/** A fixed instant. Literal, never a clock read — the engine forbids ambient time. */
const FIXED_START_MS = 1_700_000_000_000;

/** One hour, the default session length for fixtures. */
const DEFAULT_DURATION_SEC = 3600;

/** Builds an `ActivityInput`, overriding only what a test actually cares about. */
export function activity(overrides: Partial<ActivityInput> = {}): ActivityInput {
  const durationSec = overrides.durationSec ?? DEFAULT_DURATION_SEC;

  return {
    activityType: ACTIVITY_TYPE_BY_MODALITY.cardio_steady,
    durationSec,
    startedAtMs: FIXED_START_MS,
    endedAtMs: FIXED_START_MS + durationSec * 1000,
    trustTier: 'DEVICE_VERIFIED',
    ...overrides,
  };
}

/** Builds an `EngineContext` with an empty day and week unless a test says otherwise. */
export function context(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    timezone: 'Europe/Sofia',
    localDate: '2026-03-14',
    epToday: 0,
    epThisWeek: 0,
    ...overrides,
  };
}

/** A zeroed stat block, built from `STAT_KEYS` so it can never miss a key. */
export function zeroStats(): StatBlock {
  return Object.fromEntries(STAT_KEYS.map((key: StatKey) => [key, 0])) as StatBlock;
}

/** Builds a `Hero`. Only `heroClass` affects any reward maths. */
export function hero(overrides: Partial<Hero> = {}): Hero {
  return {
    id: 'hero-0001',
    name: 'Test Subject',
    heroClass: 'WARRIOR',
    level: 1,
    xp: 0,
    gold: 0,
    stats: zeroStats(),
    ...overrides,
  };
}

/**
 * Recursively freezes an object graph so that any attempted mutation THROWS in strict
 * mode instead of silently succeeding. Used to prove the engine does not touch its inputs
 * rather than merely to observe that it happened not to this time.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const inner of Object.values(value)) {
      deepFreeze(inner);
    }
    Object.freeze(value);
  }

  return value;
}
