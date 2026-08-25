/**
 * The item catalogue — CONTENT, expressed as one flat data table.
 *
 * WHY A TABLE AND NOT A FACTORY PER SLOT: every consumer of gear wants a different view of
 * it (the shop wants prices, the drop roller wants rarity buckets, the UI wants a slot's
 * worth of options, the balance spreadsheet wants all of it as rows). A list of plain
 * objects serves all four and can be diffed in a pull request by someone who does not write
 * code. Branching logic that "builds" items serves none of them.
 *
 * WHAT EACH ROW CARRIES, AND WHAT IT DELIBERATELY DOES NOT:
 * a row states an item's identity — id, name, slot, rarity, its own stat bonus and the set
 * it belongs to. It does NOT state its level gate or its price: those follow from its rarity
 * and are looked up from `constants.ts` when the row is projected into an `Item`. That is the
 * one piece of logic in this file, and it buys a guarantee no review process can: a MYTHIC
 * item cannot be sold at a COMMON price, and no item can carry a hand-typed level gate that
 * silently disagrees with its tier.
 *
 * THE SETS ARE THE POINT. Two complete six-piece sets exist (`ironbound`, `windrunner`) and
 * their bonuses (see `setBonuses.ts`) reward TRAINING rather than accumulation: `ironbound`
 * converts real strength work more efficiently, `windrunner` real cardio. A set that only
 * added stats would make gear a stat stick, and a stat stick has nothing to do with whether
 * the player actually trained.
 *
 * IDS ARE FOREVER. They are referenced by rows in the players' inventories, so a row may be
 * retuned or renamed but its `id` must never be reused for a different item.
 */
import type { Item, ItemSlot, Rarity, StatKey } from '../contracts/types';

import { LEVEL_REQUIREMENT_BY_RARITY, SHOP_PRICE_BY_RARITY } from './constants';

/** The `setId` of the strength set — named because `setBonuses.ts` keys its bonuses off it. */
export const IRONBOUND_SET_ID = 'ironbound';

/** The `setId` of the endurance set. */
export const WINDRUNNER_SET_ID = 'windrunner';

/**
 * One catalogue row: an item's identity, minus everything its rarity already implies.
 *
 * Internal on purpose — the published shape is `Item`. Keeping the row type private means
 * the projection below is the only way an `Item` can come into existence, so no caller can
 * hand-roll one with a mismatched price.
 */
interface CatalogueRow {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: Rarity;
  statBonus: Readonly<Partial<Record<StatKey, number>>>;
  setId?: string;
}

/**
 * THE TABLE. Grouped by rarity for review, which is also ascending level order.
 *
 * Stat budgets rise with rarity but stay narrow within a tier, so that a slot is a choice
 * between flavours rather than a single correct answer. Every value is a whole number: gear
 * stats are added to earned stats, and earned stats are integers by repo invariant.
 */
const CATALOGUE_ROWS: readonly CatalogueRow[] = [
  // COMMON — the starter kit. One per slot, so a level 1 hero can fill every slot on day one.
  { id: 'worn-barbell', name: 'Worn Barbell', slot: 'weapon', rarity: 'COMMON', statBonus: { str: 3 } },
  { id: 'frayed-sweatband', name: 'Frayed Sweatband', slot: 'head', rarity: 'COMMON', statBonus: { foc: 2, end: 1 } },
  { id: 'faded-training-vest', name: 'Faded Training Vest', slot: 'chest', rarity: 'COMMON', statBonus: { vit: 2, end: 1 } },
  { id: 'chalked-wraps', name: 'Chalked Wraps', slot: 'hands', rarity: 'COMMON', statBonus: { str: 2, agi: 1 } },
  { id: 'split-shorts', name: 'Split Shorts', slot: 'legs', rarity: 'COMMON', statBonus: { agi: 2, end: 1 } },
  { id: 'cracked-stopwatch', name: 'Cracked Stopwatch', slot: 'trinket', rarity: 'COMMON', statBonus: { foc: 2, spi: 1 } },

  // RARE — the first real upgrade, and the first gear a player buys rather than is given.
  { id: 'balanced-kettlebell', name: 'Balanced Kettlebell', slot: 'weapon', rarity: 'RARE', statBonus: { str: 4, vit: 2 } },
  { id: 'focus-visor', name: 'Focus Visor', slot: 'head', rarity: 'RARE', statBonus: { foc: 4, spi: 2 } },
  { id: 'compression-harness', name: 'Compression Harness', slot: 'chest', rarity: 'RARE', statBonus: { vit: 4, end: 2 } },
  { id: 'grip-tape-gloves', name: 'Grip Tape Gloves', slot: 'hands', rarity: 'RARE', statBonus: { str: 3, agi: 3 } },
  { id: 'carbon-trainers', name: 'Carbon Trainers', slot: 'legs', rarity: 'RARE', statBonus: { agi: 4, end: 2 } },
  { id: 'heart-rate-strap', name: 'Heart Rate Strap', slot: 'trinket', rarity: 'RARE', statBonus: { end: 4, foc: 2 } },

  // EPIC — the `ironbound` set. Complete: one piece in every slot. STR and VIT, and at six
  // pieces it converts real strength work better (see `setBonuses.ts`).
  { id: 'ironbound-bar', name: 'Ironbound Bar', slot: 'weapon', rarity: 'EPIC', statBonus: { str: 7, vit: 3 }, setId: IRONBOUND_SET_ID },
  { id: 'ironbound-helm', name: 'Ironbound Helm', slot: 'head', rarity: 'EPIC', statBonus: { vit: 6, foc: 3 }, setId: IRONBOUND_SET_ID },
  { id: 'ironbound-plate', name: 'Ironbound Plate', slot: 'chest', rarity: 'EPIC', statBonus: { vit: 8, str: 2 }, setId: IRONBOUND_SET_ID },
  { id: 'ironbound-grips', name: 'Ironbound Grips', slot: 'hands', rarity: 'EPIC', statBonus: { str: 6, agi: 2 }, setId: IRONBOUND_SET_ID },
  { id: 'ironbound-greaves', name: 'Ironbound Greaves', slot: 'legs', rarity: 'EPIC', statBonus: { vit: 5, end: 5 }, setId: IRONBOUND_SET_ID },
  { id: 'ironbound-sigil', name: 'Ironbound Sigil', slot: 'trinket', rarity: 'EPIC', statBonus: { str: 5, spi: 3 }, setId: IRONBOUND_SET_ID },

  // LEGENDARY — the `windrunner` set. Complete, AGI and END, and at six pieces it converts
  // real cardio better. The mirror image of `ironbound`, so the two sets pull a player
  // towards two genuinely different training weeks.
  { id: 'windrunner-baton', name: 'Windrunner Baton', slot: 'weapon', rarity: 'LEGENDARY', statBonus: { agi: 9, end: 4 }, setId: WINDRUNNER_SET_ID },
  { id: 'windrunner-cowl', name: 'Windrunner Cowl', slot: 'head', rarity: 'LEGENDARY', statBonus: { foc: 8, agi: 4 }, setId: WINDRUNNER_SET_ID },
  { id: 'windrunner-shell', name: 'Windrunner Shell', slot: 'chest', rarity: 'LEGENDARY', statBonus: { end: 9, vit: 4 }, setId: WINDRUNNER_SET_ID },
  { id: 'windrunner-mitts', name: 'Windrunner Mitts', slot: 'hands', rarity: 'LEGENDARY', statBonus: { agi: 8, str: 3 }, setId: WINDRUNNER_SET_ID },
  { id: 'windrunner-striders', name: 'Windrunner Striders', slot: 'legs', rarity: 'LEGENDARY', statBonus: { agi: 7, end: 7 }, setId: WINDRUNNER_SET_ID },
  { id: 'windrunner-compass', name: 'Windrunner Compass', slot: 'trinket', rarity: 'LEGENDARY', statBonus: { end: 8, spi: 4 }, setId: WINDRUNNER_SET_ID },

  // MYTHIC — drop-only, unpriced, and deliberately NOT a set: it is the reward for years of
  // real training, not the completion of a collection. Three pieces only, so the tier stays
  // rare in fact and not just in its weight.
  { id: 'atlas-bar', name: 'Atlas Bar', slot: 'weapon', rarity: 'MYTHIC', statBonus: { str: 14, vit: 6 } },
  { id: 'aegis-of-the-long-haul', name: 'Aegis of the Long Haul', slot: 'chest', rarity: 'MYTHIC', statBonus: { vit: 14, end: 8 } },
  { id: 'metronome-of-the-sixth-set', name: 'Metronome of the Sixth Set', slot: 'trinket', rarity: 'MYTHIC', statBonus: { foc: 10, spi: 10 } },
];

/**
 * Projects a row into a published `Item`, filling in everything its rarity implies.
 *
 * `price` is SPREAD rather than assigned, because `exactOptionalPropertyTypes` makes an
 * explicit `price: undefined` a different thing from an absent key, and the contract says an
 * absent `price` means "drop-only, never sold".
 */
function toItem(row: CatalogueRow): Item {
  const price = SHOP_PRICE_BY_RARITY[row.rarity];

  return {
    id: row.id,
    name: row.name,
    slot: row.slot,
    rarity: row.rarity,
    statBonus: { ...row.statBonus },
    levelRequirement: LEVEL_REQUIREMENT_BY_RARITY[row.rarity],
    ...(row.setId !== undefined ? { setId: row.setId } : {}),
    ...(price !== null ? { price } : {}),
  };
}

/**
 * The whole catalogue, in table order (ascending rarity, then canonical slot order).
 *
 * ORDER IS PART OF THE CONTRACT. Drop pools are derived from this list, and a drop roll
 * indexes into a pool, so reordering the table changes which item a given seed produces —
 * an `ENGINE_VERSION` bump, not a cosmetic edit.
 */
export const ITEM_CATALOGUE: readonly Item[] = CATALOGUE_ROWS.map(toItem);

/** Every item, indexed by id, for the inventory join the backend does on every read. */
const ITEM_INDEX: ReadonlyMap<string, Item> = new Map(ITEM_CATALOGUE.map((item) => [item.id, item]));

/**
 * Looks an item up by id.
 *
 * Returns `undefined` rather than throwing for an unknown id: inventories outlive
 * catalogues, and a stored row referencing an item this engine version does not know about
 * must degrade to "nothing equipped" instead of failing a hero's entire profile load.
 */
export function itemById(id: string): Item | undefined {
  return ITEM_INDEX.get(id);
}

/** Every item for one slot, in catalogue order. What a shop or an equip screen renders. */
export function itemsForSlot(slot: ItemSlot): readonly Item[] {
  return ITEM_CATALOGUE.filter((item) => item.slot === slot);
}

/** Every piece belonging to one set, in catalogue order. */
export function itemsInSet(setId: string): readonly Item[] {
  return ITEM_CATALOGUE.filter((item) => item.setId === setId);
}

/**
 * The set ids the catalogue actually contains, in first-appearance order.
 *
 * Derived rather than written down twice: a set declared in `setBonuses.ts` with no pieces
 * in the catalogue is a bonus nobody can ever earn, and the integrity test compares these
 * two lists precisely so that mistake cannot ship.
 */
export const SET_IDS: readonly string[] = [
  ...new Set(ITEM_CATALOGUE.flatMap((item) => (item.setId === undefined ? [] : [item.setId]))),
];

/**
 * Display names for sets.
 *
 * Kept here rather than derived from the id: title-casing `ironbound` happens to read
 * fine, but a set called `deep-water-ii` would not, and a UI has no business inventing
 * product names from slugs. Every set id must have an entry — `setDisplayName` is total
 * over `SET_IDS` and a missing entry fails typecheck.
 */
export const SET_DISPLAY_NAME: Readonly<Record<string, string>> = {
  [IRONBOUND_SET_ID]: 'Ironbound',
  [WINDRUNNER_SET_ID]: 'Windrunner',
};

/** The set's display name, falling back to the id so an unknown set degrades rather than blanks. */
export function setDisplayName(setId: string): string {
  return SET_DISPLAY_NAME[setId] ?? setId;
}
