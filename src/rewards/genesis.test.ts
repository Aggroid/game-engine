import { STAT_KEYS } from '../contracts/types';
import { createStartingLedger, STARTING_STAT_VALUE } from './genesis';
import { foldLedger } from './progression';
import { ENGINE_VERSION } from './version';

describe('createStartingLedger', () => {
  it('emits exactly one row per stat', () => {
    const ledger = createStartingLedger();
    expect(ledger).toHaveLength(STAT_KEYS.length);
  });

  it('stamps every row with the engine version', () => {
    for (const entry of createStartingLedger()) {
      expect(entry.engineVersion).toBe(ENGINE_VERSION);
    }
  });

  it('folds to the documented starting stats, with no xp, level 1 and no gold', () => {
    const state = foldLedger(createStartingLedger());
    for (const key of STAT_KEYS) {
      expect(state.stats[key]).toBe(STARTING_STAT_VALUE);
    }
    expect(state.xp).toBe(0);
    expect(state.gold).toBe(0);
    expect(state.level).toBe(1);
  });

  it('makes "a hero is a fold of its ledger" literally true', () => {
    // The invariant the whole event-sourced design rests on: base + earned, in one fold,
    // with no caller-side arithmetic to forget.
    const earned = [
      { kind: 'STAT_STR', amount: 3, engineVersion: ENGINE_VERSION },
      { kind: 'XP', amount: 250, engineVersion: ENGINE_VERSION },
    ] as const;
    const state = foldLedger([...createStartingLedger(), ...earned]);
    expect(state.stats.str).toBe(STARTING_STAT_VALUE + 3);
    expect(state.stats.agi).toBe(STARTING_STAT_VALUE);
    expect(state.xp).toBe(250);
  });

  it('is order-independent like every other ledger slice', () => {
    const ledger = createStartingLedger();
    expect(foldLedger([...ledger].reverse())).toEqual(foldLedger(ledger));
  });

  it('returns a fresh array each call, so callers cannot corrupt the next hero', () => {
    const a = createStartingLedger();
    a.push({ kind: 'XP', amount: 9999, engineVersion: ENGINE_VERSION });
    expect(createStartingLedger()).toHaveLength(STAT_KEYS.length);
  });
});
