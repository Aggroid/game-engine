/**
 * Set bonuses — the part of gear that is about TRAINING rather than accumulation.
 *
 * A stat stick is a bad reward in a fitness game: it makes a hero stronger for having
 * collected things, which is the one kind of progress that has nothing to do with whether
 * the player actually trained. `modalityConversionBonus` is the answer. A set that improves
 * how efficiently real strength work converts is only worth wearing if you lift, so
 * choosing a set is choosing a training week — the same mechanic as class, at a timescale
 * the player can change their mind about.
 *
 * BONUSES ARE CUMULATIVE, not replacing: a six-piece hero holds the three-piece bonus AND
 * the six-piece one. Replacement would make the sixth piece feel like a sidegrade, and the
 * sixth piece is the whole reason the first five were collected.
 *
 * `piecesRequired` comes from `constants.ts` rather than being typed per row, so "half a
 * set" and "a full set" cannot drift apart between the two sets.
 */
import type { EquippedItems, ItemSetBonus, Modality } from '../contracts/types';
import { ITEM_SLOTS } from '../contracts/types';

import { IRONBOUND_SET_ID, WINDRUNNER_SET_ID } from './catalogue';
import { SET_BONUS_FULL_PIECES, SET_BONUS_PARTIAL_PIECES } from './constants';

/**
 * THE TABLE. Ordered by set, then by ascending `piecesRequired`.
 *
 * ORDER IS PART OF THE CONTRACT: `activeSetBonuses` returns bonuses in this order and the
 * UI lists them as it receives them, so reordering rows reorders what a player reads.
 *
 * The conversion bonuses are deliberately small (8-10%) and deliberately opposed. Large
 * conversion bonuses would tell a player to train the spreadsheet instead of their sport,
 * which is the failure mode `MODALITY_WEIGHT` is also tuned to avoid; opposed ones mean the
 * two sets are a genuine choice rather than a strictly-better ladder.
 */
export const SET_BONUSES: readonly ItemSetBonus[] = [
  {
    setId: IRONBOUND_SET_ID,
    piecesRequired: SET_BONUS_PARTIAL_PIECES,
    statBonus: { str: 4, vit: 4 },
  },
  {
    setId: IRONBOUND_SET_ID,
    piecesRequired: SET_BONUS_FULL_PIECES,
    statBonus: { str: 8, vit: 8 },
    // The reason this set exists: real barbell work is worth ~10% more while wearing it.
    modalityConversionBonus: { strength: 1.1 },
  },
  {
    setId: WINDRUNNER_SET_ID,
    piecesRequired: SET_BONUS_PARTIAL_PIECES,
    statBonus: { agi: 4, end: 4 },
  },
  {
    setId: WINDRUNNER_SET_ID,
    piecesRequired: SET_BONUS_FULL_PIECES,
    statBonus: { agi: 8, end: 8 },
    // The mirror of `ironbound`: this one pays for the miles, not the tonnage.
    modalityConversionBonus: { cardio_steady: 1.08, cardio_intense: 1.08 },
  },
];

/**
 * How many pieces of each set are equipped.
 *
 * Iterates `ITEM_SLOTS` rather than `Object.values(equipped)` so the count is a function of
 * the SLOTS, not of whatever key order a JSON round-trip happened to produce, and so a stray
 * key on a hand-built object cannot inflate a set count.
 */
function piecesBySet(equipped: EquippedItems): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const slot of ITEM_SLOTS) {
    const setId = equipped[slot]?.setId;
    if (setId !== undefined) {
      counts.set(setId, (counts.get(setId) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * Every set bonus currently earned by what the hero is wearing.
 *
 * Pure: reads `equipped`, mutates nothing, and returns the shared bonus objects from the
 * table above rather than copies — callers must treat them as read-only, which is why the
 * table is the only place they are ever constructed.
 *
 * @param equipped What the hero has on. An empty object is normal, not an error.
 * @returns The earned bonuses in `SET_BONUSES` order. Empty when no set threshold is met.
 */
export function activeSetBonuses(equipped: EquippedItems): ItemSetBonus[] {
  const counts = piecesBySet(equipped);

  return SET_BONUSES.filter((bonus) => (counts.get(bonus.setId) ?? 0) >= bonus.piecesRequired);
}

/**
 * The gear multiplier on how efficiently one real training modality converts.
 *
 * WHY A PRODUCT AND NOT A SUM: the contract calls this field a bonus but documents it as
 * something that "multiplies how efficiently a real training modality converts", so the
 * values in the table are multipliers (`1.1`, not `0.1`) and several active bonuses compose
 * the only way multipliers can. Multiplying also means the neutral value is `1`, so a hero
 * wearing nothing takes the identity and no caller needs a special case.
 *
 * @param equipped What the hero has on. `undefined` means nothing equipped — the common case.
 * @param modality The modality being scored.
 * @returns A multiplier, `1` when no active set has an opinion about this modality.
 */
export function gearConversionMultiplier(
  equipped: EquippedItems | undefined,
  modality: Modality,
): number {
  if (equipped === undefined) {
    return 1;
  }

  return activeSetBonuses(equipped).reduce(
    (product, bonus) => product * (bonus.modalityConversionBonus?.[modality] ?? 1),
    1,
  );
}
