/**
 * Catalogue INTEGRITY tests.
 *
 * The catalogue is content, so these are not tests of behaviour — they are the review a
 * human cannot reliably perform on twenty-seven rows: that no id is reused, that every
 * slot has real choice in it, that no item's price or level gate disagrees with its rarity,
 * and that every declared set actually has pieces to collect. Each of these mistakes is
 * invisible in a diff and expensive in the field.
 */
import { ITEM_SLOTS, RARITIES, STAT_KEYS, type ItemSlot, type Rarity } from '../contracts/types';

import {
  IRONBOUND_SET_ID,
  ITEM_CATALOGUE,
  SET_IDS,
  WINDRUNNER_SET_ID,
  itemById,
  itemsForSlot,
  itemsInSet,
} from './catalogue';
import {
  LEVEL_REQUIREMENT_BY_RARITY,
  SET_BONUS_FULL_PIECES,
  SET_BONUS_PARTIAL_PIECES,
  SHOP_PRICE_BY_RARITY,
} from './constants';
import { SET_BONUSES } from './setBonuses';

/** The minimum real choice a slot must offer, per the design brief. */
const MIN_ITEMS_PER_SLOT = 3;

describe('the item catalogue', () => {
  it('never reuses an id — inventories reference these forever', () => {
    const ids = ITEM_CATALOGUE.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(ITEM_SLOTS)('offers at least three items for the %s slot', (slot: ItemSlot) => {
    expect(itemsForSlot(slot).length).toBeGreaterThanOrEqual(MIN_ITEMS_PER_SLOT);
  });

  it.each(RARITIES)('has at least one %s item, so no rarity can only ever roll null', (rarity: Rarity) => {
    expect(ITEM_CATALOGUE.filter((item) => item.rarity === rarity).length).toBeGreaterThan(0);
  });

  it('derives every level gate from rarity, so none can be hand-typed wrong', () => {
    for (const item of ITEM_CATALOGUE) {
      expect(item.levelRequirement).toBe(LEVEL_REQUIREMENT_BY_RARITY[item.rarity]);
    }
  });

  it('prices from rarity, and leaves drop-only tiers unpriced', () => {
    for (const item of ITEM_CATALOGUE) {
      const expected = SHOP_PRICE_BY_RARITY[item.rarity];
      if (expected === null) {
        expect(item.price).toBeUndefined();
        expect('price' in item).toBe(false);
      } else {
        expect(item.price).toBe(expected);
      }
    }
  });

  it('grants only whole stat points — earned stats are integers by invariant', () => {
    for (const item of ITEM_CATALOGUE) {
      for (const key of STAT_KEYS) {
        const bonus = item.statBonus[key];
        if (bonus !== undefined) {
          expect(Number.isInteger(bonus)).toBe(true);
          expect(bonus).toBeGreaterThan(0);
        }
      }
    }
  });

  it('grants something to somebody — no item is decoration', () => {
    for (const item of ITEM_CATALOGUE) {
      expect(Object.keys(item.statBonus).length).toBeGreaterThan(0);
    }
  });

  it('rises in stat budget with rarity, so a tier up is always an upgrade', () => {
    const budgets = RARITIES.map((rarity) => {
      const items = ITEM_CATALOGUE.filter((item) => item.rarity === rarity);
      const totals = items.map((item) => Object.values(item.statBonus).reduce((a, b) => a + b, 0));
      return Math.min(...totals);
    });

    for (let i = 1; i < budgets.length; i += 1) {
      expect(budgets[i] as number).toBeGreaterThan(budgets[i - 1] as number);
    }
  });
});

describe('the sets', () => {
  it('contains at least two of them', () => {
    expect(SET_IDS.length).toBeGreaterThanOrEqual(2);
    expect(SET_IDS).toEqual(expect.arrayContaining([IRONBOUND_SET_ID, WINDRUNNER_SET_ID]));
  });

  it.each([IRONBOUND_SET_ID, WINDRUNNER_SET_ID])('completes %s — one piece per slot', (setId) => {
    const pieces = itemsInSet(setId);
    expect(pieces).toHaveLength(SET_BONUS_FULL_PIECES);
    expect(pieces.map((piece) => piece.slot).sort()).toEqual([...ITEM_SLOTS].sort());
  });

  it('means what a player thinks by "full set" — one item in every slot', () => {
    expect(SET_BONUS_FULL_PIECES).toBe(ITEM_SLOTS.length);
    expect(SET_BONUS_PARTIAL_PIECES).toBeLessThan(SET_BONUS_FULL_PIECES);
  });

  it('declares no bonus for a set with no pieces, and no set with no bonus', () => {
    const bonusSetIds = [...new Set(SET_BONUSES.map((bonus) => bonus.setId))];
    expect([...bonusSetIds].sort()).toEqual([...SET_IDS].sort());
  });

  it('keeps every piece of a set at one rarity, so a set completes at one pace', () => {
    for (const setId of SET_IDS) {
      const rarities = new Set(itemsInSet(setId).map((piece) => piece.rarity));
      expect(rarities.size).toBe(1);
    }
  });
});

describe('itemById', () => {
  it('finds every item the catalogue publishes', () => {
    for (const item of ITEM_CATALOGUE) {
      expect(itemById(item.id)).toEqual(item);
    }
  });

  it('returns undefined for an id this engine version does not know — inventories outlive catalogues', () => {
    expect(itemById('an-item-from-a-later-release')).toBeUndefined();
  });
});
