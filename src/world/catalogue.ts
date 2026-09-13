/**
 * The world catalogue — CONTENT, expressed as flat data tables.
 *
 * Same shape and the same reasons as `gear/catalogue.ts`: every consumer wants a
 * different view (the generator wants a zone's trash table, the backend wants a
 * creature by id, the client wants a zone's name and band, a balance spreadsheet
 * wants all of it as rows), and a list of plain objects serves all four while
 * branching factory code serves none.
 *
 * ============================================================================
 * IDS ARE FOREVER, AND SO ARE THE NUMBERS BESIDE THEM.
 * ============================================================================
 * `BattleLog.encounterId` stores an id, and a log is only re-derivable from its
 * seed if the creature's NUMBERS are also known. Editing the stats of an
 * existing id silently invalidates every historical battle that referenced it —
 * the fight still replays, but it replays as a different fight. Treat these rows
 * as append-only in exactly the spirit of the ledger: to rebalance a creature,
 * add a new id and retire the old one from its zone.
 *
 * The one exception is DEPTH SCALING, and it is not an exception at all: a
 * dungeon encounter's numbers come from `rollEncounter(base, depth, affixes,
 * seed)`, which is pure, so its inputs are all stored. A retune of the depth
 * curve is therefore an engine-version question, not a catalogue one.
 *
 * ============================================================================
 * FOUR ZONES, ONE SHAPE, AND THE SHAPE IS THE POINT.
 * ============================================================================
 * Verdant Wastes was authored first as the reference, and the other three are
 * the SAME shape filled in: six trash, two named rares, one multi-phase boss,
 * one dungeon, one level band. A zone that could be "a bit different" is a zone
 * that has to be designed rather than filled in, and a solo developer cannot
 * afford to design five of anything.
 *
 * Levels 1 to 40, chained by `nextZoneId`: each zone's boss opens the next. The
 * chain is data, so adding a fifth is four rows and a pointer.
 */
import type {
  Affix,
  BossPhase,
  DamageType,
  Encounter,
  EncounterRank,
  ResistanceBlock,
  Zone,
} from '../contracts/types';

/* -------------------------------------------------------------------------- *
 * Creatures
 * -------------------------------------------------------------------------- */

/**
 * One creature's BASE profile — what it is at depth zero, before any scaling.
 *
 * Internal on purpose, exactly as `gear/catalogue.ts` keeps `CatalogueRow`
 * private: the published shape is an `Encounter`, and keeping the row type here
 * means `rollEncounter` is the only way one comes into existence. Nothing can
 * hand-roll a creature whose rank and numbers disagree.
 */
interface CreatureRow {
  id: string;
  name: string;
  rank: EncounterRank;
  /** Level shown to the player and used for reward scaling. */
  level: number;
  hp: number;
  attack: number;
  defence: number;
  /**
   * The school this creature's blows belong to. `PHYSICAL` when absent.
   *
   * A ZONE'S IDENTITY IS ALSO ITS SCHOOL. The Rimewood is frozen, so its
   * creatures deal frost and shrug it off — which is what makes "what should I
   * be wearing down there" a question with an answer.
   */
  damageType?: DamageType;
  /** What this creature shrugs off, by school. Absent means it resists nothing. */
  resistance?: ResistanceBlock;
  /**
   * Phases, for a BOSS and only a BOSS.
   *
   * Their `hpShare` values must sum to 1 — `bossPhasesAreCoherent()` checks it,
   * and a test calls that. A boss whose shares summed to 0.9 would quietly have
   * a tenth of its health deleted, which is the kind of bug that reads as "the
   * boss feels easy this patch" rather than as a defect.
   */
  phases?: readonly BossPhase[];
}

/**
 * THE CREATURE TABLE. Grouped by zone, then by rank, which is also roughly
 * ascending difficulty.
 *
 * Numbers are anchored to the standalone encounter table the game already ships
 * (a level-1 dummy at 40 health, a level-10 troll at 220): a Verdant Wastes
 * mob of level N should feel like the existing encounter of level N, because a
 * player who has fought both must not find that the world runs on a different
 * scale from the fight button.
 */
const CREATURE_ROWS: readonly CreatureRow[] = [
  /* ---- Verdant Wastes: trash ------------------------------------------- */
  { id: 'vw-thornling', name: 'Thornling', rank: 'TRASH', level: 1, hp: 38, attack: 4, defence: 1 },
  { id: 'vw-bog-skitter', name: 'Bog Skitter', rank: 'TRASH', level: 2, hp: 55, attack: 6, defence: 2 },
  { id: 'vw-rootbound-husk', name: 'Rootbound Husk', rank: 'TRASH', level: 4, hp: 95, attack: 9, defence: 4 },
  { id: 'vw-mire-hound', name: 'Mire Hound', rank: 'TRASH', level: 5, hp: 105, attack: 13, defence: 4 },
  { id: 'vw-fen-stalker', name: 'Fen Stalker', rank: 'TRASH', level: 7, hp: 140, attack: 17, defence: 6 },
  { id: 'vw-warden-of-reeds', name: 'Warden of Reeds', rank: 'TRASH', level: 9, hp: 190, attack: 20, defence: 9, resistance: { FROST: 10 } },

  /* ---- Verdant Wastes: named rares -------------------------------------- */
  // Rares are ELITE-ranked but are NOT scaled by depth: they are fought where
  // they stand, on a per-player timer, and their whole job is to be a fixed
  // known quantity that a player can decide they are ready for.
  { id: 'vw-gloomstag', name: 'Gloomstag', rank: 'ELITE', level: 6, hp: 260, attack: 18, defence: 7 },
  { id: 'vw-old-mirebrood', name: 'Old Mirebrood', rank: 'ELITE', level: 9, hp: 340, attack: 24, defence: 10, damageType: 'SHADOW', resistance: { FROST: 15 } },

  /* ---- Verdant Wastes: the boss ----------------------------------------- */
  /*
   * THE WALL THAT MEANS GO TRAIN. Three phases, fought as three battles with
   * health carried forward, because that is the only way to express a phase
   * without teaching the simulator about phases.
   *
   * The arc is the standard one and it is standard because it works: armoured
   * and slow, then the armour fails and it starts hurting, then it is dying and
   * desperate. Attack climbs while defence falls, so the fight gets faster in
   * both directions and the last phase is decided in a handful of turns.
   */
  {
    id: 'vw-rotcrown',
    name: 'Rotcrown, the Drowned Oak',
    rank: 'BOSS',
    level: 10,
    hp: 480,
    attack: 26,
    defence: 12,
    /*
     * A DROWNED OAK BURNS BADLY AND DROWNS WELL. Fire is its answer and frost is
     * not — which is the first time in the game that what you are holding
     * matters more than how big its numbers are.
     */
    damageType: 'FROST',
    resistance: { FROST: 35, PHYSICAL: 10 },
    phases: [
      { name: 'Rooted', hpShare: 0.45, attackMultiplier: 1, defenceMultiplier: 1.2 },
      { name: 'Splintering', hpShare: 0.35, attackMultiplier: 1.35, defenceMultiplier: 0.8 },
      { name: 'The Drowning', hpShare: 0.2, attackMultiplier: 1.8, defenceMultiplier: 0.6 },
    ],
  },

  /* ---- Ashen Road: trash ------------------------------------------------ *
   * A trade road under a mountain that is still burning. Ash instead of
   * weather, cinders instead of rain, and caravans that never arrived.
   *
   * BAND SCALING IS ROUGHLY 2.5x PER TEN LEVELS, matching the step from the
   * level-1 dummy to the level-10 troll in the standalone encounter table. A
   * band that scaled differently from the fight button would make the world
   * read as a separate game with its own maths.
   * ---------------------------------------------------------------------- */
  { id: 'ar-cinder-moth', name: 'Cinder Moth', rank: 'TRASH', level: 11, hp: 210, attack: 22, defence: 10 },
  { id: 'ar-ashen-drudge', name: 'Ashen Drudge', rank: 'TRASH', level: 12, hp: 250, attack: 25, defence: 11 },
  { id: 'ar-road-warden', name: 'Road Warden', rank: 'TRASH', level: 14, hp: 320, attack: 30, defence: 14 },
  { id: 'ar-slagback-boar', name: 'Slagback Boar', rank: 'TRASH', level: 16, hp: 400, attack: 36, defence: 15 },
  { id: 'ar-kiln-ghoul', name: 'Kiln Ghoul', rank: 'TRASH', level: 18, hp: 480, attack: 40, defence: 18, damageType: 'FIRE', resistance: { FIRE: 20 } },
  { id: 'ar-caravan-wraith', name: 'Caravan Wraith', rank: 'TRASH', level: 19, hp: 560, attack: 44, defence: 20 },

  /* ---- Ashen Road: named rares ------------------------------------------ */
  { id: 'ar-emberjack', name: 'Emberjack', rank: 'ELITE', level: 15, hp: 700, attack: 38, defence: 16, damageType: 'FIRE', resistance: { FIRE: 30 } },
  { id: 'ar-the-long-mule', name: 'The Long Mule', rank: 'ELITE', level: 18, hp: 950, attack: 42, defence: 22 },

  /* ---- Ashen Road: the boss --------------------------------------------- */
  {
    id: 'ar-pyreharrow',
    name: 'Pyreharrow, the Unfinished Mile',
    rank: 'BOSS',
    level: 20,
    hp: 1400,
    attack: 52,
    defence: 24,
    damageType: 'FIRE',
    resistance: { FIRE: 45 },
    phases: [
      { name: 'Smouldering', hpShare: 0.4, attackMultiplier: 1, defenceMultiplier: 1.25 },
      { name: 'Catching', hpShare: 0.35, attackMultiplier: 1.4, defenceMultiplier: 0.85 },
      { name: 'Firestorm', hpShare: 0.25, attackMultiplier: 1.9, defenceMultiplier: 0.55 },
    ],
  },

  /* ---- Sundered Coast: trash -------------------------------------------- *
   * Where the sea took the land and did not give it back. Salt, wrecks, and
   * things that came up out of deep water and stayed.
   * ---------------------------------------------------------------------- */
  { id: 'sc-brinelurker', name: 'Brinelurker', rank: 'TRASH', level: 21, hp: 620, attack: 48, defence: 22 },
  { id: 'sc-wreck-crab', name: 'Wreck Crab', rank: 'TRASH', level: 22, hp: 720, attack: 50, defence: 30 },
  { id: 'sc-drowned-oarsman', name: 'Drowned Oarsman', rank: 'TRASH', level: 24, hp: 860, attack: 58, defence: 26 },
  { id: 'sc-salt-flayer', name: 'Salt Flayer', rank: 'TRASH', level: 26, hp: 1000, attack: 66, defence: 29 },
  { id: 'sc-tide-priest', name: 'Tide Priest', rank: 'TRASH', level: 28, hp: 1180, attack: 74, defence: 33, damageType: 'FROST', resistance: { FROST: 25 } },
  { id: 'sc-hullbreaker', name: 'Hullbreaker', rank: 'TRASH', level: 29, hp: 1400, attack: 82, defence: 38 },

  /* ---- Sundered Coast: named rares -------------------------------------- */
  { id: 'sc-the-grey-mother', name: 'The Grey Mother', rank: 'ELITE', level: 25, hp: 1900, attack: 68, defence: 32 },
  { id: 'sc-anchorsaint', name: 'Anchorsaint', rank: 'ELITE', level: 28, hp: 2400, attack: 78, defence: 42, damageType: 'HOLY', resistance: { FROST: 30, HOLY: 20 } },

  /* ---- Sundered Coast: the boss ----------------------------------------- */
  {
    id: 'sc-maelstrand',
    name: 'Maelstrand, the Standing Wave',
    rank: 'BOSS',
    level: 30,
    hp: 3500,
    attack: 96,
    defence: 44,
    /*
     * A STANDING WAVE. Lightning runs through salt water, so it is what this
     * throws — and frost is what it laughs at.
     */
    damageType: 'LIGHTNING',
    resistance: { FROST: 50, LIGHTNING: 30 },
    phases: [
      { name: 'Rising', hpShare: 0.35, attackMultiplier: 0.9, defenceMultiplier: 1.3 },
      { name: 'Breaking', hpShare: 0.4, attackMultiplier: 1.35, defenceMultiplier: 0.9 },
      { name: 'Undertow', hpShare: 0.25, attackMultiplier: 1.85, defenceMultiplier: 0.6 },
    ],
  },

  /* ---- The Rimewood: trash ---------------------------------------------- *
   * A forest that froze mid-motion and has not moved since. Everything here is
   * preserved rather than dead, which is worse.
   * ---------------------------------------------------------------------- */
  { id: 'rw-frostbitten-elk', name: 'Frostbitten Elk', rank: 'TRASH', level: 31, hp: 1500, attack: 88, defence: 42 },
  { id: 'rw-rime-stalker', name: 'Rime Stalker', rank: 'TRASH', level: 32, hp: 1700, attack: 98, defence: 44 },
  { id: 'rw-hollow-pine', name: 'Hollow Pine', rank: 'TRASH', level: 34, hp: 2100, attack: 104, defence: 56 },
  { id: 'rw-glass-wolf', name: 'Glass Wolf', rank: 'TRASH', level: 36, hp: 2400, attack: 122, defence: 50, damageType: 'FROST', resistance: { FROST: 40 } },
  { id: 'rw-winter-warden', name: 'Winter Warden', rank: 'TRASH', level: 38, hp: 2800, attack: 134, defence: 62, damageType: 'FROST', resistance: { FROST: 45 } },
  { id: 'rw-the-still-hunter', name: 'The Still Hunter', rank: 'TRASH', level: 39, hp: 3200, attack: 150, defence: 70 },

  /* ---- The Rimewood: named rares ---------------------------------------- */
  { id: 'rw-snowblind', name: 'Snowblind', rank: 'ELITE', level: 35, hp: 4200, attack: 128, defence: 58 },
  { id: 'rw-the-long-winter', name: 'The Long Winter', rank: 'ELITE', level: 38, hp: 5400, attack: 142, defence: 72, damageType: 'FROST', resistance: { FROST: 55, PHYSICAL: 15 } },

  /* ---- The Rimewood: the boss ------------------------------------------- *
   * FOUR PHASES, not three. The last authored zone should end on something
   * structurally bigger than everything before it, and a phase is the cheapest
   * way to say that — it costs one row of data and reads as an escalation the
   * player can feel rather than as a number they have to be told about.
   * ---------------------------------------------------------------------- */
  {
    id: 'rw-hoarfather',
    name: 'The Hoarfather',
    rank: 'BOSS',
    level: 40,
    hp: 8000,
    attack: 165,
    defence: 78,
    /*
     * AT THE CAP, AND NOT ABOVE IT. Sixty is the ceiling the simulator applies,
     * so authoring more would be a number that read as meaningful and did
     * nothing. Frost is simply the wrong thing to bring here; fire is the answer,
     * and the whole zone has been saying so for ten levels.
     */
    damageType: 'FROST',
    resistance: { FROST: 60, PHYSICAL: 20, SHADOW: 15 },
    phases: [
      { name: 'Sleeping', hpShare: 0.3, attackMultiplier: 0.85, defenceMultiplier: 1.4 },
      { name: 'Stirring', hpShare: 0.3, attackMultiplier: 1.15, defenceMultiplier: 1.1 },
      { name: 'Waking', hpShare: 0.25, attackMultiplier: 1.5, defenceMultiplier: 0.85 },
      { name: 'The Long Dark', hpShare: 0.15, attackMultiplier: 2.1, defenceMultiplier: 0.5 },
    ],
  },

];

const CREATURES_BY_ID: Readonly<Record<string, CreatureRow>> = Object.freeze(
  Object.fromEntries(CREATURE_ROWS.map((row) => [row.id, row])),
);

/**
 * A creature's base profile as a plain `Encounter`.
 *
 * Returns `null` for an unknown id rather than throwing. A run stored last month
 * may name a creature this build has retired, and a lookup that threw would turn
 * "one encounter is missing" into "this player's run cannot be opened at all".
 */
export function creatureById(creatureId: string): Encounter | null {
  const row = CREATURES_BY_ID[creatureId];
  if (row === undefined) return null;
  return {
    id: row.id,
    name: row.name,
    hp: row.hp,
    attack: row.attack,
    defence: row.defence,
    level: row.level,
    ...(row.damageType === undefined ? {} : { damageType: row.damageType }),
    // Copied, not shared: a caller that mutated an encounter must not retune the
    // catalogue for everybody else.
    ...(row.resistance === undefined ? {} : { resistance: { ...row.resistance } }),
  };
}

/** A creature's rank, or `null` when the id is unknown. */
export function creatureRank(creatureId: string): EncounterRank | null {
  return CREATURES_BY_ID[creatureId]?.rank ?? null;
}

/** Every creature id in the catalogue. For validation and for content tests. */
export const CREATURE_IDS: readonly string[] = CREATURE_ROWS.map((row) => row.id);

/* -------------------------------------------------------------------------- *
 * Bosses
 * -------------------------------------------------------------------------- */

/**
 * A boss projected into one `Encounter` per phase.
 *
 * ============================================================================
 * THIS IS HOW A MULTI-PHASE BOSS EXISTS WITHOUT THE SIMULATOR KNOWING ANYTHING.
 * ============================================================================
 * Each phase becomes a whole battle with its own share of the boss's health and
 * its own attack and defence. The caller fights them in order, carrying hero
 * health forward and stopping at the first loss. `simulate()` is untouched, no
 * historical log becomes unreplayable, and `SIM_VERSION` does not move.
 *
 * Phase ids are suffixed `#1`, `#2`, ... so every battle in the chain has a
 * distinct `encounterId` and the run replays as an ordered sequence rather than
 * as three logs that all claim to be the same fight.
 *
 * Health is floored at 1 per phase: a phase with a tiny share and a small boss
 * could otherwise round to zero health, and an enemy that starts dead produces a
 * battle log with no events in it.
 *
 * @returns One encounter per phase, in order. `null` for an unknown id, and a
 *          single-element chain for a creature with no phases — which is the
 *          right answer for a rare or a trash mob and means a caller never has
 *          to ask whether something is a boss before fighting it.
 */
export function bossPhaseEncounters(creatureId: string): Encounter[] | null {
  const row = CREATURES_BY_ID[creatureId];
  if (row === undefined) return null;

  const phases = row.phases;
  if (phases === undefined || phases.length === 0) {
    const base = creatureById(creatureId);
    return base === null ? null : [base];
  }

  return phases.map((phase, index) => ({
    id: `${row.id}#${index + 1}`,
    name: `${row.name} — ${phase.name}`,
    hp: Math.max(1, Math.round(row.hp * phase.hpShare)),
    attack: Math.max(0, Math.round(row.attack * phase.attackMultiplier)),
    defence: Math.max(0, Math.round(row.defence * phase.defenceMultiplier)),
    level: row.level,
    /*
     * THE SCHOOL AND THE WARDS SURVIVE EVERY PHASE. A boss that dealt frost in
     * phase one and physical in phase two would make the gear a player chose on
     * the way in wrong halfway through, for reasons nothing announced.
     */
    ...(row.damageType === undefined ? {} : { damageType: row.damageType }),
    ...(row.resistance === undefined ? {} : { resistance: { ...row.resistance } }),
  }));
}

/** The phases of a boss, for a client that wants to name the one it is fighting. */
export function bossPhases(creatureId: string): readonly BossPhase[] {
  return CREATURES_BY_ID[creatureId]?.phases ?? [];
}

/**
 * Whether every authored boss's phase shares sum to 1.
 *
 * A function rather than a load-time assertion, for the reason given in
 * `constants.ts`: this package must not throw on import. The test suite calls
 * it, so a content author who mistypes a share finds out in CI rather than in
 * the field, where the symptom would be "the boss feels easy this patch".
 */
export function bossPhasesAreCoherent(): boolean {
  const TOLERANCE = 1e-9;

  return CREATURE_ROWS.every((row) => {
    if (row.phases === undefined) return true;
    if (row.phases.length === 0) return false;

    const total = row.phases.reduce((sum, phase) => sum + phase.hpShare, 0);
    return (
      Math.abs(total - 1) < TOLERANCE &&
      row.phases.every(
        (phase) =>
          phase.hpShare > 0 &&
          phase.attackMultiplier >= 0 &&
          phase.defenceMultiplier >= 0,
      )
    );
  });
}

/* -------------------------------------------------------------------------- *
 * Zones
 * -------------------------------------------------------------------------- */

/**
 * THE ZONE TABLE.
 *
 * One authored zone. `nextZoneId` is absent because there is nothing after it
 * yet — which is honest, and is also exactly what the client needs in order to
 * say "this is the edge of the known world" rather than showing a locked door
 * onto nothing.
 */
const ZONE_ROWS: readonly Zone[] = [
  {
    id: 'verdant-wastes',
    name: 'The Verdant Wastes',
    description:
      'Drowned farmland that the forest took back. The water here never drains, and what grows in it has learned to move.',
    levelMin: 1,
    levelMax: 10,
    trashMobIds: [
      'vw-thornling',
      'vw-bog-skitter',
      'vw-rootbound-husk',
      'vw-mire-hound',
      'vw-fen-stalker',
      'vw-warden-of-reeds',
    ],
    rareIds: ['vw-gloomstag', 'vw-old-mirebrood'],
    bossId: 'vw-rotcrown',
    dungeonName: 'The Sunken Warren',
    nextZoneId: 'ashen-road',
  },
  {
    id: 'ashen-road',
    name: 'The Ashen Road',
    description:
      'A trade road under a mountain that is still burning. Ash instead of weather, cinders instead of rain, and caravans that never arrived.',
    levelMin: 10,
    levelMax: 20,
    trashMobIds: [
      'ar-cinder-moth',
      'ar-ashen-drudge',
      'ar-road-warden',
      'ar-slagback-boar',
      'ar-kiln-ghoul',
      'ar-caravan-wraith',
    ],
    rareIds: ['ar-emberjack', 'ar-the-long-mule'],
    bossId: 'ar-pyreharrow',
    dungeonName: 'The Cinder Run',
    nextZoneId: 'sundered-coast',
  },
  {
    id: 'sundered-coast',
    name: 'The Sundered Coast',
    description:
      'Where the sea took the land and did not give it back. Salt, wrecks, and things that came up out of deep water and stayed.',
    levelMin: 20,
    levelMax: 30,
    trashMobIds: [
      'sc-brinelurker',
      'sc-wreck-crab',
      'sc-drowned-oarsman',
      'sc-salt-flayer',
      'sc-tide-priest',
      'sc-hullbreaker',
    ],
    rareIds: ['sc-the-grey-mother', 'sc-anchorsaint'],
    bossId: 'sc-maelstrand',
    dungeonName: 'The Sunken Ladder',
    nextZoneId: 'the-rimewood',
  },
  {
    /*
     * THE LAST ZONE, AND `nextZoneId` IS ABSENT RATHER THAN POINTING NOWHERE.
     * That is what lets the client say "this is the edge of the known world"
     * instead of rendering a locked door onto a zone that does not exist.
     */
    id: 'the-rimewood',
    name: 'The Rimewood',
    description:
      'A forest that froze mid-motion and has not moved since. Everything here is preserved rather than dead, which is worse.',
    levelMin: 30,
    levelMax: 40,
    trashMobIds: [
      'rw-frostbitten-elk',
      'rw-rime-stalker',
      'rw-hollow-pine',
      'rw-glass-wolf',
      'rw-winter-warden',
      'rw-the-still-hunter',
    ],
    rareIds: ['rw-snowblind', 'rw-the-long-winter'],
    bossId: 'rw-hoarfather',
    dungeonName: 'The White Silence',
  },
];

export const ZONES: readonly Zone[] = Object.freeze(ZONE_ROWS);

const ZONES_BY_ID: Readonly<Record<string, Zone>> = Object.freeze(
  Object.fromEntries(ZONE_ROWS.map((zone) => [zone.id, zone])),
);

/** A zone by id, or `null`. Unknown ids degrade; they never throw. */
export function zoneById(zoneId: string): Zone | null {
  return ZONES_BY_ID[zoneId] ?? null;
}

/**
 * Whether every zone's creature references actually resolve.
 *
 * The one content check worth having: a zone that names a mob id with a typo
 * generates dungeons with an unresolvable encounter in them, and the symptom
 * surfaces three layers away as a run that cannot be fought.
 */
export function zonesAreCoherent(): boolean {
  return ZONE_ROWS.every(
    (zone) =>
      zone.levelMin >= 1 &&
      zone.levelMax >= zone.levelMin &&
      zone.trashMobIds.length > 0 &&
      zone.trashMobIds.every((id) => creatureById(id) !== null) &&
      zone.rareIds.every((id) => creatureById(id) !== null) &&
      creatureById(zone.bossId) !== null &&
      // A boss must actually be ranked as one, or the phase chain is a surprise.
      creatureRank(zone.bossId) === 'BOSS' &&
      (zone.nextZoneId === undefined || ZONES_BY_ID[zone.nextZoneId] !== undefined),
  );
}

/* -------------------------------------------------------------------------- *
 * Affixes
 * -------------------------------------------------------------------------- */

/**
 * What an affix actually does, mechanically.
 *
 * ============================================================================
 * EVERY EFFECT HERE IS EXPRESSIBLE WITHOUT TOUCHING THE SIMULATOR. THAT IS THE
 * CONSTRAINT, AND IT SHAPED THE CONTENT.
 * ============================================================================
 * The design named four affixes, two of which are turn-loop behaviours —
 * "enemies regenerate 5% max health per turn" and "critical hits deal double
 * damage, both sides". Neither can be built without modifying `simulate()`,
 * which the same design lists as a non-goal, and which would bump `SIM_VERSION`
 * and make every stored battle log re-derivable only by the old simulator.
 *
 * So they are authored as the closest thing the encounter numbers CAN say:
 *
 *   Drowned  regeneration over a fight IS extra effective health, so it is
 *            extra health. The difficulty is faithful; the texture is not —
 *            there are no visible regen events in the log.
 *   Brittle  "everything is brittle": both sides die faster. Expressed as more
 *            enemy attack and much less enemy defence, so fights are short and
 *            violent in both directions, which is what the name promises even
 *            though the mechanism is not crits.
 *
 * Real turn-loop affixes are a deliberate, separate decision — an additive
 * modifier argument to `simulate()` and a `SIM_VERSION` bump — and should be
 * taken on their own merits, not smuggled in under a content pass.
 */
type AffixEffect =
  | {
      kind: 'ENCOUNTER_STAT';
      /** Fractional change. `0.4` is +40%; `-0.35` is −35%. Absent is no change. */
      hpPct?: number;
      attackPct?: number;
      defencePct?: number;
    }
  | { kind: 'NO_REST_NODES' }
  | { kind: 'NO_CACHE_NODES' }
  | { kind: 'EXTRA_STALKER' }
  | { kind: 'BIGGER_PACKS' }
  | { kind: 'EXTRA_FLOOR' };

interface AffixRow extends Affix {
  effect: AffixEffect;
}

/**
 * THE AFFIX TABLE.
 *
 * Four authored; the design calls for ten, and the remaining six are a content
 * pass. Each is one line of mechanics and two of copy, which is the entire
 * reason affixes are the highest-leverage item in this design: four of them
 * already give six distinct weekly pairs across one zone.
 */
const AFFIX_ROWS: readonly AffixRow[] = [
  {
    id: 'drowned',
    name: 'Drowned',
    description:
      'The standing water will not let anything die. Everything down here takes far more killing.',
    effect: { kind: 'ENCOUNTER_STAT', hpPct: 0.4 },
  },
  {
    id: 'brittle',
    name: 'Brittle',
    description:
      'Nothing here holds together. Blows land harder and armour counts for little — on both sides.',
    effect: { kind: 'ENCOUNTER_STAT', attackPct: 0.25, defencePct: -0.35 },
  },
  {
    id: 'starving',
    name: 'Starving',
    description: 'Nothing is left to forage. There is nowhere to stop and catch your breath.',
    effect: { kind: 'NO_REST_NODES' },
  },
  {
    id: 'hunted',
    name: 'Hunted',
    description: 'Something has your scent, and it is already ahead of you.',
    effect: { kind: 'EXTRA_STALKER' },
  },

  /* ---------------------------------------------------------------------- *
   * The second six.
   *
   * SPLIT EVENLY DOWN THE TWO AXES, deliberately: five change the CREATURES and
   * five change the LAYOUT. A rotation weighted towards one of those would feel
   * like the same week twice — "everything is tougher again" — where a pair
   * drawn from both reads as a different dungeon.
   * ---------------------------------------------------------------------- */
  {
    id: 'tempered',
    name: 'Tempered',
    description: 'Everything down here is armoured. Your blows land, and they do not land hard.',
    effect: { kind: 'ENCOUNTER_STAT', defencePct: 0.6 },
  },
  {
    id: 'frenzied',
    name: 'Frenzied',
    description: 'Fast, thin and furious. Fights end quickly — one way or the other.',
    effect: { kind: 'ENCOUNTER_STAT', attackPct: 0.4, hpPct: -0.25 },
  },
  {
    id: 'spiteful',
    name: 'Spiteful',
    description: 'They hit back harder than anything that size has any right to.',
    effect: { kind: 'ENCOUNTER_STAT', attackPct: 0.3 },
  },
  {
    id: 'teeming',
    name: 'Teeming',
    description: 'There are more of them than there should be. They come together.',
    effect: { kind: 'BIGGER_PACKS' },
  },
  {
    id: 'barren',
    name: 'Barren',
    description: 'Someone has already been through here. Nothing is left lying about.',
    effect: { kind: 'NO_CACHE_NODES' },
  },
  {
    id: 'entombed',
    name: 'Entombed',
    description: 'It goes deeper than it should. There is another floor down there.',
    effect: { kind: 'EXTRA_FLOOR' },
  },
];

/** Every affix, as the player-facing projection. Order is stable and is contract. */
export const AFFIXES: readonly Affix[] = Object.freeze(
  AFFIX_ROWS.map(({ id, name, description }) => Object.freeze({ id, name, description })),
);

/** Every affix id, in the same order. This is what the weekly rotation draws from. */
export const AFFIX_IDS: readonly string[] = AFFIXES.map((affix) => affix.id);

const AFFIXES_BY_ID: Readonly<Record<string, AffixRow>> = Object.freeze(
  Object.fromEntries(AFFIX_ROWS.map((row) => [row.id, row])),
);

/** An affix's player-facing copy, or `null` for an id this build does not know. */
export function affixById(affixId: string): Affix | null {
  const row = AFFIXES_BY_ID[affixId];
  if (row === undefined) return null;
  return { id: row.id, name: row.name, description: row.description };
}

/**
 * An affix's mechanics.
 *
 * Internal to the world module by convention — `generate.ts` and `encounter.ts`
 * are the only callers, and nothing outside this package should be branching on
 * an affix's mechanism. It is exported only because those two are separate
 * files; it is deliberately NOT re-exported from `index.ts`.
 */
export function affixEffect(affixId: string): AffixEffect | null {
  return AFFIXES_BY_ID[affixId]?.effect ?? null;
}

/** Whether a set of affix ids contains one with this mechanism. */
export function hasAffixKind(affixIds: readonly string[], kind: AffixEffect['kind']): boolean {
  return affixIds.some((id) => affixEffect(id)?.kind === kind);
}
