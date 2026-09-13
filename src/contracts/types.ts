/**
 * ASCEND game-engine — the shared contract, expressed as plain TypeScript.
 *
 * ZERO IMPORTS BY DESIGN. `mobile-app` imports `@ascend/game-engine/types` to get the
 * engine's vocabulary without pulling zod — or anything else — into a React Native
 * bundle. Every symbol here must stay expressible in plain TypeScript with no
 * dependencies. Runtime validation lives next door in `./schemas.ts`, which the
 * backend imports at its HTTP boundary and mobile never imports at all.
 *
 * This file is the contract between three packages (engine, backend, mobile).
 * Renaming a field here is a breaking change for all three simultaneously.
 */

/* -------------------------------------------------------------------------- *
 * Internal compile-time helpers. Not exported: they emit no runtime code and
 * are not part of the contract surface.
 * -------------------------------------------------------------------------- */

/**
 * Fails to typecheck unless `Source` is assignable to `Target`.
 *
 * Used below to pin each `as const` list to its hand-written union type in both
 * directions. A union member with no entry in the list (or vice versa) then fails
 * `tsc`, instead of silently producing a schema that accepts the wrong strings.
 */
type AssertAssignable<Target, Source extends Target> = Source;

/* -------------------------------------------------------------------------- *
 * Stats
 * -------------------------------------------------------------------------- */

/**
 * The six earned stats, in canonical display order.
 *
 * Exists as a runtime list (not just a type) because both the schema layer and the
 * ledger fold need to iterate every stat exactly once; a hand-maintained second
 * copy of this list is the classic way stat blocks end up with a silently missing
 * key. Order is stable and part of the contract — mobile renders stats in it.
 */
export const STAT_KEYS = ['str', 'agi', 'end', 'vit', 'foc', 'spi'] as const;

/** A single earned stat. Derived from `STAT_KEYS`, which is the single source of truth. */
export type StatKey = (typeof STAT_KEYS)[number];

/**
 * A complete set of the six stats.
 *
 * Deliberately total (`Record`, not `Partial`): a missing key folds into `undefined`
 * and then `NaN` the moment arithmetic touches it, which would corrupt a hero
 * irreversibly rather than throwing. Every stat block carries all six keys, always.
 */
export type StatBlock = Record<StatKey, number>;

/* -------------------------------------------------------------------------- *
 * Classes
 * -------------------------------------------------------------------------- */

/**
 * The five hero classes.
 *
 * Class is what makes the same workout worth different rewards to different players:
 * it selects which real training modality converts efficiently and which one carries
 * the deliberate neglect penalty. Runtime list so schemas and class tables can both
 * derive from it.
 */
export const HERO_CLASSES = ['WARRIOR', 'MAGE', 'ROGUE', 'PRIEST', 'PALADIN'] as const;

/** A hero's class. Fixed at creation; drives attack stat, modality weights and penalties. */
export type HeroClass = (typeof HERO_CLASSES)[number];

/* -------------------------------------------------------------------------- *
 * Modalities
 * -------------------------------------------------------------------------- */

/**
 * The engine's normalised training taxonomy.
 *
 * Raw HealthKit / Health Connect activity strings are a large, platform-specific and
 * silently-changing vocabulary. Mapping them onto this small closed set at the edge
 * means the reward tables are written once against a stable taxonomy, and an unknown
 * platform string degrades to `'other'` instead of throwing on a user's real workout.
 */
export const MODALITIES = [
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
] as const;

/** A normalised training modality — the engine's own vocabulary, never a raw platform string. */
export type Modality = (typeof MODALITIES)[number];

/* -------------------------------------------------------------------------- *
 * Provenance and fidelity tiers
 * -------------------------------------------------------------------------- */

/**
 * How much the engine should trust that an activity actually happened.
 *
 * A fitness RPG is trivially cheatable via manual entry, so provenance is a first-class
 * input to the reward maths rather than an afterthought: device-verified work can be
 * worth more than self-reported work without ever having to reject a user's entry.
 */
export type TrustTier = 'DEVICE_VERIFIED' | 'APP_TRACKED' | 'MANUAL';

/** Runtime companion to `TrustTier`, ordered most to least trusted. Feeds the zod enum. */
export const TRUST_TIERS = ['DEVICE_VERIFIED', 'APP_TRACKED', 'MANUAL'] as const;

type _TrustTiersAreExhaustive = [
  AssertAssignable<(typeof TRUST_TIERS)[number], TrustTier>,
  AssertAssignable<TrustTier, (typeof TRUST_TIERS)[number]>,
];

/**
 * Which intensity signal the EP calculation was actually able to use, best first.
 *
 * Real HealthKit data is patchy — heart rate is often absent, calories sometimes are
 * too — so the engine never throws for missing signal, it falls down the ladder to
 * `FLOOR`. Recording the tier that was used is what makes a suspiciously small reward
 * explainable after the fact ("no HR, no kcal, floor rate applied") and what lets a
 * later backfill be recognised as an upgrade rather than a change of mind.
 */
export type IntensityTier = 'HR_ZONES' | 'MET_TABLE' | 'CALORIES' | 'FLOOR';

/** Runtime companion to `IntensityTier`, in descending order of fidelity. */
export const INTENSITY_TIERS = ['HR_ZONES', 'MET_TABLE', 'CALORIES', 'FLOOR'] as const;

type _IntensityTiersAreExhaustive = [
  AssertAssignable<(typeof INTENSITY_TIERS)[number], IntensityTier>,
  AssertAssignable<IntensityTier, (typeof INTENSITY_TIERS)[number]>,
];

/* -------------------------------------------------------------------------- *
 * Engine inputs
 * -------------------------------------------------------------------------- */

/**
 * One logged training session, normalised at the edge but not yet scored.
 *
 * This is the engine's only view of the real world. `activityType` stays the RAW
 * platform string (e.g. `'HKWorkoutActivityTypeTraditionalStrengthTraining'`) rather
 * than a `Modality`, so that the raw value survives into storage: the modality mapping
 * is engine tuning and will change, and being able to re-derive it from the original
 * string is what makes an old ledger re-scorable after a rebalance.
 *
 * Optional fields are optional because the device genuinely may not have produced
 * them — absence is normal data, not an error.
 */
export interface ActivityInput {
  /** Raw platform activity string, verbatim from HealthKit / Health Connect. */
  activityType: string;
  /** Session duration in whole seconds. Positive; the engine converts to minutes itself. */
  durationSec: number;
  /** Session start, epoch milliseconds UTC. Used for ordering and day bucketing by the caller. */
  startedAtMs: number;
  /** Session end, epoch milliseconds UTC. Never earlier than `startedAtMs`. */
  endedAtMs: number;
  /** Provenance of this record — an input to the reward maths, not just metadata. */
  trustTier: TrustTier;
  /** Distance in metres, when the device reported one. Absent for most strength work. */
  distanceM?: number;
  /** Active kilocalories, when reported. Feeds the `CALORIES` intensity tier. */
  activeKcal?: number;
  /** Average heart rate in bpm, when reported. Feeds the preferred `HR_ZONES` tier. */
  avgHr?: number;
}

/**
 * Everything about the player and the moment that the engine needs but must not look up.
 *
 * The engine has no clock, no timezone database, no network and no store (see the repo
 * invariants), so every ambient fact arrives here as an argument.
 *
 * WHY `localDate` IS PASSED IN AND NEVER DERIVED HERE:
 *  1. Deriving it needs the current instant and a timezone database. Reading the clock
 *     is banned outright — determinism is the whole point of this package, and a
 *     function that reads a clock cannot be replayed.
 *  2. "Which day does this count towards" is a PRODUCT decision, not a maths one: the
 *     app buckets a day by the user's own timezone and its rollover rule (a 23:40 gym
 *     session and a 00:20 one belong to the same training day for a user, not to two
 *     calendar dates). That rule belongs to the caller, which knows the user's profile.
 *  3. Daily and weekly caps key off this value. If the engine computed it, replaying a
 *     ledger from a server in a different region — or after the user travels — would
 *     bucket old activities into different days, apply different caps, and silently
 *     produce a different hero from identical inputs. Passing it in freezes the bucket
 *     at the moment of logging, so replay is stable forever.
 */
export interface EngineContext {
  /** IANA timezone id of the user at log time, e.g. `'Europe/Sofia'`. Carried for auditing/explanations. */
  timezone: string;
  /** The training day this activity counts towards, `YYYY-MM-DD`. COMPUTED BY THE CALLER — see above. */
  localDate: string;
  /** EP already banked on `localDate` before this activity. Drives the daily soft cap. */
  epToday: number;
  /** EP already banked in the current training week. Drives the weekly hard cap. */
  epThisWeek: number;
  /** Known max heart rate in bpm. Without it the engine cannot use HR zones and drops a tier. */
  maxHr?: number;
  /** Known resting heart rate in bpm. Sharpens HR-zone intensity when present. */
  restingHr?: number;
  /** Protein intake adequacy for the day, 0..1. Modifies strength gains; absent means "unknown", not zero. */
  proteinAdequacy?: number;
}

/* -------------------------------------------------------------------------- *
 * Hero
 * -------------------------------------------------------------------------- */

/**
 * A hero as the app knows it: identity plus the current totals of the ledger.
 *
 * Carries only EARNED values. Combat numbers are absent on purpose — they are derived
 * (see `DerivedCombat`) so that a rebalance changes every hero at once instead of
 * leaving stale precomputed values scattered through the database.
 */
export interface Hero {
  /** Stable hero id, owned by the backend. Opaque to the engine. */
  id: string;
  /** Player-chosen display name. Never used in any calculation. */
  name: string;
  /** Class, fixed at creation. Selects modality efficiency and the neglect penalty. */
  heroClass: HeroClass;
  /** Current level, 1-based. Derived from `xp` via the level curve; stored for cheap reads. */
  level: number;
  /** Lifetime experience, an integer by invariant — float folds are order-dependent. */
  xp: number;
  /** Current spendable gold, an integer by invariant. */
  gold: number;
  /** The six earned stats. */
  stats: StatBlock;
}

/**
 * The totals produced by folding a reward ledger — a hero minus its identity.
 *
 * Separate from `Hero` because the fold is a pure function over ledger entries that
 * knows nothing about ids or names, and because it is what the shuffle-invariance test
 * compares: fold(entries) must equal fold(shuffle(entries)), field for field.
 */
export interface HeroState {
  /** Level implied by `xp` under the current level curve. */
  level: number;
  /** Summed XP. Integer. */
  xp: number;
  /** Summed gold. Integer. */
  gold: number;
  /** Summed stats. Every key present. */
  stats: StatBlock;
}

/* -------------------------------------------------------------------------- *
 * Rewards
 * -------------------------------------------------------------------------- */

/**
 * What a single ledger entry grants.
 *
 * One flat union rather than nested shapes so a ledger row stays a trivially storable
 * `(kind, amount)` pair: append-only, cheap to sum, and easy to add to without a
 * migration. The `STAT_*` members mirror `STAT_KEYS` uppercased — the assertion below
 * makes adding a seventh stat without its reward kind a compile error.
 */
export type RewardKind =
  | 'XP'
  | 'GOLD'
  | 'STAT_STR'
  | 'STAT_AGI'
  | 'STAT_END'
  | 'STAT_VIT'
  | 'STAT_FOC'
  | 'STAT_SPI'
  | 'ITEM_DROP'
  /*
   * ============================================================================
   * THE ENTIRE COUPLING BETWEEN TRAINING AND THE PVE WORLD.
   * ============================================================================
   * A key buys one dungeon run; a sigil buys one boss attempt. They are ledger
   * rows like any other — append-only, integer, folded to a balance — so a
   * player's key count is re-derivable forever and cannot drift from what they
   * actually earned.
   *
   * NOTE WHAT IS NOT HERE, AND WILL NEVER BE: there is no `EP_DROP` and no
   * `STAT_*` that PVE may write. Training is the only tap; PVE is the sink. The
   * moment couch-PVE grants power this stops being a fitness game with an RPG
   * attached and becomes an ordinary mobile RPG that reads a watch.
   *
   * These two kinds exist precisely so that PVE has something to spend WITHOUT
   * having something to earn.
   */
  | 'KEY_DROP'
  | 'SIGIL_DROP';

/** Runtime companion to `RewardKind`. Feeds the zod enum; order is not significant. */
export const REWARD_KINDS = [
  'XP',
  'GOLD',
  'STAT_STR',
  'STAT_AGI',
  'STAT_END',
  'STAT_VIT',
  'STAT_FOC',
  'STAT_SPI',
  'ITEM_DROP',
  'KEY_DROP',
  'SIGIL_DROP',
] as const;

type _RewardKindsAreExhaustive = [
  AssertAssignable<(typeof REWARD_KINDS)[number], RewardKind>,
  AssertAssignable<RewardKind, (typeof REWARD_KINDS)[number]>,
  /** Every stat in `STAT_KEYS` must have a matching `STAT_*` reward kind. */
  AssertAssignable<RewardKind, `STAT_${Uppercase<StatKey>}`>,
];

/**
 * One immutable row of the reward ledger.
 *
 * The ledger is append-only and is the only durable record of progression: hero totals
 * are a fold over it, never the source of truth. `engineVersion` is stamped per entry
 * (not per hero) because entries written by different engine versions coexist forever
 * in one ledger, and a rebalance must be able to find, explain, or re-score exactly the
 * rows a given version produced.
 */
export interface RewardEntry {
  /** Which resource this row grants. */
  kind: RewardKind;
  /** Integer amount. Signed: a correction or decay row may be negative, so the ledger stays append-only. */
  amount: number;
  /** The `ENGINE_VERSION` that produced this row. Never reused across output changes. */
  engineVersion: string;
}

/**
 * The scored result of one activity, before it becomes ledger rows.
 *
 * Keeps `rawEp` alongside the capped `ep` and the `capReason` because "you trained but
 * earned nothing" is the single most support-generating outcome in this genre; the app
 * can only explain it if the engine hands back what was earned, what was kept, and why.
 * `intensityTier` and `modality` are returned for the same reason — they are the two
 * inputs a user cannot see for themselves.
 */
export interface EffortResult {
  /** Effort points actually awarded after caps. Integer. */
  ep: number;
  /** Which intensity signal was available and used. */
  intensityTier: IntensityTier;
  /** The normalised modality the raw `activityType` mapped to. */
  modality: Modality;
  /** Effort points before any cap was applied. Integer. Equals `ep` when nothing was capped. */
  rawEp: number;
  /** Which cap trimmed `rawEp` down to `ep`. Absent means no cap applied. */
  capReason?: CapReason;
}

/**
 * Why an effort score was trimmed.
 *
 * `DAILY_SOFT` tapers a big day, `WEEKLY_HARD` is an absolute ceiling that exists to
 * make grinding — and cheating — pointless rather than merely inefficient.
 */
export type CapReason = 'DAILY_SOFT' | 'WEEKLY_HARD';

/** Runtime companion to `CapReason`. */
export const CAP_REASONS = ['DAILY_SOFT', 'WEEKLY_HARD'] as const;

type _CapReasonsAreExhaustive = [
  AssertAssignable<(typeof CAP_REASONS)[number], CapReason>,
  AssertAssignable<CapReason, (typeof CAP_REASONS)[number]>,
];

/* -------------------------------------------------------------------------- *
 * Combat
 * -------------------------------------------------------------------------- */

/**
 * Combat numbers computed from a hero's level, class and stats.
 *
 * Never stored and never part of `Hero`: they are a pure projection, so tuning the
 * formulas re-derives every hero in the game at once and no database row can go stale.
 */
export interface DerivedCombat {
  /** Max hit points, from VIT and level. Integer. */
  hp: number;
  /** Attack power, from the class primary stat. Integer. */
  attack: number;
  /** Damage mitigation, from VIT. Integer. */
  defence: number;
  /** Critical hit chance in PERCENTAGE POINTS (0..100, e.g. `7.5` means 7.5%), from AGI. May be fractional. */
  critPct: number;
  /**
   * Chance to avoid a blow entirely, in percentage points.
   *
   * Added in ENGINE_VERSION 0.6.0. OPTIONAL on the contract so a stored
   * `heroSnapshot` written before it still parses — an old battle must stay
   * replayable, and a required field would make every pre-0.6.0 snapshot
   * invalid the moment it was read back.
   */
  dodgePct?: number;
  /** Hit points recovered per turn, from SPI. Integer. */
  regen: number;
  /** Turns sustainable before fatigue, from END. Integer. */
  stamina: number;
  /**
   * The school this hero's blows belong to.
   *
   * COMES FROM THE WEAPON FIRST, and from the class only when no weapon is held.
   * That is what makes an elemental weapon a real choice rather than a stat
   * stick: picking up a frost blade changes what you are, and therefore what
   * resists you. Optional on the contract for the same reason as `dodgePct` —
   * a snapshot written before schools existed must still parse.
   */
  damageType?: DamageType;
  /** What this hero shrugs off, in percentage points, by school. */
  resistance?: ResistanceBlock;
}

/** Which side of a battle acted. */
export type BattleActor = 'HERO' | 'ENEMY';

/** Runtime companion to `BattleActor`. */
export const BATTLE_ACTORS = ['HERO', 'ENEMY'] as const;

type _BattleActorsAreExhaustive = [
  AssertAssignable<(typeof BATTLE_ACTORS)[number], BattleActor>,
  AssertAssignable<BattleActor, (typeof BATTLE_ACTORS)[number]>,
];

/**
 * What happened in one battle event.
 *
 * A closed set so the app can render a battle log entirely from data — no strings from
 * the engine, no copy shipped inside a versioned dependency, and full localisation on
 * the client.
 */
export type BattleEventType =
  | 'ATTACK'
  | 'CRIT'
  | 'BLOCK'
  | 'HIT'
  | 'REGEN'
  | 'FAINT'
  | 'VICTORY'
  | 'DEFEAT';

/** Runtime companion to `BattleEventType`. */
export const BATTLE_EVENT_TYPES = [
  'ATTACK',
  'CRIT',
  'BLOCK',
  'HIT',
  'REGEN',
  'FAINT',
  'VICTORY',
  'DEFEAT',
] as const;

type _BattleEventTypesAreExhaustive = [
  AssertAssignable<(typeof BATTLE_EVENT_TYPES)[number], BattleEventType>,
  AssertAssignable<BattleEventType, (typeof BATTLE_EVENT_TYPES)[number]>,
];

/**
 * A single beat of a battle, carrying the full HP state after it resolved.
 *
 * Both HP values ride on every event so the client can animate the log frame by frame
 * without re-running any maths — the client must never simulate, or it becomes a second
 * implementation of the rules that can disagree with the server.
 */
export interface BattleEvent {
  /** 1-based turn number. Framing events (`VICTORY`, `DEFEAT`) carry the turn they resolved on. */
  turn: number;
  /** Who acted. */
  actor: BattleActor;
  /** What happened. */
  type: BattleEventType;
  /** Magnitude of the effect, unsigned — direction is implied by `actor` and `type`. Integer. */
  amount: number;
  /** Hero HP after this event resolved. Clamped at 0, never negative. */
  heroHp: number;
  /** Enemy HP after this event resolved. Clamped at 0, never negative. */
  enemyHp: number;
}

/* -------------------------------------------------------------------------- *
 * Damage schools
 * -------------------------------------------------------------------------- */

/**
 * The schools a blow can belong to.
 *
 * ============================================================================
 * SIX, AND THEY COME FROM THE CLASSES RATHER THAN FROM A COLOUR WHEEL.
 * ============================================================================
 * `PHYSICAL` is what every fight in this game was until now. The other five map
 * onto what the five classes and their fifteen specs already are: a Mage is Fire,
 * Frost or Lightning, a Priest is Spirit or Shadow, a Paladin is Holy. Inventing
 * a seventh school with no class behind it would be a resistance nobody can
 * meaningfully carry and a damage type nobody can deal.
 *
 * ORDER IS DISPLAY ORDER and is contract: a hero sheet lists resistances in it.
 */
export type DamageType = 'PHYSICAL' | 'FIRE' | 'FROST' | 'LIGHTNING' | 'SHADOW' | 'HOLY';

/** Runtime companion to `DamageType`. Order is display order. */
export const DAMAGE_TYPES = [
  'PHYSICAL',
  'FIRE',
  'FROST',
  'LIGHTNING',
  'SHADOW',
  'HOLY',
] as const;

type _DamageTypesAreExhaustive = [
  AssertAssignable<(typeof DAMAGE_TYPES)[number], DamageType>,
  AssertAssignable<DamageType, (typeof DAMAGE_TYPES)[number]>,
];

/**
 * Resistance to each school, in PERCENTAGE POINTS.
 *
 * ============================================================================
 * A PERCENTAGE, BECAUSE DEFENCE IS ALREADY A SUBTRACTION.
 * ============================================================================
 * `defence` is flat: it comes off every blow whatever the blow was. If resistance
 * were also flat it would be a second defence with a label, and stacking the two
 * would be the only thing worth doing. A percentage is a genuinely different
 * axis — it is worth most against the big hits defence barely dents, which is
 * exactly the case defence is bad at.
 *
 * CAPPED IN THE SIMULATOR (`RESIST_CAP_PCT`), never here. A block that could
 * reach 100 would be immunity, and immunity to a school is a build that cannot
 * lose to it — which turns gear selection into a lookup rather than a decision.
 *
 * An absent school means zero. Absent rather than zero-filled so an item that
 * wards nothing carries no resistance field at all, and a diff of the catalogue
 * shows what was actually authored.
 */
export type ResistanceBlock = Partial<Record<DamageType, number>>;

/**
 * A battle opponent. Plain data so encounters can be content, tuned or added without
 * touching engine code.
 */
export interface Encounter {
  /** Stable encounter id, referenced by `BattleLog.encounterId`. */
  id: string;
  /** Display name. Never used in any calculation. */
  name: string;
  /** Starting hit points. Integer. */
  hp: number;
  /** Attack power. Integer. */
  attack: number;
  /** Damage mitigation. Integer. */
  defence: number;
  /** Encounter level, used for matchmaking and reward scaling. */
  level: number;
  /**
   * The school this creature's blows belong to. `PHYSICAL` when absent.
   *
   * OPTIONAL so every encounter authored before schools existed still parses and
   * still fights exactly as it did — a stored `encounterSnapshot` must stay
   * replayable, and a required field would invalidate every one of them.
   */
  damageType?: DamageType;
  /** What this creature shrugs off. Absent means it resists nothing. */
  resistance?: ResistanceBlock;
}

/** The two possible endings of a battle. A battle always terminates in one of them. */
export type BattleOutcome = 'WIN' | 'LOSS';

/** Runtime companion to `BattleOutcome`. */
export const BATTLE_OUTCOMES = ['WIN', 'LOSS'] as const;

type _BattleOutcomesAreExhaustive = [
  AssertAssignable<(typeof BATTLE_OUTCOMES)[number], BattleOutcome>,
  AssertAssignable<BattleOutcome, (typeof BATTLE_OUTCOMES)[number]>,
];

/**
 * The complete, replayable record of one battle.
 *
 * Stores `seed` and `simVersion` rather than trusting the event list, because the
 * events are an artefact: given the same hero, encounter, seed and sim version, the
 * simulator must reproduce this log event for event. That is what lets a disputed
 * battle be re-run, and what makes `simVersion` mandatory — a log produced by an older
 * simulator can only be re-derived by that same simulator, so versions are never reused.
 */
export interface BattleLog {
  /** The `Encounter.id` that was fought. */
  encounterId: string;
  /** The integer seed handed to the in-package PRNG. Replaying with it reproduces `events` exactly. */
  seed: number;
  /** The `SIM_VERSION` that produced this log. Bumped on any output change. */
  simVersion: string;
  /** Ordered battle beats, oldest first. Terminates with `VICTORY` or `DEFEAT`. */
  events: BattleEvent[];
  /** The result, from the hero's point of view. */
  outcome: BattleOutcome;
  /** Number of turns the battle lasted. */
  turns: number;
}

/* -------------------------------------------------------------------------- *
 * Gear
 * -------------------------------------------------------------------------- */

/**
 * Equipment slots. One item per slot, so a hero's power is bounded by slot count
 * rather than by how much loot they have hoarded.
 */
export const ITEM_SLOTS = ['weapon', 'head', 'chest', 'hands', 'legs', 'trinket'] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

/**
 * Rarity tiers, weakest to strongest. Ordered on purpose — drop tables and sort
 * order both depend on the index, so never reorder this list.
 */
export const RARITIES = ['POOR', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;
export type Rarity = (typeof RARITIES)[number];

/**
 * A piece of gear. Definitions are DATA, so the catalogue is retunable without a release.
 *
 * `setId` groups items into a set. Set bonuses are what reward class-appropriate
 * TRAINING rather than just accumulation: a set that boosts strength conversion is only
 * worth wearing if you actually lift.
 *
 * Gear NEVER becomes obsolete (§4.11) — the effort behind it was real, so there is no
 * expansion-style reset. Power comes from slots and sets, never from an item treadmill.
 */
export interface Item {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: Rarity;
  /** Flat additions to the six base stats. Absent keys contribute nothing. */
  statBonus: Partial<Record<StatKey, number>>;
  setId?: string;
  /** Gold price when bought from the shop. Omitted for drop-only items. */
  price?: number;
  /** Minimum hero level required to equip. */
  levelRequirement: number;
  /**
   * For a WEAPON: the school its wielder's blows become.
   *
   * Meaningless on armour, and absent there rather than defaulted, so the
   * catalogue reads as what was authored. A weapon without one deals `PHYSICAL`.
   */
  damageType?: DamageType;
  /**
   * What wearing this wards off, in percentage points, by school.
   *
   * FROM THE TEMPLATE, NOT FROM THE ROLL. Two drops of one helm have different
   * stats and the SAME resistance: a roll decides how good an item is, and
   * resistance decides what KIND of item it is. Rolling it too would make
   * "frost-warded" a property of an instance rather than of a piece of gear, and
   * a player could not go looking for one.
   */
  resistance?: ResistanceBlock;
}

/** What the hero currently has equipped. A slot with no entry is empty. */
export type EquippedItems = Partial<Record<ItemSlot, Item>>;

/**
 * A set bonus, applied when enough pieces of the same set are equipped.
 *
 * `modalityConversionBonus` is the interesting field: it MULTIPLIES how efficiently a
 * real training modality converts. That is what ties gear back to behaviour instead of
 * making it a pure stat stick.
 *
 * SEMANTICS, because the name invites the wrong reading: these are MULTIPLIERS, not
 * additive percentages. `1.1` means +10%; identity is `1`, NOT `0`; multiple active
 * bonuses compose as a PRODUCT. An additive reading of `0.1` would silently reduce
 * conversion to a tenth instead of raising it by a tenth.
 */
export interface ItemSetBonus {
  setId: string;
  piecesRequired: number;
  statBonus: Partial<Record<StatKey, number>>;
  modalityConversionBonus?: Partial<Record<Modality, number>>;
}

/* -------------------------------------------------------------------------- *
 * Strength set logging
 * -------------------------------------------------------------------------- */

/**
 * One logged set. OPTIONAL everywhere: health platforms expose no sets, reps or weights,
 * so the game must feel complete without this. Logging it earns a quality multiplier on
 * the strength portion of an activity, never a requirement.
 */
export interface StrengthSet {
  exercise: string;
  reps: number;
  /** Kilograms. Bodyweight movements pass 0 rather than omitting the field. */
  weightKg: number;
}

/* -------------------------------------------------------------------------- *
 * Daily quests and streaks
 * -------------------------------------------------------------------------- */

/**
 * Kinds of daily goal. Deliberately modest — at least one must be reachable by a walk,
 * so a bad day still yields a win rather than a broken streak.
 */
export const QUEST_KINDS = ['ANY_ACTIVITY', 'REACH_EP', 'SPECIFIC_MODALITY', 'RECOVER'] as const;
export type QuestKind = (typeof QUEST_KINDS)[number];

export interface DailyQuest {
  id: string;
  kind: QuestKind;
  /** Human-readable goal, generated from the kind and target. */
  description: string;
  /** EP for REACH_EP, session count otherwise. */
  target: number;
  progress: number;
  complete: boolean;
  /** Set for SPECIFIC_MODALITY, absent otherwise. */
  modality?: Modality;
  rewardEp: number;
}

/**
 * Streak state.
 *
 * `graceRemaining` is the forgiveness budget: one missed day per rolling week is absorbed
 * automatically before a streak breaks, and the player is TOLD it was used. Streak loss is
 * the single biggest churn trigger in this category, and a streak never wipes earned
 * progress — only the multiplier.
 */
export interface StreakState {
  current: number;
  longest: number;
  /** YYYY-MM-DD of the last qualifying day, or null for a hero who has never trained. */
  lastQualifyingDate: string | null;
  graceRemaining: number;
  graceUsedOn: string | null;
  multiplier: number;
}

type _ItemSlotsAreExhaustive = [
  AssertAssignable<(typeof ITEM_SLOTS)[number], ItemSlot>,
  AssertAssignable<ItemSlot, (typeof ITEM_SLOTS)[number]>,
];
type _RaritiesAreExhaustive = [
  AssertAssignable<(typeof RARITIES)[number], Rarity>,
  AssertAssignable<Rarity, (typeof RARITIES)[number]>,
];
type _QuestKindsAreExhaustive = [
  AssertAssignable<(typeof QUEST_KINDS)[number], QuestKind>,
  AssertAssignable<QuestKind, (typeof QUEST_KINDS)[number]>,
];

/* -------------------------------------------------------------------------- *
 * Wire submission — the client's side of ingestion
 * -------------------------------------------------------------------------- */

/**
 * Where an activity came from, as CLAIMED by the client.
 */
export const ACTIVITY_SOURCES = ['HEALTHKIT', 'HEALTH_CONNECT', 'IN_APP', 'MANUAL'] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

/**
 * What a client is allowed to POST for one activity.
 *
 * NOTE WHAT IS MISSING: there is no `trustTier` here, and that omission is the point.
 *
 * `trustTier` gates ranked boards and guild goals and carries a reward multiplier, so it
 * is precisely the field an attacker wants to set. If the client asserted it, a patched
 * build would simply claim `DEVICE_VERIFIED` for a hand-typed session and the entire
 * trust-tier design (§4.9) would be decorative. The server MUST derive it — see
 * `trustTierForSource` — and must overwrite anything that arrives claiming otherwise.
 *
 * `source` is still only a client claim. Deriving from it closes the trivial attack, not
 * the deep one; real provenance needs platform attestation (App Attest / Play Integrity),
 * which is a later hardening step and is tracked separately.
 *
 * `localDate` and `timezone` are carried so the server can bucket the activity into the
 * right training day without guessing; the server should still validate them against the
 * user's stored timezone rather than trusting them outright.
 */
export interface ActivitySubmission {
  activityType: string;
  durationSec: number;
  startedAtMs: number;
  endedAtMs: number;
  source: ActivitySource;
  sourceActivityId?: string;
  distanceM?: number;
  activeKcal?: number;
  avgHr?: number;
  /** 1..10 RPE. The only intensity signal a wearable-less manual entry can offer. */
  perceivedEffort?: number;
  /** Optional strength detail. Earns a quality multiplier; never required. */
  sets?: StrengthSet[];
}

/**
 * The server-side mapping from claimed provenance to trust tier.
 *
 * This is the ONLY way a `TrustTier` should ever be produced from a request. Keep it a
 * total function over `ActivitySource` so a new source cannot be added without deciding
 * what it is worth.
 */
export const TRUST_TIER_FOR_SOURCE: Readonly<Record<ActivitySource, TrustTier>> = {
  HEALTHKIT: 'DEVICE_VERIFIED',
  HEALTH_CONNECT: 'DEVICE_VERIFIED',
  IN_APP: 'APP_TRACKED',
  MANUAL: 'MANUAL',
};

export function trustTierForSource(source: ActivitySource): TrustTier {
  return TRUST_TIER_FOR_SOURCE[source];
}

type _ActivitySourcesAreExhaustive = [
  AssertAssignable<(typeof ACTIVITY_SOURCES)[number], ActivitySource>,
  AssertAssignable<ActivitySource, (typeof ACTIVITY_SOURCES)[number]>,
];

/* -------------------------------------------------------------------------- *
 * The PVE world
 *
 * ============================================================================
 * THE GOVERNING RULE OF THIS ENTIRE SUBSYSTEM, WRITTEN WHERE IT CANNOT BE MISSED:
 *
 *     TRAINING IS THE ONLY TAP. PVE IS THE SINK.
 *
 * PVE may pay gold, gear rolls, materials, consumables, keys, sigils, cosmetics
 * and map progress. PVE may NEVER pay EP or any of the six stats. The moment
 * couch-PVE grants power, "World of Warcraft, but the grind is your real
 * training" stops being true and this becomes an ordinary mobile RPG that reads
 * a watch — competing on content volume against teams of two hundred, having
 * discarded its only structural advantage.
 *
 * The product consequence is the whole point: "I can't beat this boss" must
 * always resolve to GO TRAIN.
 *
 * Nothing in this section can enforce that on its own — it is enforced at the
 * point rewards are written, in the backend, with a test that names this rule.
 * It is restated here because this is the file all three repos read.
 * ============================================================================
 *
 * These types are in the CONTRACT rather than in `src/world/` because all three
 * repos need them: the engine produces a plan, the backend stores its seed and
 * replays it, and the client renders the forks. `src/world/` keeps only its
 * private authoring rows, exactly as `src/gear/catalogue.ts` does.
 * -------------------------------------------------------------------------- */

/**
 * What one node of a dungeon floor is.
 *
 * Deliberately small. Five kinds is enough for the push-or-extract decision to
 * have texture — fight, hard fight, heal, loot, ambush — and few enough that
 * every one of them can be rendered as a card with one line of copy.
 */
export type NodeKind = 'PACK' | 'ELITE' | 'REST' | 'CACHE' | 'STALKER';

/** Runtime companion to `NodeKind`. Order is display order on the fork. */
export const NODE_KINDS = ['PACK', 'ELITE', 'REST', 'CACHE', 'STALKER'] as const;

type _NodeKindsAreExhaustive = [
  AssertAssignable<(typeof NODE_KINDS)[number], NodeKind>,
  AssertAssignable<NodeKind, (typeof NODE_KINDS)[number]>,
];

/**
 * How dangerous one encounter is relative to its floor.
 *
 * Separate from `NodeKind` because a node is a PLACE and a rank is a CREATURE:
 * a `STALKER` node holds one elite, a `PACK` holds several trash, and a boss
 * site holds a boss. Folding the two together would mean a new node kind could
 * not reuse an existing difficulty.
 */
export type EncounterRank = 'TRASH' | 'ELITE' | 'BOSS';

/** Runtime companion to `EncounterRank`, weakest first. Order is contract. */
export const ENCOUNTER_RANKS = ['TRASH', 'ELITE', 'BOSS'] as const;

type _EncounterRanksAreExhaustive = [
  AssertAssignable<(typeof ENCOUNTER_RANKS)[number], EncounterRank>,
  AssertAssignable<EncounterRank, (typeof ENCOUNTER_RANKS)[number]>,
];

/**
 * A promise of a fight, not the fight itself.
 *
 * WHY A SPEC AND NOT AN `Encounter`: a plan is generated once and stored as a
 * seed, then re-derived every time the run is read. If the plan embedded rolled
 * numbers, the stored seed would have to reproduce the ROLL as well as the
 * layout, and any retune of the depth curve would silently change fights that
 * were already half-fought. A spec names WHAT is there; `rollEncounter` decides
 * how hard it is, at the moment it is fought, from the same seed.
 */
export interface EncounterSpec {
  /** Unique within its run. Becomes `Encounter.id`, and so `BattleLog.encounterId`. */
  id: string;
  /** Catalogue mob id this is rolled from. */
  mobId: string;
  rank: EncounterRank;
}

/** One fork option on a floor. */
export interface NodePlan {
  /** Unique within its plan. What `choosePath(runId, nodeId)` names. */
  id: string;
  kind: NodeKind;
  /**
   * The fights behind this node, in order, fought back to back with HP carried
   * forward. Empty for `REST` and `CACHE` — a node that pays without a fight is
   * the reason push-or-extract is a decision rather than an arithmetic problem.
   */
  encounterSpecs: EncounterSpec[];
}

/** One floor: a depth, and the two or three doors out of it. */
export interface FloorPlan {
  /** 1-based. Feeds the depth curve; floor 1 is the mildest. */
  depth: number;
  nodes: NodePlan[];
}

/**
 * A whole dungeon, as data.
 *
 * A PURE FUNCTION of `(zoneId, tier, affixes, seed)` — the same guarantee daily
 * quests and gear drops already give. Given a stored seed the entire dungeon
 * re-derives identically, forever, so the backend stores four small fields
 * rather than a serialised map, and a run that is resumed on another device
 * cannot disagree about what was behind the left-hand door.
 */
export interface DungeonPlan {
  zoneId: string;
  /** Difficulty step. Higher tiers are deeper and hit harder, never wider. */
  tier: number;
  /** The affixes in force, by id. Order is the order they were selected in. */
  affixes: string[];
  floors: FloorPlan[];
}

/**
 * A zone: the authoring unit of the world.
 *
 * Each zone costs one trash table, two or three named rares, one authored boss
 * and one dungeon theme. Five zones is a complete world, which is the entire
 * reason the shape is this rigid — a zone that could be "a bit different" is a
 * zone that has to be designed rather than filled in.
 */
export interface Zone {
  id: string;
  name: string;
  /** One or two sentences of tone. Rendered; never parsed. */
  description: string;
  /** Inclusive level band this zone is authored for. */
  levelMin: number;
  levelMax: number;
  /** The trash table. Rolled for Wilds sweeps and for dungeon `PACK` nodes. */
  trashMobIds: readonly string[];
  /** Named rares that spawn on per-player windows. */
  rareIds: readonly string[];
  /** The one authored boss. Killing it is what unlocks `nextZoneId`. */
  bossId: string;
  /** Flavour for the generated dungeon in this zone. */
  dungeonName: string;
  /** The zone this one's boss unlocks. Absent on the last zone in the chain. */
  nextZoneId?: string;
}

/**
 * One phase of an authored boss.
 *
 * PHASES ARE DATA AND ARE RESOLVED AS A CHAIN OF `simulate()` CALLS. No phase
 * logic enters the simulator: `bossPhaseEncounters` projects a boss into one
 * `Encounter` per phase, and the caller fights them in order carrying hero HP
 * forward. That keeps multi-phase bosses out of `SIM_VERSION` entirely — a boss
 * can be retuned, or gain a phase, without making a single historical battle
 * log unreplayable.
 */
export interface BossPhase {
  /** Rendered above the health bar. "Enraged", "The Second Breath". */
  name: string;
  /**
   * Share of the boss's total health this phase is worth, in `(0, 1]`.
   *
   * A share rather than a threshold because each phase is a SEPARATE battle: the
   * chain needs to know how much HP to give this phase, not when to interrupt a
   * fight that the simulator has no way to interrupt. Shares across a boss's
   * phases sum to 1 — asserted in the catalogue, not hoped for.
   */
  hpShare: number;
  /** Multiplies the boss's base attack for this phase. 1 is unchanged. */
  attackMultiplier: number;
  /** Multiplies the boss's base defence for this phase. 1 is unchanged. */
  defenceMultiplier: number;
}

/**
 * An affix: one line of data that changes how a whole week of dungeons feels.
 *
 * THE HIGHEST-LEVERAGE ITEM IN THE WORLD DESIGN. Ten affixes across five zones
 * with procedural floors produce a world that does not repeat, for roughly two
 * evenings of work — which is the mechanism by which one developer out-produces
 * a content team on perceived volume.
 *
 * Selection for a week is a PURE FUNCTION of `(weekKey, zoneId)`, so the
 * rotation needs no live-ops action, no scheduled job and no stored state, and
 * two clients looking at the same week cannot disagree about what is in force.
 */
export interface Affix {
  id: string;
  name: string;
  /** Player-facing copy. The client renders this; it never maps ids to strings. */
  description: string;
}
