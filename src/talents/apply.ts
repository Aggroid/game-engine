import type { DerivedCombat, StatBlock, StatKey } from '../contracts/types';
import { TALENTS_BY_ID } from './trees';
import type { CombatTarget, TalentAllocation } from './types';

/**
 * Turning a talent build into numbers.
 *
 * ============================================================================
 * TWO PASSES, AND THE ORDER IS THE WHOLE DESIGN.
 * ============================================================================
 *   1. `STAT` effects add to the EARNED stats, before combat is derived. A
 *      talent that grants +3 STR has to behave exactly like +3 STR that was
 *      trained for — otherwise the same number means two different things
 *      depending on where it came from, and every later balance conversation
 *      has to ask which.
 *   2. `COMBAT_PCT` and `COMBAT_FLAT` apply AFTER derivation, percentages
 *      first. Percentages before flats so a flat bonus is worth the same to
 *      everybody: `+2 defence` that then got multiplied by a percentage would
 *      be worth more to whoever already had more, which is the opposite of
 *      what a flat bonus is for.
 *
 * `SPELL` effects are read and ignored. Spells are a later version; they are in
 * the content so the trees read as designed, and skipping them here is explicit
 * rather than accidental.
 *
 * PURE. Same build, same numbers, always — which is what lets a stored battle
 * be re-simulated from its snapshot.
 */

/** Stat bonuses a build grants, to be added BEFORE combat is derived. */
export function talentStatBonus(allocation: TalentAllocation): Partial<StatBlock> {
  const bonus: Partial<StatBlock> = {};

  for (const [talentId, ranks] of Object.entries(allocation)) {
    const rank = Math.max(0, Math.trunc(Number.isFinite(ranks) ? ranks : 0));
    if (rank === 0) continue;

    const talent = TALENTS_BY_ID[talentId];
    // Unknown ids are SKIPPED, not thrown on: a build stored by a newer client
    // must degrade to the talents this engine knows, not fail to derive at all.
    if (talent === undefined) continue;

    const capped = Math.min(rank, talent.maxRank);
    for (const effect of talent.effects) {
      if (effect.kind !== 'STAT') continue;
      const key: StatKey = effect.stat;
      bonus[key] = (bonus[key] ?? 0) + effect.perRank * capped;
    }
  }

  return bonus;
}

interface CombatModifiers {
  pct: Partial<Record<CombatTarget, number>>;
  flat: Partial<Record<CombatTarget, number>>;
}

/** Percentage and flat modifiers a build grants, to be applied AFTER derivation. */
export function talentCombatModifiers(allocation: TalentAllocation): CombatModifiers {
  const pct: Partial<Record<CombatTarget, number>> = {};
  const flat: Partial<Record<CombatTarget, number>> = {};

  for (const [talentId, ranks] of Object.entries(allocation)) {
    const rank = Math.max(0, Math.trunc(Number.isFinite(ranks) ? ranks : 0));
    if (rank === 0) continue;

    const talent = TALENTS_BY_ID[talentId];
    if (talent === undefined) continue;

    const capped = Math.min(rank, talent.maxRank);
    for (const effect of talent.effects) {
      if (effect.kind === 'COMBAT_PCT') {
        pct[effect.target] = (pct[effect.target] ?? 0) + effect.perRank * capped;
      } else if (effect.kind === 'COMBAT_FLAT') {
        flat[effect.target] = (flat[effect.target] ?? 0) + effect.perRank * capped;
      }
      // 'STAT' handled in the first pass; 'SPELL' has no mechanics yet.
    }
  }

  return { pct, flat };
}

/** Adds a talent stat bonus to an earned block. */
export function withTalentStats(
  stats: StatBlock,
  allocation: TalentAllocation,
): StatBlock {
  const bonus = talentStatBonus(allocation);
  const next = { ...stats };
  for (const key of Object.keys(bonus) as StatKey[]) {
    next[key] = Math.max(0, next[key] + (bonus[key] ?? 0));
  }
  return next;
}

/**
 * Applies a build's combat modifiers to a derived block.
 *
 * `dodgePct` is passed through rather than special-cased: `DerivedCombat` gains
 * it in the same version as this file, so a caller on an older contract simply
 * has nothing to modify.
 */
export function withTalentCombat(
  combat: DerivedCombat,
  allocation: TalentAllocation,
): DerivedCombat {
  const { pct, flat } = talentCombatModifiers(allocation);

  const apply = (target: CombatTarget, value: number): number => {
    const percented = value * (1 + (pct[target] ?? 0) / 100);
    return percented + (flat[target] ?? 0);
  };

  /*
   * Rounded to integers EXCEPT the percentages, which the contract allows to be
   * fractional — `critPct` already is. Rounding crit would make a +1.5% talent
   * worth either 1 or 2 depending on what it was added to, and a player
   * comparing two ranks would see the same number twice.
   */
  const toInt = (value: number): number => Math.max(0, Math.round(value));

  return {
    ...combat,
    hp: Math.max(1, toInt(apply('hp', combat.hp))),
    attack: toInt(apply('attack', combat.attack)),
    defence: toInt(apply('defence', combat.defence)),
    critPct: Math.max(0, apply('critPct', combat.critPct)),
    regen: toInt(apply('regen', combat.regen)),
    stamina: toInt(apply('stamina', combat.stamina)),
    ...(combat.dodgePct === undefined
      ? {}
      : { dodgePct: Math.max(0, apply('dodgePct', combat.dodgePct)) }),
  };
}
