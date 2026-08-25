/**
 * Quest progress tests.
 *
 * The load-bearing one is `measures effort and not payout`: a player who has hit the weekly
 * ceiling and trains anyway must still clear their dailies, or the safety cap becomes a
 * punishment for the most committed users.
 */
import type { DailyQuest, EffortResult, Modality } from '../contracts/types';
import { MODALITIES } from '../contracts/types';
import { deepFreeze } from '../rewards/__fixtures__/support';

import { RECOVER_MODALITIES } from './constants';
import { applyQuestProgress } from './progress';

const quest = (overrides: Partial<DailyQuest> = {}): DailyQuest => ({
  id: 'daily-1-any_activity',
  kind: 'ANY_ACTIVITY',
  description: 'Log any activity today',
  target: 1,
  progress: 0,
  complete: false,
  rewardEp: 10,
  ...overrides,
});

const effort = (overrides: Partial<EffortResult> = {}): EffortResult => ({
  ep: 60,
  rawEp: 60,
  intensityTier: 'MET_TABLE',
  modality: 'strength',
  ...overrides,
});

/** A session that produced no measurable work at all — a sync artefact, not a workout. */
const nothingHappened = effort({ ep: 0, rawEp: 0 });

describe('applyQuestProgress', () => {
  it('returns new objects and never mutates the ones it was given', () => {
    const quests = deepFreeze([quest()]);
    const advanced = applyQuestProgress(quests, effort());

    expect(advanced[0]).not.toBe(quests[0]);
    expect(quests[0]?.progress).toBe(0);
    expect(advanced[0]?.progress).toBe(1);
  });

  it('keeps the order it was given', () => {
    const quests = [quest({ id: 'a' }), quest({ id: 'b' }), quest({ id: 'c' })];
    expect(applyQuestProgress(quests, effort()).map((q) => q.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty list', () => {
    expect(applyQuestProgress([], effort())).toEqual([]);
  });

  describe('ANY_ACTIVITY', () => {
    it('ticks for any session at all, whatever the modality', () => {
      for (const modality of MODALITIES) {
        const [advanced] = applyQuestProgress([quest()], effort({ modality }));
        expect(advanced?.complete).toBe(true);
      }
    });

    it('does not tick for a record that produced no work', () => {
      const [advanced] = applyQuestProgress([quest()], nothingHappened);
      expect(advanced?.progress).toBe(0);
      expect(advanced?.complete).toBe(false);
    });
  });

  describe('REACH_EP', () => {
    const epQuest = (target: number, progress = 0): DailyQuest =>
      quest({ kind: 'REACH_EP', target, progress, description: `Earn ${target} EP today` });

    it('accumulates effort across sessions', () => {
      let quests = [epQuest(100)];
      quests = applyQuestProgress(quests, effort({ ep: 40, rawEp: 40 }));
      expect(quests[0]).toMatchObject({ progress: 40, complete: false });

      quests = applyQuestProgress(quests, effort({ ep: 40, rawEp: 40 }));
      expect(quests[0]).toMatchObject({ progress: 80, complete: false });

      quests = applyQuestProgress(quests, effort({ ep: 40, rawEp: 40 }));
      expect(quests[0]).toMatchObject({ progress: 100, complete: true });
    });

    it('measures EFFORT and not PAYOUT — a capped-out session still counts', () => {
      // The weekly hard cap paid nothing, but the player unambiguously did the work.
      const capped = effort({ ep: 0, rawEp: 90, capReason: 'WEEKLY_HARD' });
      const [advanced] = applyQuestProgress([epQuest(80)], capped);

      expect(advanced?.progress).toBe(80);
      expect(advanced?.complete).toBe(true);
    });

    it('clamps progress at the target so a client can render progress / target', () => {
      const [advanced] = applyQuestProgress([epQuest(10)], effort({ ep: 500, rawEp: 500 }));
      expect(advanced?.progress).toBe(10);
    });

    it('never credits a negative or fractional amount', () => {
      const [negative] = applyQuestProgress([epQuest(10)], effort({ ep: -5, rawEp: -5 }));
      expect(negative?.progress).toBe(0);

      const [fractional] = applyQuestProgress([epQuest(10)], effort({ ep: 3, rawEp: 3.9 }));
      expect(fractional?.progress).toBe(3);
      expect(Number.isInteger(fractional?.progress)).toBe(true);
    });
  });

  describe('SPECIFIC_MODALITY', () => {
    const swimQuest = quest({
      kind: 'SPECIFIC_MODALITY',
      modality: 'swim',
      description: 'Log a swim session today',
    });

    it('ticks only for the modality it asked for', () => {
      expect(applyQuestProgress([swimQuest], effort({ modality: 'swim' }))[0]?.complete).toBe(true);

      for (const modality of MODALITIES.filter((m) => m !== 'swim')) {
        expect(applyQuestProgress([swimQuest], effort({ modality }))[0]?.complete).toBe(false);
      }
    });

    it('does not tick for a matching modality that produced no work', () => {
      const [advanced] = applyQuestProgress(
        [swimQuest],
        effort({ modality: 'swim', ep: 0, rawEp: 0 }),
      );
      expect(advanced?.complete).toBe(false);
    });
  });

  describe('RECOVER', () => {
    const recoverQuest = quest({
      kind: 'RECOVER',
      description: 'Log a recovery or mobility session today',
    });

    it.each(RECOVER_MODALITIES)('ticks for %s', (modality: Modality) => {
      expect(applyQuestProgress([recoverQuest], effort({ modality }))[0]?.complete).toBe(true);
    });

    it('does not tick for training', () => {
      for (const modality of MODALITIES.filter((m) => !RECOVER_MODALITIES.includes(m))) {
        expect(applyQuestProgress([recoverQuest], effort({ modality }))[0]?.complete).toBe(false);
      }
    });
  });

  describe('once complete', () => {
    it('stays complete and stops accumulating — replaying a day cannot double a payout', () => {
      const done = quest({ progress: 1, complete: true });
      const [advanced] = applyQuestProgress([done], effort());

      expect(advanced).toEqual(done);
      expect(advanced).not.toBe(done);
    });

    it('leaves the finished quests alone while an unfinished one keeps earning', () => {
      const start = [
        quest(),
        quest({ id: 'daily-2-reach_ep', kind: 'REACH_EP', target: 200 }),
        quest({ id: 'daily-3-recover', kind: 'RECOVER' }),
      ];
      const session = effort({ modality: 'recovery', ep: 60, rawEp: 60 });

      const once = applyQuestProgress(start, session);
      const twice = applyQuestProgress(once, session);
      const thrice = applyQuestProgress(twice, session);

      // The two count-based quests completed on the first session and never moved again.
      expect(once.map((q) => q.complete)).toEqual([true, false, true]);
      expect(thrice[0]).toEqual(once[0]);
      expect(thrice[2]).toEqual(once[2]);

      // The EP quest keeps accumulating effort until it is done.
      expect([once[1]?.progress, twice[1]?.progress, thrice[1]?.progress]).toEqual([60, 120, 180]);
      expect(thrice[1]?.complete).toBe(false);
    });
  });
});
