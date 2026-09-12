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
 * ONE ZONE IS AUTHORED. THAT IS ON PURPOSE.
 * ============================================================================
 * Verdant Wastes is the reference zone: six trash, two named rares, one
 * multi-phase boss, one dungeon. The remaining four zones are a later content
 * pass, and the job of this file is to make adding them a matter of typing rows
 * rather than making decisions.
 */
import type {
  Affix,
  BossPhase,
  Encounter,
  EncounterRank,
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
  { id: 'vw-warden-of-reeds', name: 'Warden of Reeds', rank: 'TRASH', level: 9, hp: 190, attack: 20, defence: 9 },

  /* ---- Verdant Wastes: named rares -------------------------------------- */
  // Rares are ELITE-ranked but are NOT scaled by depth: they are fought where
  // they stand, on a per-player timer, and their whole job is to be a fixed
  // known quantity that a player can decide they are ready for.
  { id: 'vw-gloomstag', name: 'Gloomstag', rank: 'ELITE', level: 6, hp: 260, attack: 18, defence: 7 },
  { id: 'vw-old-mirebrood', name: 'Old Mirebrood', rank: 'ELITE', level: 9, hp: 340, attack: 24, defence: 10 },

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
    phases: [
      { name: 'Rooted', hpShare: 0.45, attackMultiplier: 1, defenceMultiplier: 1.2 },
      { name: 'Splintering', hpShare: 0.35, attackMultiplier: 1.35, defenceMultiplier: 0.8 },
      { name: 'The Drowning', hpShare: 0.2, attackMultiplier: 1.8, defenceMultiplier: 0.6 },
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
  return { id: row.id, name: row.name, hp: row.hp, attack: row.attack, defence: row.defence, level: row.level };
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
  | { kind: 'EXTRA_STALKER' };

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
