/**
 * Set bonus tests.
 *
 * The two properties that matter: a threshold is a threshold (five pieces of six must not pay
 * the six-piece bonus), and the conversion bonus — the thing that ties gear back to real
 * training — only ever applies to the modality it names.
 */
import type { EquippedItems, Item } from '../contracts/types';
import { MODALITIES } from '../contracts/types';

import { IRONBOUND_SET_ID, WINDRUNNER_SET_ID, itemsForSlot, itemsInSet } from './catalogue';
import { SET_BONUS_FULL_PIECES, SET_BONUS_PARTIAL_PIECES } from './constants';
import { SET_BONUSES, activeSetBonuses, gearConversionMultiplier } from './setBonuses';

/** Equips the first `count` pieces of a set, in catalogue order. */
const wear = (setId: string, count: number): EquippedItems =>
  Object.fromEntries(
    itemsInSet(setId)
      .slice(0, count)
      .map((piece) => [piece.slot, piece]),
  );

/** A loadout of items that belong to no set at all. */
const wearSetless = (): EquippedItems =>
  Object.fromEntries(
    itemsForSlot('weapon')
      .filter((item) => item.setId === undefined)
      .slice(0, 1)
      .map((item) => [item.slot, item]),
  );

describe('activeSetBonuses', () => {
  it('pays nothing for an empty loadout', () => {
    expect(activeSetBonuses({})).toEqual([]);
  });

  it('pays nothing for items that belong to no set', () => {
    expect(activeSetBonuses(wearSetless())).toEqual([]);
  });

  it('pays nothing one piece short of the partial threshold', () => {
    expect(activeSetBonuses(wear(IRONBOUND_SET_ID, SET_BONUS_PARTIAL_PIECES - 1))).toEqual([]);
  });

  it('pays the partial bonus exactly at its threshold', () => {
    const active = activeSetBonuses(wear(IRONBOUND_SET_ID, SET_BONUS_PARTIAL_PIECES));
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      setId: IRONBOUND_SET_ID,
      piecesRequired: SET_BONUS_PARTIAL_PIECES,
    });
  });

  it('still pays only the partial bonus one piece short of the full set', () => {
    const active = activeSetBonuses(wear(IRONBOUND_SET_ID, SET_BONUS_FULL_PIECES - 1));
    expect(active).toHaveLength(1);
    expect(active[0]?.piecesRequired).toBe(SET_BONUS_PARTIAL_PIECES);
  });

  it('pays both tiers at a full set — bonuses are cumulative, not replacing', () => {
    const active = activeSetBonuses(wear(IRONBOUND_SET_ID, SET_BONUS_FULL_PIECES));
    expect(active.map((bonus) => bonus.piecesRequired)).toEqual([
      SET_BONUS_PARTIAL_PIECES,
      SET_BONUS_FULL_PIECES,
    ]);
  });

  it('never counts two different sets as one', () => {
    const mixed: EquippedItems = {
      ...wear(IRONBOUND_SET_ID, 2),
      legs: itemsInSet(WINDRUNNER_SET_ID).find((piece) => piece.slot === 'legs') as Item,
      trinket: itemsInSet(WINDRUNNER_SET_ID).find((piece) => piece.slot === 'trinket') as Item,
    };
    // Two of one set and two of another is four pieces and no bonus at all.
    expect(activeSetBonuses(mixed)).toEqual([]);
  });

  it('returns bonuses in table order, which the UI renders as received', () => {
    const active = activeSetBonuses({
      ...wear(IRONBOUND_SET_ID, SET_BONUS_FULL_PIECES),
    });
    const tableOrder = SET_BONUSES.filter((bonus) => bonus.setId === IRONBOUND_SET_ID);
    expect(active).toEqual(tableOrder);
  });

  it('does not mutate the loadout it reads', () => {
    const equipped = Object.freeze(wear(IRONBOUND_SET_ID, SET_BONUS_FULL_PIECES));
    expect(() => activeSetBonuses(equipped)).not.toThrow();
  });
});

describe('gearConversionMultiplier', () => {
  it('is neutral for a hero wearing nothing at all', () => {
    for (const modality of MODALITIES) {
      expect(gearConversionMultiplier(undefined, modality)).toBe(1);
      expect(gearConversionMultiplier({}, modality)).toBe(1);
    }
  });

  it('is neutral until the set that carries it is complete', () => {
    expect(
      gearConversionMultiplier(wear(IRONBOUND_SET_ID, SET_BONUS_FULL_PIECES - 1), 'strength'),
    ).toBe(1);
  });

  it('boosts the modality its set names, once the set is complete', () => {
    const geared = wear(IRONBOUND_SET_ID, SET_BONUS_FULL_PIECES);
    expect(gearConversionMultiplier(geared, 'strength')).toBeGreaterThan(1);
  });

  it('leaves every other modality alone — gear is not a blanket earnings buff', () => {
    const geared = wear(IRONBOUND_SET_ID, SET_BONUS_FULL_PIECES);
    for (const modality of MODALITIES.filter((m) => m !== 'strength')) {
      expect(gearConversionMultiplier(geared, modality)).toBe(1);
    }
  });

  it('gives the two sets opposed specialities, so choosing one is a real choice', () => {
    const iron = wear(IRONBOUND_SET_ID, SET_BONUS_FULL_PIECES);
    const wind = wear(WINDRUNNER_SET_ID, SET_BONUS_FULL_PIECES);

    expect(gearConversionMultiplier(iron, 'strength')).toBeGreaterThan(
      gearConversionMultiplier(wind, 'strength'),
    );
    expect(gearConversionMultiplier(wind, 'cardio_steady')).toBeGreaterThan(
      gearConversionMultiplier(iron, 'cardio_steady'),
    );
  });
});
