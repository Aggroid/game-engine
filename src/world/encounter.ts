import type { Encounter, EncounterSpec } from '../contracts/types';
import { affixEffect, creatureById } from './catalogue';
import {
  DEPTH_ATTACK_GROWTH,
  DEPTH_DEFENCE_GROWTH,
  DEPTH_HP_GROWTH,
  ENCOUNTER_VARIANCE,
  RANK_MULTIPLIER,
} from './constants';

/**
 * Turning a promise of a fight into a fight.
 *
 * ============================================================================
 * THE SIMULATOR IS NOT MODIFIED, AND THIS FILE IS THE REASON IT DOES NOT HAVE
 * TO BE.
 * ============================================================================
 * `Encounter` is already flat data — id, name, hp, attack, defence, level — and
 * the whole of the PVE world's difficulty lives in those five numbers. Depth,
 * rank and affixes are therefore arithmetic applied BEFORE `simulate()` is
 * called, not behaviour inside it. Nothing here can make a stored battle log
 * unreplayable, and `SIM_VERSION` never moves for a world change.
 *
 * PURE, and the same seed always gives the same fight — which is what lets the
 * backend store four small fields per run instead of a serialised dungeon, and
 * lets a run resumed on a second device agree with the first about exactly how
 * hard the thing behind the left-hand door was.
 *
 * THE ORDER OF OPERATIONS IS PART OF THE CONTRACT:
 *
 *     base  ->  x rank  ->  x depth  ->  x affixes  ->  + variance  ->  round
 *
 * Variance is applied LAST and is one-sided, for the monotonicity guarantee in
 * `constants.ts`: deeper is never weaker. Applying it earlier would let it
 * compound with depth and blow through that bound at the deep end, where it
 * matters most.
 */

/** Compounding growth, guarded against a depth that is not a sane number. */
function compound(base: number, growth: number, depth: number): number {
  const floors = Math.max(0, Math.trunc(Number.isFinite(depth) ? depth : 0));
  return base * (1 + growth) ** floors;
}

/**
 * Scales one creature into the encounter that is actually fought.
 *
 * ============================================================================
 * DEPTH IS 1-BASED AND FLOOR 1 IS UNSCALED.
 * ============================================================================
 * A floor-1 mob is exactly its catalogue row. That is worth stating because the
 * alternative — floor 1 already being 18% above the table — makes the catalogue
 * numbers unreadable: an author tuning "Thornling: 38 health" would have no way
 * to know what a player actually meets.
 *
 * @param spec    Which creature, at what rank. Rank comes from the SPEC, not the
 *                catalogue row: the same trash mob is an ordinary kill in a PACK
 *                and a real problem as the thing a STALKER node sent after you.
 * @param depth   1-based floor. Values below 1 are treated as 1, never as an
 *                error — a run row from an older build is data, not an argument.
 * @param affixes Affix ids in force. Unknown ids are SKIPPED, so a run stored
 *                under a newer build degrades to the affixes this engine knows
 *                rather than failing to derive at all.
 * @param seed    The caller's. Consumes exactly THREE numbers from the derived
 *                stream, always, in the order hp, attack, defence — see below.
 * @returns The encounter to hand to `simulate()`, or `null` for a creature id
 *          this build has retired.
 */
export function rollEncounter(
  spec: EncounterSpec,
  depth: number,
  affixes: readonly string[],
  rng: () => number,
): Encounter | null {
  const base = creatureById(spec.mobId);
  if (base === null) return null;

  /*
   * THREE DRAWS, UNCONDITIONALLY, IN A FIXED ORDER. Same discipline as the
   * battle simulator and `rollSessionDrop`: a draw that happens only on some
   * branches makes the stream position depend on the branch, and every later
   * roll from the same seed shifts. So all three are taken before anything is
   * decided, even for a creature whose affixes will leave one of them unused.
   */
  const hpRoll = rng();
  const attackRoll = rng();
  const defenceRoll = rng();

  const rank = RANK_MULTIPLIER[spec.rank] ?? 1;
  // Floor 1 is the catalogue row: the exponent is depth - 1, not depth.
  const floors = Math.max(0, Math.trunc(Number.isFinite(depth) ? depth : 1) - 1);

  let hp = compound(base.hp * rank, DEPTH_HP_GROWTH, floors);
  let attack = compound(base.attack * rank, DEPTH_ATTACK_GROWTH, floors);
  let defence = compound(base.defence * rank, DEPTH_DEFENCE_GROWTH, floors);

  for (const affixId of affixes) {
    const effect = affixEffect(affixId);
    // Unknown or non-stat affixes are skipped; generation affixes act elsewhere.
    if (effect === null || effect.kind !== 'ENCOUNTER_STAT') continue;
    hp *= 1 + (effect.hpPct ?? 0);
    attack *= 1 + (effect.attackPct ?? 0);
    defence *= 1 + (effect.defencePct ?? 0);
  }

  return {
    id: spec.id,
    name: base.name,
    // Health is floored at 1: an enemy that starts dead produces an empty log.
    hp: Math.max(1, Math.round(hp * (1 + hpRoll * ENCOUNTER_VARIANCE))),
    attack: Math.max(0, Math.round(attack * (1 + attackRoll * ENCOUNTER_VARIANCE))),
    defence: Math.max(0, Math.round(defence * (1 + defenceRoll * ENCOUNTER_VARIANCE))),
    /*
     * LEVEL IS NOT SCALED BY DEPTH. It is the creature's identity — what the
     * player is told they are fighting, and what reward scaling reads. A mob
     * whose level climbed with depth would make a deep floor of a low-level
     * dungeon pay like high-level content, which is the exact shape of the
     * farming loop this design exists to prevent.
     */
    level: base.level,
  };
}

/**
 * The full chain of encounters behind one node, in the order they are fought.
 *
 * Health carries across them — that is the caller's job, and it is what makes a
 * three-mob pack a different proposition from three separate fights.
 *
 * Skips specs whose creature this build no longer knows, rather than returning
 * `null` for the whole node: losing one mob from a pack degrades a run, where
 * losing the node strands it.
 */
export function rollNodeEncounters(
  specs: readonly EncounterSpec[],
  depth: number,
  affixes: readonly string[],
  rng: () => number,
): Encounter[] {
  const encounters: Encounter[] = [];
  for (const spec of specs) {
    const encounter = rollEncounter(spec, depth, affixes, rng);
    if (encounter !== null) encounters.push(encounter);
  }
  return encounters;
}
