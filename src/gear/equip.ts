/**
 * Earned stats + what the hero is wearing -> the stats a fight actually uses.
 *
 * GEARED STATS ARE DERIVED, NEVER STORED. Exactly the same reasoning as `deriveCombat`: a
 * hero's `stats` are the fold of their reward ledger and nothing else, so equipping an item
 * must never write to them. If gear bonuses were folded into stored stats, unequipping would
 * have to subtract them again — and the first rounding difference, retune or missed
 * subtraction would leave a hero permanently, invisibly wrong, with no way to recompute the
 * truth. Deriving on demand makes that class of bug unrepresentable.
 *
 * Nothing here mutates its arguments, and nothing here reads a clock or a random source.
 */
import type { EquippedItems, Item, StatBlock, StatKey } from '../contracts/types';
import { ITEM_SLOTS, STAT_KEYS } from '../contracts/types';

import { activeSetBonuses } from './setBonuses';

/** Adds a sparse stat bonus into a running total. Absent keys contribute nothing. */
function addBonus(
  totals: Record<StatKey, number>,
  bonus: Readonly<Partial<Record<StatKey, number>>>,
): void {
  for (const key of STAT_KEYS) {
    totals[key] += bonus[key] ?? 0;
  }
}

/**
 * Sums a hero's earned stats with every bonus their equipment grants.
 *
 * Item bonuses first, then active set bonuses, then rounded — the order is irrelevant to the
 * result (integer addition commutes) but fixed anyway, because a deterministic engine that
 * accumulated in a varying order would be a deterministic engine by luck.
 *
 * Iterates `ITEM_SLOTS` rather than the object's own keys so that key order and any stray
 * property on a hand-built or JSON-round-tripped `EquippedItems` cannot change the answer.
 *
 * Rounds each total even though every catalogue bonus is an integer: these numbers feed
 * combat derivation and the stats screen, and a fractional stat that arrived from a
 * hand-built base would print as `12.000000000000002` in a UI the engine cannot see.
 *
 * @param baseStats The hero's EARNED stats — the fold of their ledger. Never mutated.
 * @param equipped  What they have on. An empty object returns the base stats unchanged.
 * @returns A NEW, complete `StatBlock`. Always all six keys.
 */
export function applyGear(baseStats: StatBlock, equipped: EquippedItems): StatBlock {
  const totals = Object.fromEntries(
    STAT_KEYS.map((key: StatKey) => [key, baseStats[key]]),
  ) as Record<StatKey, number>;

  for (const slot of ITEM_SLOTS) {
    const item = equipped[slot];
    if (item !== undefined) {
      addBonus(totals, item.statBonus);
    }
  }

  for (const bonus of activeSetBonuses(equipped)) {
    addBonus(totals, bonus.statBonus);
  }

  for (const key of STAT_KEYS) {
    totals[key] = Math.round(totals[key]);
  }

  return totals as StatBlock;
}

/**
 * Is this hero high enough level for this item?
 *
 * The level gate is the only pacing tool gear has — items never become obsolete in this
 * game, so nothing is ever taken away and the gate decides when a piece arrives.
 *
 * @param item      The item being considered.
 * @param heroLevel The hero's current level.
 */
export function canEquip(item: Item, heroLevel: number): boolean {
  return heroLevel >= item.levelRequirement;
}

/**
 * Puts an item in its slot, returning a NEW `EquippedItems`.
 *
 * Replaces whatever was in that slot: one item per slot is what bounds a hero's power by
 * slot count rather than by how much loot they have hoarded (see `ItemSlot`).
 *
 * DELIBERATELY DOES NOT CHECK THE LEVEL GATE, because it cannot: the signature carries no
 * hero. `canEquip` is the gate, and the backend calls it before this — which is the right
 * place for it, since only the backend can answer "is this item actually in the player's
 * inventory" in the same breath.
 *
 * @param equipped The current loadout. Never mutated.
 * @param item     The item to wear.
 * @returns A new loadout. The input is left exactly as it was.
 */
export function equipItem(equipped: EquippedItems, item: Item): EquippedItems {
  return { ...equipped, [item.slot]: item };
}
