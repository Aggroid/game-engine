/**
 * `applyGear` tests.
 *
 * Two properties carry this file:
 *  1. PURITY. A geared stat block is a projection; if this function ever wrote to the hero's
 *     earned stats, unequipping would have to subtract them back and the first missed
 *     subtraction would leave a hero permanently wrong with no way to recompute the truth.
 *     Frozen inputs prove it rather than observing that it happened not to this time.
 *  2. A FULL SET IS STRICTLY BETTER THAN THE SAME SET MINUS ONE PIECE. That is what makes the
 *     last piece of a set worth collecting, and it is the one thing a threshold bug breaks
 *     silently.
 */
import type { EquippedItems, Item, StatBlock } from '../contracts/types';
import { ITEM_SLOTS, STAT_KEYS } from '../contracts/types';
import { deepFreeze } from '../rewards/__fixtures__/support';

import {
  IRONBOUND_SET_ID,
  WINDRUNNER_SET_ID,
  itemById,
  itemsForSlot,
  itemsInSet,
} from './catalogue';
import { SET_BONUS_FULL_PIECES } from './constants';
import { applyGear, canEquip, equipItem } from './equip';

const baseStats = (overrides: Partial<StatBlock> = {}): StatBlock => ({
  str: 10,
  agi: 11,
  end: 12,
  vit: 13,
  foc: 14,
  spi: 15,
  ...overrides,
});

const wear = (setId: string, count: number = SET_BONUS_FULL_PIECES): EquippedItems =>
  Object.fromEntries(
    itemsInSet(setId)
      .slice(0, count)
      .map((piece) => [piece.slot, piece]),
  );

const total = (stats: StatBlock): number => STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);

describe('applyGear', () => {
  it('returns the base stats untouched for a hero wearing nothing', () => {
    const stats = baseStats();
    expect(applyGear(stats, {})).toEqual(stats);
  });

  it('returns a NEW block, never the one it was handed', () => {
    const stats = baseStats();
    expect(applyGear(stats, {})).not.toBe(stats);
  });

  it('is pure — frozen inputs, no mutation, repeatable', () => {
    const stats = deepFreeze(baseStats());
    const equipped = deepFreeze(wear(IRONBOUND_SET_ID));

    const first = applyGear(stats, equipped);
    const second = applyGear(stats, equipped);

    expect(first).toEqual(second);
    expect(stats).toEqual(baseStats());
  });

  it('adds a single item bonus and nothing else', () => {
    const barbell = itemById('worn-barbell') as Item;
    const geared = applyGear(baseStats(), { weapon: barbell });

    expect(geared.str).toBe(baseStats().str + (barbell.statBonus.str ?? 0));
    expect(geared.agi).toBe(baseStats().agi);
  });

  it('always returns all six keys, whatever the loadout', () => {
    const geared = applyGear(baseStats(), wear(WINDRUNNER_SET_ID, 2));
    expect(Object.keys(geared).sort()).toEqual([...STAT_KEYS].sort());
  });

  it('never lowers a stat — gear in this game is only ever additive', () => {
    const stats = baseStats();
    const geared = applyGear(stats, wear(IRONBOUND_SET_ID));
    for (const key of STAT_KEYS) {
      expect(geared[key]).toBeGreaterThanOrEqual(stats[key]);
    }
  });

  it.each([IRONBOUND_SET_ID, WINDRUNNER_SET_ID])(
    'grants strictly more for a full %s than for the same pieces minus one',
    (setId: string) => {
      const stats = baseStats();
      const full = applyGear(stats, wear(setId, SET_BONUS_FULL_PIECES));
      const minusOne = applyGear(stats, wear(setId, SET_BONUS_FULL_PIECES - 1));

      expect(total(full)).toBeGreaterThan(total(minusOne));
      for (const key of STAT_KEYS) {
        expect(full[key]).toBeGreaterThanOrEqual(minusOne[key]);
      }
    },
  );

  it('grants strictly more with each piece added, all the way up', () => {
    const stats = baseStats();
    const totals = Array.from({ length: SET_BONUS_FULL_PIECES + 1 }, (_, count) =>
      total(applyGear(stats, wear(IRONBOUND_SET_ID, count))),
    );

    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i] as number).toBeGreaterThan(totals[i - 1] as number);
    }
  });

  it('counts the set bonus on top of the pieces, not instead of them', () => {
    const stats = baseStats();
    const pieces = itemsInSet(IRONBOUND_SET_ID);
    const piecesOnly = pieces.reduce(
      (sum, piece) => sum + Object.values(piece.statBonus).reduce((a, b) => a + b, 0),
      0,
    );

    const geared = total(applyGear(stats, wear(IRONBOUND_SET_ID)));
    expect(geared).toBeGreaterThan(total(stats) + piecesOnly);
  });

  it('ignores stray keys and key order on a JSON-round-tripped loadout', () => {
    const equipped = wear(IRONBOUND_SET_ID);
    const roundTripped = JSON.parse(JSON.stringify(equipped)) as EquippedItems;
    const withJunk = { ...roundTripped, nonsense: { statBonus: { str: 9999 } } } as EquippedItems;

    expect(applyGear(baseStats(), withJunk)).toEqual(applyGear(baseStats(), equipped));
  });

  it('returns whole numbers even from a fractional base', () => {
    const geared = applyGear(baseStats({ str: 10.4, spi: 15.6 }), wear(IRONBOUND_SET_ID));
    for (const key of STAT_KEYS) {
      expect(Number.isInteger(geared[key])).toBe(true);
    }
  });
});

describe('canEquip', () => {
  it('gates an item exactly at its level requirement', () => {
    const legendary = itemById('windrunner-baton') as Item;
    expect(canEquip(legendary, legendary.levelRequirement - 1)).toBe(false);
    expect(canEquip(legendary, legendary.levelRequirement)).toBe(true);
    expect(canEquip(legendary, legendary.levelRequirement + 1)).toBe(true);
  });

  it('lets a level 1 hero fill every slot from the starter tier', () => {
    for (const slot of ITEM_SLOTS) {
      expect(itemsForSlot(slot).some((item) => canEquip(item, 1))).toBe(true);
    }
  });
});

describe('equipItem', () => {
  it('returns a new loadout and never mutates the old one', () => {
    const before = deepFreeze<EquippedItems>({});
    const barbell = itemById('worn-barbell') as Item;

    const after = equipItem(before, barbell);

    expect(after).not.toBe(before);
    expect(before).toEqual({});
    expect(after.weapon).toBe(barbell);
  });

  it('replaces whatever was in the slot — one item per slot, always', () => {
    const worn = itemById('worn-barbell') as Item;
    const better = itemById('balanced-kettlebell') as Item;

    const after = equipItem(equipItem({}, worn), better);

    expect(after.weapon).toBe(better);
    expect(Object.keys(after)).toEqual(['weapon']);
  });

  it('leaves other slots exactly as they were', () => {
    const start = wear(IRONBOUND_SET_ID);
    const after = equipItem(start, itemById('worn-barbell') as Item);

    expect(after.chest).toBe(start.chest);
    expect(after.weapon).not.toBe(start.weapon);
  });
});
