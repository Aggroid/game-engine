/**
 * Contract tests.
 *
 * Two jobs:
 *  1. Prove every validation rule at the backend boundary actually rejects — a schema
 *     that silently accepts garbage is worse than no schema, because it launders it.
 *  2. Pin the closed lists (`STAT_KEYS`, `HERO_CLASSES`, `MODALITIES`, ...) as exhaustive
 *     and `as const`, so a hand edit to a union without its list — or the reverse — is
 *     caught here as well as by `tsc`.
 *
 * All fixture timestamps are frozen literals: this package has no clock by invariant.
 */
import { z } from 'zod';

import {
  ActivityInputSchema,
  BattleEventSchema,
  BattleLogSchema,
  EngineContextSchema,
  HeroSchema,
  HR_MAX_BPM,
  HR_MIN_BPM,
  LOCAL_DATE_PATTERN,
  RewardEntrySchema,
  StatBlockSchema,
  parseActivityInput,
  parseBattleLog,
  parseEngineContext,
  parseHero,
  parseRewardEntry,
} from './schemas';
import {
  BATTLE_ACTORS,
  BATTLE_EVENT_TYPES,
  BATTLE_OUTCOMES,
  CAP_REASONS,
  HERO_CLASSES,
  INTENSITY_TIERS,
  MODALITIES,
  REWARD_KINDS,
  STAT_KEYS,
  TRUST_TIERS,
  type ActivityInput,
  type BattleActor,
  type BattleEvent,
  type BattleEventType,
  type BattleLog,
  type BattleOutcome,
  type CapReason,
  type EngineContext,
  type Hero,
  type HeroClass,
  type IntensityTier,
  type Modality,
  type RewardEntry,
  type RewardKind,
  type StatBlock,
  type StatKey,
  type TrustTier,
} from './types';

/* -------------------------------------------------------------------------- *
 * Fixtures — frozen literals, never derived from a clock.
 * -------------------------------------------------------------------------- */

const STARTED_AT_MS = 1_756_000_000_000;
const ENDED_AT_MS = 1_756_003_600_000;

const VALID_STATS: StatBlock = { str: 12, agi: 8, end: 10, vit: 14, foc: 3, spi: 5 };

const VALID_ACTIVITY: ActivityInput = {
  activityType: 'HKWorkoutActivityTypeTraditionalStrengthTraining',
  durationSec: 3600,
  startedAtMs: STARTED_AT_MS,
  endedAtMs: ENDED_AT_MS,
  trustTier: 'DEVICE_VERIFIED',
  distanceM: 0,
  activeKcal: 412.5,
  avgHr: 131,
};

const MINIMAL_ACTIVITY: ActivityInput = {
  activityType: 'walking',
  durationSec: 1,
  startedAtMs: STARTED_AT_MS,
  endedAtMs: STARTED_AT_MS,
  trustTier: 'MANUAL',
};

const VALID_CONTEXT: EngineContext = {
  timezone: 'Europe/Sofia',
  localDate: '2026-08-25',
  epToday: 40,
  epThisWeek: 260,
  maxHr: 188,
  restingHr: 52,
  proteinAdequacy: 0.75,
};

const MINIMAL_CONTEXT: EngineContext = {
  timezone: 'UTC',
  localDate: '2026-01-01',
  epToday: 0,
  epThisWeek: 0,
};

const VALID_HERO: Hero = {
  id: 'hero_01H',
  name: 'Ascendant',
  heroClass: 'PALADIN',
  level: 7,
  xp: 5400,
  gold: 320,
  stats: VALID_STATS,
};

const VALID_REWARD: RewardEntry = { kind: 'XP', amount: 120, engineVersion: '1.0.0' };

const VALID_EVENT: BattleEvent = {
  turn: 1,
  actor: 'HERO',
  type: 'ATTACK',
  amount: 14,
  heroHp: 96,
  enemyHp: 46,
};

const VALID_BATTLE_LOG: BattleLog = {
  encounterId: 'enc_goblin_01',
  seed: 4242,
  simVersion: '1.0.0',
  events: [VALID_EVENT, { turn: 2, actor: 'HERO', type: 'VICTORY', amount: 0, heroHp: 96, enemyHp: 0 }],
  outcome: 'WIN',
  turns: 2,
};

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

type Patch = Record<string, unknown>;

const activityJson = (patch: Patch = {}): unknown => ({ ...VALID_ACTIVITY, ...patch });
const contextJson = (patch: Patch = {}): unknown => ({ ...VALID_CONTEXT, ...patch });
const heroJson = (patch: Patch = {}): unknown => ({ ...VALID_HERO, ...patch });
const rewardJson = (patch: Patch = {}): unknown => ({ ...VALID_REWARD, ...patch });
const eventJson = (patch: Patch = {}): unknown => ({ ...VALID_EVENT, ...patch });
const battleLogJson = (patch: Patch = {}): unknown => ({ ...VALID_BATTLE_LOG, ...patch });

/** Asserts the payload is rejected and returns the dotted paths zod complained about. */
const rejectionPaths = (schema: z.ZodTypeAny, value: unknown): string[] => {
  const result = schema.safeParse(value);
  if (result.success) {
    throw new Error(`expected rejection, but the payload parsed: ${JSON.stringify(value)}`);
  }
  return result.error.issues.map((issue) => issue.path.join('.'));
};

/** Asserts the payload parses and returns the parsed value. */
const accept = <T>(schema: z.ZodType<T>, value: unknown): T => schema.parse(value);

/* -------------------------------------------------------------------------- *
 * Valid payloads
 * -------------------------------------------------------------------------- */

describe('valid payloads parse', () => {
  it('accepts a fully populated ActivityInput unchanged', () => {
    expect(accept(ActivityInputSchema, activityJson())).toEqual(VALID_ACTIVITY);
  });

  it('accepts an ActivityInput with every optional field absent', () => {
    const parsed = accept(ActivityInputSchema, { ...MINIMAL_ACTIVITY });
    expect(parsed).toEqual(MINIMAL_ACTIVITY);
    expect(parsed).not.toHaveProperty('distanceM');
    expect(parsed).not.toHaveProperty('activeKcal');
    expect(parsed).not.toHaveProperty('avgHr');
  });

  it('accepts a fully populated and a minimal EngineContext', () => {
    expect(accept(EngineContextSchema, contextJson())).toEqual(VALID_CONTEXT);
    expect(accept(EngineContextSchema, { ...MINIMAL_CONTEXT })).toEqual(MINIMAL_CONTEXT);
  });

  it('accepts a Hero, a RewardEntry, a BattleEvent and a BattleLog', () => {
    expect(accept(HeroSchema, heroJson())).toEqual(VALID_HERO);
    expect(accept(RewardEntrySchema, rewardJson())).toEqual(VALID_REWARD);
    expect(accept(BattleEventSchema, eventJson())).toEqual(VALID_EVENT);
    expect(accept(BattleLogSchema, battleLogJson())).toEqual(VALID_BATTLE_LOG);
  });

  it('accepts a StatBlock with every stat at zero', () => {
    const zeroed = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
    expect(accept(StatBlockSchema, zeroed)).toEqual(zeroed);
  });

  it('accepts every TrustTier, HeroClass and RewardKind in the canonical lists', () => {
    for (const tier of TRUST_TIERS) {
      expect(accept(ActivityInputSchema, activityJson({ trustTier: tier })).trustTier).toBe(tier);
    }
    for (const heroClass of HERO_CLASSES) {
      expect(accept(HeroSchema, heroJson({ heroClass })).heroClass).toBe(heroClass);
    }
    for (const kind of REWARD_KINDS) {
      expect(accept(RewardEntrySchema, rewardJson({ kind })).kind).toBe(kind);
    }
  });

  it('accepts every BattleActor, BattleEventType and BattleOutcome', () => {
    for (const actor of BATTLE_ACTORS) {
      expect(accept(BattleEventSchema, eventJson({ actor })).actor).toBe(actor);
    }
    for (const type of BATTLE_EVENT_TYPES) {
      expect(accept(BattleEventSchema, eventJson({ type })).type).toBe(type);
    }
    for (const outcome of BATTLE_OUTCOMES) {
      expect(accept(BattleLogSchema, battleLogJson({ outcome })).outcome).toBe(outcome);
    }
  });

  it('strips unknown keys instead of rejecting them, for forward compatibility', () => {
    const parsed = accept(ActivityInputSchema, activityJson({ futureField: 'from a newer app build' }));
    expect(parsed).not.toHaveProperty('futureField');
    expect(parsed).toEqual(VALID_ACTIVITY);
  });

  it('never mutates the input object', () => {
    const input = activityJson({ futureField: 1 }) as Patch;
    const before = JSON.stringify(input);
    accept(ActivityInputSchema, input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

/* -------------------------------------------------------------------------- *
 * Rejections — one block per stated validation rule
 * -------------------------------------------------------------------------- */

describe('durationSec must be a positive integer', () => {
  it('accepts the smallest legal duration', () => {
    expect(accept(ActivityInputSchema, activityJson({ durationSec: 1 })).durationSec).toBe(1);
  });

  it('rejects zero', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ durationSec: 0 }))).toEqual(['durationSec']);
  });

  it('rejects a negative duration', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ durationSec: -1 }))).toEqual(['durationSec']);
  });

  it('rejects a fractional duration', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ durationSec: 90.5 }))).toEqual(['durationSec']);
  });

  it('rejects NaN and Infinity', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ durationSec: Number.NaN }))).toContain('durationSec');
    expect(rejectionPaths(ActivityInputSchema, activityJson({ durationSec: Number.POSITIVE_INFINITY }))).toContain('durationSec');
  });

  it('rejects a numeric string', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ durationSec: '3600' }))).toEqual(['durationSec']);
  });

  it('rejects a missing duration', () => {
    const { durationSec: _omitted, ...withoutDuration } = VALID_ACTIVITY;
    expect(rejectionPaths(ActivityInputSchema, withoutDuration)).toEqual(['durationSec']);
  });
});

describe('avgHr, when present, must be between 20 and 250 bpm', () => {
  it('accepts both bounds', () => {
    expect(accept(ActivityInputSchema, activityJson({ avgHr: HR_MIN_BPM })).avgHr).toBe(HR_MIN_BPM);
    expect(accept(ActivityInputSchema, activityJson({ avgHr: HR_MAX_BPM })).avgHr).toBe(HR_MAX_BPM);
  });

  it('accepts a fractional average, because devices report averages', () => {
    expect(accept(ActivityInputSchema, activityJson({ avgHr: 142.4 })).avgHr).toBe(142.4);
  });

  it('rejects a heart rate below the lower bound', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ avgHr: HR_MIN_BPM - 1 }))).toEqual(['avgHr']);
  });

  it('rejects a heart rate above the upper bound', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ avgHr: HR_MAX_BPM + 1 }))).toEqual(['avgHr']);
  });

  it('rejects a non-finite heart rate', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ avgHr: Number.NaN }))).toContain('avgHr');
  });

  it('is genuinely optional — absence is not a rejection', () => {
    expect(accept(ActivityInputSchema, { ...MINIMAL_ACTIVITY })).not.toHaveProperty('avgHr');
  });
});

describe('activeKcal must be non-negative', () => {
  it('accepts zero', () => {
    expect(accept(ActivityInputSchema, activityJson({ activeKcal: 0 })).activeKcal).toBe(0);
  });

  it('rejects a negative value', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ activeKcal: -0.01 }))).toEqual(['activeKcal']);
    expect(rejectionPaths(ActivityInputSchema, activityJson({ activeKcal: -500 }))).toEqual(['activeKcal']);
  });
});

describe('distanceM must be non-negative', () => {
  it('accepts zero and a fractional distance', () => {
    expect(accept(ActivityInputSchema, activityJson({ distanceM: 0 })).distanceM).toBe(0);
    expect(accept(ActivityInputSchema, activityJson({ distanceM: 5012.4 })).distanceM).toBe(5012.4);
  });

  it('rejects a negative distance', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ distanceM: -1 }))).toEqual(['distanceM']);
  });
});

describe('endedAtMs must not precede startedAtMs', () => {
  it('accepts a zero-length window', () => {
    const parsed = accept(ActivityInputSchema, activityJson({ endedAtMs: STARTED_AT_MS }));
    expect(parsed.endedAtMs).toBe(parsed.startedAtMs);
  });

  it('rejects an end before the start, and blames endedAtMs', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ endedAtMs: STARTED_AT_MS - 1 }))).toEqual(['endedAtMs']);
  });

  it('rejects non-integer or negative timestamps', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ startedAtMs: 1.5 }))).toContain('startedAtMs');
    expect(rejectionPaths(ActivityInputSchema, activityJson({ startedAtMs: -1, endedAtMs: 0 }))).toContain('startedAtMs');
  });
});

describe('localDate must match YYYY-MM-DD', () => {
  it('exports the pattern the backend should validate with', () => {
    expect(LOCAL_DATE_PATTERN.test('2026-08-25')).toBe(true);
    expect(LOCAL_DATE_PATTERN.flags).toBe('');
  });

  it('rejects an unpadded month', () => {
    expect(rejectionPaths(EngineContextSchema, contextJson({ localDate: '2026-8-25' }))).toEqual(['localDate']);
  });

  it('rejects a two-digit year', () => {
    expect(rejectionPaths(EngineContextSchema, contextJson({ localDate: '26-08-25' }))).toEqual(['localDate']);
  });

  it('rejects a compact date with no separators', () => {
    expect(rejectionPaths(EngineContextSchema, contextJson({ localDate: '20260825' }))).toEqual(['localDate']);
  });

  it('rejects a full ISO timestamp — the caller must bucket the day itself', () => {
    expect(rejectionPaths(EngineContextSchema, contextJson({ localDate: '2026-08-25T09:30:00Z' }))).toEqual(['localDate']);
  });

  it('rejects an empty string and a non-string', () => {
    expect(rejectionPaths(EngineContextSchema, contextJson({ localDate: '' }))).toEqual(['localDate']);
    expect(rejectionPaths(EngineContextSchema, contextJson({ localDate: STARTED_AT_MS }))).toEqual(['localDate']);
  });
});

describe('proteinAdequacy must be between 0 and 1', () => {
  it('accepts both bounds', () => {
    expect(accept(EngineContextSchema, contextJson({ proteinAdequacy: 0 })).proteinAdequacy).toBe(0);
    expect(accept(EngineContextSchema, contextJson({ proteinAdequacy: 1 })).proteinAdequacy).toBe(1);
  });

  it('rejects a value below zero', () => {
    expect(rejectionPaths(EngineContextSchema, contextJson({ proteinAdequacy: -0.01 }))).toEqual(['proteinAdequacy']);
  });

  it('rejects a value above one — a percentage, not a ratio, is the classic caller bug', () => {
    expect(rejectionPaths(EngineContextSchema, contextJson({ proteinAdequacy: 1.01 }))).toEqual(['proteinAdequacy']);
    expect(rejectionPaths(EngineContextSchema, contextJson({ proteinAdequacy: 75 }))).toEqual(['proteinAdequacy']);
  });
});

describe('remaining EngineContext rules', () => {
  it('rejects an empty timezone', () => {
    expect(rejectionPaths(EngineContextSchema, contextJson({ timezone: '' }))).toEqual(['timezone']);
  });

  it('rejects fractional or negative EP totals — EP is a non-negative integer', () => {
    expect(rejectionPaths(EngineContextSchema, contextJson({ epToday: 12.5 }))).toEqual(['epToday']);
    expect(rejectionPaths(EngineContextSchema, contextJson({ epThisWeek: -1 }))).toEqual(['epThisWeek']);
  });

  it('applies the same heart-rate bounds to maxHr and restingHr', () => {
    expect(rejectionPaths(EngineContextSchema, contextJson({ maxHr: HR_MAX_BPM + 1 }))).toEqual(['maxHr']);
    expect(rejectionPaths(EngineContextSchema, contextJson({ restingHr: HR_MIN_BPM - 1 }))).toEqual(['restingHr']);
  });
});

describe('Hero and StatBlock rules', () => {
  it('rejects level zero — levels are 1-based', () => {
    expect(rejectionPaths(HeroSchema, heroJson({ level: 0 }))).toEqual(['level']);
  });

  it('rejects fractional or negative xp and gold', () => {
    expect(rejectionPaths(HeroSchema, heroJson({ xp: 10.5 }))).toEqual(['xp']);
    expect(rejectionPaths(HeroSchema, heroJson({ gold: -1 }))).toEqual(['gold']);
  });

  it('rejects an empty id or name', () => {
    expect(rejectionPaths(HeroSchema, heroJson({ id: '' }))).toEqual(['id']);
    expect(rejectionPaths(HeroSchema, heroJson({ name: '' }))).toEqual(['name']);
  });

  it('rejects an unknown hero class', () => {
    expect(rejectionPaths(HeroSchema, heroJson({ heroClass: 'NECROMANCER' }))).toEqual(['heroClass']);
  });

  it('rejects a stat block with any stat missing', () => {
    for (const key of STAT_KEYS) {
      const partial: Record<string, number> = { ...VALID_STATS };
      delete partial[key];
      expect(rejectionPaths(HeroSchema, heroJson({ stats: partial }))).toEqual([`stats.${key}`]);
    }
  });

  it('rejects negative or fractional stats', () => {
    expect(rejectionPaths(StatBlockSchema, { ...VALID_STATS, str: -1 })).toEqual(['str']);
    expect(rejectionPaths(StatBlockSchema, { ...VALID_STATS, foc: 1.5 })).toEqual(['foc']);
  });
});

describe('RewardEntry rules', () => {
  it('allows a negative amount, so corrections stay append-only rows', () => {
    expect(accept(RewardEntrySchema, rewardJson({ amount: -50 })).amount).toBe(-50);
  });

  it('rejects a fractional amount — float folds are order-dependent', () => {
    expect(rejectionPaths(RewardEntrySchema, rewardJson({ amount: 0.5 }))).toEqual(['amount']);
  });

  it('rejects an unknown reward kind', () => {
    expect(rejectionPaths(RewardEntrySchema, rewardJson({ kind: 'STAT_LUK' }))).toEqual(['kind']);
  });

  it('rejects a missing or empty engineVersion — an unattributable row cannot be re-scored', () => {
    expect(rejectionPaths(RewardEntrySchema, rewardJson({ engineVersion: '' }))).toEqual(['engineVersion']);
    const { engineVersion: _omitted, ...withoutVersion } = VALID_REWARD;
    expect(rejectionPaths(RewardEntrySchema, withoutVersion)).toEqual(['engineVersion']);
  });
});

describe('BattleEvent and BattleLog rules', () => {
  it('rejects turn zero — turns are 1-based', () => {
    expect(rejectionPaths(BattleEventSchema, eventJson({ turn: 0 }))).toEqual(['turn']);
  });

  it('rejects negative HP — the simulator must clamp at zero', () => {
    expect(rejectionPaths(BattleEventSchema, eventJson({ heroHp: -1 }))).toEqual(['heroHp']);
    expect(rejectionPaths(BattleEventSchema, eventJson({ enemyHp: -3 }))).toEqual(['enemyHp']);
  });

  it('rejects a signed amount — magnitude only, direction comes from actor and type', () => {
    expect(rejectionPaths(BattleEventSchema, eventJson({ amount: -14 }))).toEqual(['amount']);
  });

  it('rejects unknown actors and event types', () => {
    expect(rejectionPaths(BattleEventSchema, eventJson({ actor: 'BOSS' }))).toEqual(['actor']);
    expect(rejectionPaths(BattleEventSchema, eventJson({ type: 'PARRY' }))).toEqual(['type']);
  });

  it('rejects an empty event list — an unreplayable log', () => {
    expect(rejectionPaths(BattleLogSchema, battleLogJson({ events: [] }))).toEqual(['events']);
  });

  it('reports the index of a bad event inside the list', () => {
    expect(rejectionPaths(BattleLogSchema, battleLogJson({ events: [VALID_EVENT, eventJson({ actor: 'BOSS' })] }))).toEqual(['events.1.actor']);
  });

  it('rejects a non-integer seed — the PRNG is seeded with an integer', () => {
    expect(rejectionPaths(BattleLogSchema, battleLogJson({ seed: 0.5 }))).toEqual(['seed']);
    expect(rejectionPaths(BattleLogSchema, battleLogJson({ seed: 'abc' }))).toEqual(['seed']);
  });

  it('rejects an unknown outcome and an empty simVersion', () => {
    expect(rejectionPaths(BattleLogSchema, battleLogJson({ outcome: 'DRAW' }))).toEqual(['outcome']);
    expect(rejectionPaths(BattleLogSchema, battleLogJson({ simVersion: '' }))).toEqual(['simVersion']);
  });
});

describe('unknown trust tiers', () => {
  it('rejects a raw platform string used in place of a TrustTier', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ trustTier: 'HEALTHKIT' }))).toEqual(['trustTier']);
  });

  it('rejects an empty activityType', () => {
    expect(rejectionPaths(ActivityInputSchema, activityJson({ activityType: '' }))).toEqual(['activityType']);
  });
});

/* -------------------------------------------------------------------------- *
 * Typed boundary parsers
 * -------------------------------------------------------------------------- */

describe('typed boundary parsers', () => {
  it('return values typed as the hand-written contract', () => {
    const activity: ActivityInput = parseActivityInput(activityJson());
    const context: EngineContext = parseEngineContext(contextJson());
    const hero: Hero = parseHero(heroJson());
    const reward: RewardEntry = parseRewardEntry(rewardJson());
    const log: BattleLog = parseBattleLog(battleLogJson());

    expect(activity).toEqual(VALID_ACTIVITY);
    expect(context).toEqual(VALID_CONTEXT);
    expect(hero).toEqual(VALID_HERO);
    expect(reward).toEqual(VALID_REWARD);
    expect(log).toEqual(VALID_BATTLE_LOG);
  });

  it('throw ZodError on invalid input', () => {
    expect(() => parseActivityInput(activityJson({ durationSec: 0 }))).toThrow(z.ZodError);
    expect(() => parseEngineContext(contextJson({ localDate: 'yesterday' }))).toThrow(z.ZodError);
    expect(() => parseHero(heroJson({ level: 0 }))).toThrow(z.ZodError);
    expect(() => parseRewardEntry(rewardJson({ amount: 1.5 }))).toThrow(z.ZodError);
    expect(() => parseBattleLog(battleLogJson({ outcome: 'DRAW' }))).toThrow(z.ZodError);
  });
});

/* -------------------------------------------------------------------------- *
 * Closed lists: exhaustive and frozen as const
 * -------------------------------------------------------------------------- */

describe('closed lists are exhaustive', () => {
  /**
   * Each `Record<Union, true>` below fails `tsc` if a union member has no entry, and the
   * runtime comparison fails if the list and the record disagree. Together they pin the
   * list, the union and this test to the same set of members.
   */
  it('STAT_KEYS covers every StatKey, in canonical order', () => {
    const everyStat: Record<StatKey, true> = { str: true, agi: true, end: true, vit: true, foc: true, spi: true };
    expect(STAT_KEYS).toEqual(['str', 'agi', 'end', 'vit', 'foc', 'spi']);
    expect([...STAT_KEYS].sort()).toEqual(Object.keys(everyStat).sort());
    expect(new Set(STAT_KEYS).size).toBe(STAT_KEYS.length);
  });

  it('HERO_CLASSES covers every HeroClass', () => {
    const everyClass: Record<HeroClass, true> = { WARRIOR: true, MAGE: true, ROGUE: true, PRIEST: true, PALADIN: true };
    expect(HERO_CLASSES).toEqual(['WARRIOR', 'MAGE', 'ROGUE', 'PRIEST', 'PALADIN']);
    expect([...HERO_CLASSES].sort()).toEqual(Object.keys(everyClass).sort());
    expect(new Set(HERO_CLASSES).size).toBe(HERO_CLASSES.length);
  });

  it('MODALITIES covers every Modality', () => {
    const everyModality: Record<Modality, true> = {
      strength: true,
      cardio_steady: true,
      cardio_intense: true,
      sport_racket: true,
      sport_team: true,
      swim: true,
      cycle: true,
      mobility: true,
      walk: true,
      recovery: true,
      other: true,
    };
    expect(MODALITIES).toEqual([
      'strength',
      'cardio_steady',
      'cardio_intense',
      'sport_racket',
      'sport_team',
      'swim',
      'cycle',
      'mobility',
      'walk',
      'recovery',
      'other',
    ]);
    expect([...MODALITIES].sort()).toEqual(Object.keys(everyModality).sort());
    expect(new Set(MODALITIES).size).toBe(MODALITIES.length);
    expect(MODALITIES).toContain('other');
  });

  it('the tier, reward, cap and battle lists cover their unions', () => {
    const everyTrustTier: Record<TrustTier, true> = { DEVICE_VERIFIED: true, APP_TRACKED: true, MANUAL: true };
    const everyIntensityTier: Record<IntensityTier, true> = { HR_ZONES: true, MET_TABLE: true, CALORIES: true, FLOOR: true };
    const everyCapReason: Record<CapReason, true> = { DAILY_SOFT: true, WEEKLY_HARD: true };
    const everyActor: Record<BattleActor, true> = { HERO: true, ENEMY: true };
    const everyOutcome: Record<BattleOutcome, true> = { WIN: true, LOSS: true };
    const everyEventType: Record<BattleEventType, true> = {
      ATTACK: true,
      CRIT: true,
      BLOCK: true,
      HIT: true,
      REGEN: true,
      FAINT: true,
      VICTORY: true,
      DEFEAT: true,
    };
    const everyRewardKind: Record<RewardKind, true> = {
      XP: true,
      GOLD: true,
      STAT_STR: true,
      STAT_AGI: true,
      STAT_END: true,
      STAT_VIT: true,
      STAT_FOC: true,
      STAT_SPI: true,
      ITEM_DROP: true,
    };

    expect([...TRUST_TIERS].sort()).toEqual(Object.keys(everyTrustTier).sort());
    expect([...INTENSITY_TIERS].sort()).toEqual(Object.keys(everyIntensityTier).sort());
    expect([...CAP_REASONS].sort()).toEqual(Object.keys(everyCapReason).sort());
    expect([...BATTLE_ACTORS].sort()).toEqual(Object.keys(everyActor).sort());
    expect([...BATTLE_OUTCOMES].sort()).toEqual(Object.keys(everyOutcome).sort());
    expect([...BATTLE_EVENT_TYPES].sort()).toEqual(Object.keys(everyEventType).sort());
    expect([...REWARD_KINDS].sort()).toEqual(Object.keys(everyRewardKind).sort());
  });

  it('INTENSITY_TIERS is ordered best fidelity first, ending in the never-throw floor', () => {
    expect(INTENSITY_TIERS).toEqual(['HR_ZONES', 'MET_TABLE', 'CALORIES', 'FLOOR']);
    expect(INTENSITY_TIERS[INTENSITY_TIERS.length - 1]).toBe('FLOOR');
  });

  it('every stat has a matching STAT_* reward kind', () => {
    for (const key of STAT_KEYS) {
      expect(REWARD_KINDS).toContain(`STAT_${key.toUpperCase()}`);
    }
    const statRewardKinds = REWARD_KINDS.filter((kind) => kind.startsWith('STAT_'));
    expect(statRewardKinds).toHaveLength(STAT_KEYS.length);
  });
});

describe('closed lists are frozen as const, not mutable arrays', () => {
  it('STAT_KEYS is a readonly tuple', () => {
    // @ts-expect-error a readonly `as const` tuple must not be assignable to a mutable string[]
    const mutable: string[] = STAT_KEYS;
    expect(mutable).toBe(STAT_KEYS);
  });

  it('HERO_CLASSES is a readonly tuple', () => {
    // @ts-expect-error a readonly `as const` tuple must not be assignable to a mutable string[]
    const mutable: string[] = HERO_CLASSES;
    expect(mutable).toBe(HERO_CLASSES);
  });

  it('MODALITIES is a readonly tuple', () => {
    // @ts-expect-error a readonly `as const` tuple must not be assignable to a mutable string[]
    const mutable: string[] = MODALITIES;
    expect(mutable).toBe(MODALITIES);
  });

  it('exposes literal member types, not widened string', () => {
    // These fail to compile if any list loses its `as const`.
    const firstStat: 'str' = STAT_KEYS[0];
    const firstClass: 'WARRIOR' = HERO_CLASSES[0];
    const firstModality: 'strength' = MODALITIES[0];
    expect([firstStat, firstClass, firstModality]).toEqual(['str', 'WARRIOR', 'strength']);
  });
});
