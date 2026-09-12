/**
 * ASCEND PVE world — THE TUNING SURFACE.
 *
 * PROVISIONAL, every number. Same invariant as `rewards/constants.ts` and
 * `quests/constants.ts`: rebalancing the world is a diff of this file, never an
 * archaeology exercise across `generate.ts` and `encounter.ts`.
 *
 * ============================================================================
 * THE ONE RULE THESE NUMBERS SERVE.
 * ============================================================================
 * Training is the only tap; PVE is the sink. Nothing in this file may make PVE
 * a source of power — there is no EP here, no stat, no XP curve. What is here
 * decides how HARD the world is and how OFTEN it pays, and both of those exist
 * to make "I can't beat this boss" resolve to "go train".
 *
 * The second constraint, inherited from the brief: NO FARMING IS POSSIBLE.
 * Physiology caps effort at five to ten hours a week, and the daily and weekly
 * caps tighten that further. Any number below that assumes "run it twenty times
 * for the drop" is a number that describes a game nobody can play.
 */

/* -------------------------------------------------------------------------- *
 * Depth scaling
 *
 * How much harder a mob is one floor deeper. This is the curve spec §14 defers
 * to the economy spreadsheet; the values here are a defensible starting shape,
 * not a result.
 * -------------------------------------------------------------------------- */

/**
 * Health growth per floor of depth, compounding.
 *
 * 18% doubles a mob's health by floor 5 and quadruples it by floor 9. Health is
 * the gentlest of the three to grow because it costs the player TIME rather than
 * risk: a tankier mob lengthens a fight, where a harder-hitting one can end a
 * run. Growth that lands mostly in health is growth a player can feel coming.
 */
export const DEPTH_HP_GROWTH = 0.18;

/**
 * Attack growth per floor, compounding.
 *
 * BELOW the health growth on purpose. Attack is the stat that kills runs, and a
 * curve where damage outruns health is a curve where the correct play is always
 * to extract on floor one — which deletes the only decision the run has.
 */
export const DEPTH_ATTACK_GROWTH = 0.12;

/**
 * Defence growth per floor, compounding.
 *
 * The gentlest. Defence subtracts from every blow the hero lands, so it scales
 * *super*-linearly in effect — the same +1 is worth far more against a hero who
 * hits for 10 than one who hits for 100, which means an undertrained player
 * feels it as a wall while a trained one barely notices. That asymmetry is the
 * right direction (it says: go train) but it is violent, so the number is small.
 */
export const DEPTH_DEFENCE_GROWTH = 0.07;

/**
 * The most a seeded roll may ADD to a mob's stats, as a fraction.
 *
 * ============================================================================
 * THIS IS NOT A FREE KNOB. It is bounded by the depth growths above.
 * ============================================================================
 * Variance is one-sided — `[0, ENCOUNTER_VARIANCE]`, never negative — and it
 * must not exceed the SMALLEST depth growth. If it did, the luckiest roll on
 * floor 3 could be harder than the unluckiest roll on floor 4, and "deeper is
 * never weaker" would stop being true. That property is what makes the run's
 * push-or-extract decision legible: a player who survived this floor comfortably
 * needs to know the next one is a step up, not a coin flip.
 *
 * `worldTuningIsCoherent()` below pins the relationship, and a test asserts it.
 */
export const ENCOUNTER_VARIANCE = 0.06;

/**
 * Multipliers applied on top of depth, by rank.
 *
 * An ELITE is worth about three trash and is meant to read as a decision ("do I
 * have the health for this?"). A BOSS is not on this scale at all — it is
 * authored, its profile comes from the catalogue, and this entry exists only so
 * the table is total over `EncounterRank` rather than throwing on one member.
 */
export const RANK_MULTIPLIER = {
  TRASH: 1,
  ELITE: 2.4,
  BOSS: 1,
} as const;

/* -------------------------------------------------------------------------- *
 * Dungeon shape
 * -------------------------------------------------------------------------- */

/**
 * Floors in a tier-1 dungeon.
 *
 * Three, because a run has to be finishable in one sitting on a phone and
 * because push-or-extract needs at least one real decision: with two floors the
 * choice is trivial, with six it is a commute.
 */
export const BASE_FLOOR_COUNT = 3;

/**
 * Extra floors per tier above 1.
 *
 * Tiers get DEEPER, not wider. A wider dungeon is more choices per floor, which
 * reads as noise; a deeper one is more chances to push your luck, which is the
 * game. Tier 5 is a seven-floor run.
 */
export const FLOORS_PER_TIER = 1;

/** Hard ceiling on floors, whatever tier arrives. A run must end. */
export const MAX_FLOOR_COUNT = 10;

/** Fewest doors out of a floor. Two is the minimum for a choice to exist. */
export const MIN_NODES_PER_FLOOR = 2;

/**
 * Most doors out of a floor.
 *
 * Three. Four options on a phone screen is a scroll, and a fork you have to
 * scroll to see is a fork you do not really get to weigh.
 */
export const MAX_NODES_PER_FLOOR = 3;

/**
 * Draw weights for what sits behind a door.
 *
 * PACK dominates because trash is the texture of a dungeon; REST and CACHE are
 * the two doors that pay without a fight and are deliberately scarce, since a
 * floor where both are on offer has no tension at all. STALKER is never drawn —
 * it is PLANTED by the Hunted affix, which is what makes that affix feel like an
 * event rather than a weight change.
 */
export const NODE_WEIGHT = {
  PACK: 60,
  ELITE: 18,
  REST: 12,
  CACHE: 10,
  STALKER: 0,
} as const;

/** Mobs in a `PACK` node. Fought back to back with health carried forward. */
export const PACK_SIZE_MIN = 2;
export const PACK_SIZE_MAX = 3;

/**
 * The last floor always ends in an ELITE.
 *
 * A generated dungeon needs a shape, and "it stops" is not one. An elite on the
 * final floor is the cheapest possible ending that still reads as an ending —
 * and it is the last moment the extract button is a real question.
 */
export const FINAL_FLOOR_IS_ELITE = true;

/* -------------------------------------------------------------------------- *
 * Affixes
 * -------------------------------------------------------------------------- */

/**
 * How many affixes are in force in a given week.
 *
 * Two. One is a modifier; three is a puzzle nobody asked for. Two also means the
 * PAIR is what varies — ten affixes give forty-five distinct pairs, which is
 * most of the reason a small content set stops repeating.
 */
export const AFFIXES_PER_WEEK = 2;

/* -------------------------------------------------------------------------- *
 * The run
 * -------------------------------------------------------------------------- */

/**
 * Share of pending loot kept when a run wipes. PROVISIONAL — spec §8.1.
 *
 * In an ordinary RPG a total loss is fine: the player grinds it back. Here they
 * CANNOT. Their power came from real training, there is no way to farm out of a
 * bad night, and a wipe on a Tuesday cannot be answered until the body has
 * recovered. So a total loss lands disproportionately hard, and 25% is the floor
 * that keeps the run from having been for nothing while still making extraction
 * the thing you wish you had done.
 *
 * The key is still consumed on a wipe. Keeping it would make pushing free.
 */
export const WIPE_LOOT_KEPT = 0.25;

/**
 * Health a `REST` node restores, as a share of the hero's maximum.
 *
 * Deliberately not a full heal. A full heal makes every floor independent, and
 * independent floors mean the run has no memory — which is what the carried-over
 * health bar exists to create.
 */
export const REST_HEAL_SHARE = 0.35;

/* -------------------------------------------------------------------------- *
 * Wilds
 * -------------------------------------------------------------------------- */

/**
 * Encounters resolved by one Wilds sweep.
 *
 * BATCHED BECAUSE THE SERVER SIMULATES. One mob per HTTP round trip is the
 * design that makes server authority too expensive to keep, and the moment it
 * gets expensive somebody suggests simulating on the client. Six to eight fights
 * in one request keeps the client a renderer.
 */
export const SWEEP_SIZE_MIN = 6;
export const SWEEP_SIZE_MAX = 8;

/* -------------------------------------------------------------------------- *
 * Coherence
 * -------------------------------------------------------------------------- */

/**
 * Whether the tuning above is internally consistent.
 *
 * Exported as a FUNCTION rather than asserted at module load, because this
 * package must not throw on import: a consumer that fails to start because of a
 * tuning typo fails at the worst possible moment, in production, with no useful
 * message. The test suite calls this; a human rebalancing the file can too.
 */
export function worldTuningIsCoherent(): boolean {
  const smallestGrowth = Math.min(
    DEPTH_HP_GROWTH,
    DEPTH_ATTACK_GROWTH,
    DEPTH_DEFENCE_GROWTH,
  );

  return (
    // Variance may never outrun depth, or "deeper is never weaker" breaks.
    ENCOUNTER_VARIANCE <= smallestGrowth &&
    ENCOUNTER_VARIANCE >= 0 &&
    MIN_NODES_PER_FLOOR >= 2 &&
    MAX_NODES_PER_FLOOR >= MIN_NODES_PER_FLOOR &&
    PACK_SIZE_MIN >= 1 &&
    PACK_SIZE_MAX >= PACK_SIZE_MIN &&
    SWEEP_SIZE_MIN >= 1 &&
    SWEEP_SIZE_MAX >= SWEEP_SIZE_MIN &&
    BASE_FLOOR_COUNT >= 1 &&
    MAX_FLOOR_COUNT >= BASE_FLOOR_COUNT &&
    AFFIXES_PER_WEEK >= 0 &&
    WIPE_LOOT_KEPT >= 0 &&
    WIPE_LOOT_KEPT <= 1 &&
    REST_HEAL_SHARE > 0 &&
    REST_HEAL_SHARE <= 1
  );
}

/* -------------------------------------------------------------------------- *
 * The two currencies — the ENTIRE coupling between training and the world
 *
 * ============================================================================
 * READ THIS BEFORE RETUNING EITHER NUMBER.
 * ============================================================================
 * These two odds are the only mechanism by which real training turns into
 * access to PVE. Raise them and PVE detaches from training; lower them and the
 * world is locked to a player who is doing exactly what the app asked of them.
 *
 * NO FARMING IS POSSIBLE, which is what makes this tractable. The player cannot
 * train twenty times today to get twenty keys — physiology stops them, and the
 * daily and weekly caps stop them again. So the odds can be generous without
 * creating a grind, because the number of attempts is bounded by a human body.
 * -------------------------------------------------------------------------- */

/**
 * Effort at which a session's currency chances are at full strength.
 *
 * The same anchor the gear session-drop uses, restated here rather than imported
 * so that the world's tuning surface is one file. Roughly a solid 45-minute
 * session: below it the odds taper in proportion, so a ten-minute walk and an
 * hour under the bar are not the same lottery ticket — which is both the
 * anti-gaming property and the honest one.
 */
export const CURRENCY_FULL_EP = 45;

/**
 * Chance a full-effort session yields a dungeon key.
 *
 * HIGH ON PURPOSE. The design says keys must be "common enough that a regular
 * trainer always has a run available", and that is a promise about the WORST
 * week, not the average one. Someone training four times a week expects three or
 * four runs; at 0.85 they get that, and the occasional dry session reads as
 * variance rather than as a gate.
 *
 * This is deliberately not 1.0. A guaranteed key makes the reward invisible —
 * a thing that always happens stops being a thing that happened.
 */
export const KEY_DROP_CHANCE = 0.85;

/**
 * Chance a full-effort session yields a boss sigil.
 *
 * SCARCE, and the scarcity is the product. A sigil buys one attempt at the wall
 * that means "go train", so it has to be worth walking up to — roughly one
 * every two or three weeks of consistent training. At 0.06 a four-session week
 * yields a sigil about a fifth of the time.
 *
 * The design gives sigils a second source the engine cannot see: completing a
 * dungeon. That one is the backend's, because "did this run finish?" is run
 * state. Between them, a player who both trains and clears dungeons reaches a
 * boss noticeably faster than one who only trains — which is the intended shape.
 */
export const SIGIL_DROP_CHANCE = 0.06;
