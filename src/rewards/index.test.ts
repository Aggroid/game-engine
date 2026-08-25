/**
 * Barrel and architecture tests.
 *
 * Everything here imports through `./index` on purpose — that is the surface `backend`
 * and `mobile-app` actually consume, and a barrel that exports a broken binding is a
 * failure no per-module test can see.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { RewardEntry } from '../contracts/types';

import { ACTIVITY_TYPE_BY_MODALITY, activity, context, hero } from './__fixtures__/support';
import {
  ENGINE_VERSION,
  WEEKLY_HARD_CAP_EP,
  applyCaps,
  applyRewards,
  computeEffortPoints,
  foldLedger,
  levelFromXp,
  normaliseModality,
  xpForLevel,
} from './index';

describe('the rewards barrel', () => {
  it('exports the engine version', () => {
    expect(ENGINE_VERSION).toBe('0.2.0');
  });

  it('exports every entry point as a callable binding', () => {
    for (const fn of [
      normaliseModality,
      computeEffortPoints,
      applyCaps,
      applyRewards,
      xpForLevel,
      levelFromXp,
      foldLedger,
    ]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('exports the tuning constants for the balance tooling to read', () => {
    expect(WEEKLY_HARD_CAP_EP).toBeGreaterThan(0);
  });
});

describe('module graph', () => {
  it('has no source module importing the barrel', () => {
    // The barrel re-exports every module, so a module importing it back forms a cycle.
    // That cycle resolves under CommonJS and can leave a binding uninitialised under Metro
    // or ESM — which would stamp every ledger row with an undefined engine version, in the
    // consumer only. Structural test, because the failure is invisible in our own runtime.
    const directory = __dirname;
    const offenders = readdirSync(directory)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'index.ts')
      .filter((file) => /from '\.\/index'/.test(readFileSync(join(directory, file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});

describe('a full training week, end to end', () => {
  it('turns real sessions into a hero without any of the pieces disagreeing', () => {
    const subject = hero({ heroClass: 'WARRIOR' });
    const week: ReadonlyArray<readonly [keyof typeof ACTIVITY_TYPE_BY_MODALITY, number]> = [
      ['strength', 75],
      ['cardio_steady', 45],
      ['recovery', 30],
      ['strength', 60],
      ['sport_racket', 90],
      ['walk', 50],
      ['mobility', 25],
    ];

    const ledger: RewardEntry[] = [];
    let epThisWeek = 0;

    for (const [modality, minutes] of week) {
      const effort = computeEffortPoints(
        activity({ activityType: ACTIVITY_TYPE_BY_MODALITY[modality], durationSec: minutes * 60 }),
        // One session a day, so each day starts fresh and only the week accumulates.
        context({ epToday: 0, epThisWeek }),
      );

      epThisWeek += effort.ep;
      ledger.push(...applyRewards(subject, effort));
    }

    const state = foldLedger(ledger);

    expect(epThisWeek).toBeLessThanOrEqual(WEEKLY_HARD_CAP_EP);
    expect(state.level).toBe(levelFromXp(state.xp));
    expect(state.level).toBeGreaterThan(1);
    expect(state.gold).toBeGreaterThan(0);
    // A WARRIOR's week of lifting and racket sport should show up as strength, not spirit.
    expect(state.stats.str).toBeGreaterThan(state.stats.spi);
    expect(state).toMatchSnapshot();
  });
});
