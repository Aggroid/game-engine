/**
 * Daily quest generation tests.
 *
 * The three assertions that matter are product promises, not implementation details:
 *  - ALWAYS EXACTLY THREE, for every class and every history including none at all.
 *  - AT LEAST ONE IS CLEARABLE BY A WALK, and the test proves it by scoring an actual walk
 *    through `computeEffortPoints` rather than by trusting a constant.
 *  - NEVER A MODALITY THE PLAYER HAS NO HISTORY OF. Asking someone with no pool history to
 *    swim is a locked door, not a nudge.
 */
import { HERO_CLASSES, MODALITIES, type HeroClass, type Modality } from '../contracts/types';
import { ACTIVITY_TYPE_BY_MODALITY, activity, context, createRandom } from '../rewards/__fixtures__/support';
import { DAILY_SOFT_CAP_EP } from '../rewards/constants';
import { computeEffortPoints } from '../rewards/effort';
import { classBiasFor } from '../rewards/routing';

import {
  DAILY_QUEST_COUNT,
  EASY_EP_TARGET,
  MODALITY_LABEL,
  QUEST_REWARD_EP,
  RECOVER_MODALITIES,
  STRETCH_EP_TARGETS,
  WALK_CLEARABLE_MINUTES,
} from './constants';
import { generateDailies } from './generate';

/** Seeds used wherever a test needs to hold across many draws rather than one. */
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);

/** A history broad enough that most modality candidates are on the menu. */
const BROAD_HISTORY: readonly Modality[] = [
  'strength',
  'cardio_steady',
  'swim',
  'cycle',
  'walk',
  'mobility',
];

/**
 * What the "bad day" walk is actually worth, scored by the engine itself — the same walk the
 * easy quest promises to be clearable by, logged MANUALLY (the walk the watch missed).
 */
const walkEp = computeEffortPoints(
  activity({
    activityType: ACTIVITY_TYPE_BY_MODALITY.walk,
    durationSec: WALK_CLEARABLE_MINUTES * 60,
    trustTier: 'MANUAL',
  }),
  context(),
).ep;

describe('generateDailies', () => {
  it.each(HERO_CLASSES)('returns exactly three for a %s, on every seed', (heroClass: HeroClass) => {
    for (const seed of SEEDS) {
      expect(generateDailies(createRandom(seed), heroClass, BROAD_HISTORY)).toHaveLength(
        DAILY_QUEST_COUNT,
      );
    }
  });

  it('returns exactly three for a brand-new hero with no history at all', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const seed of SEEDS) {
        expect(generateDailies(createRandom(seed), heroClass, [])).toHaveLength(DAILY_QUEST_COUNT);
      }
    }
  });

  it('cannot run out of candidates — the always-available pool alone can fill the trio', () => {
    // RECOVER plus one candidate per stretch target, none of which depend on history.
    expect(1 + STRETCH_EP_TARGETS.length).toBeGreaterThanOrEqual(DAILY_QUEST_COUNT - 1);
  });

  it('always includes one quest a thirty-minute walk clears', () => {
    expect(walkEp).toBeGreaterThan(0);

    for (const heroClass of HERO_CLASSES) {
      for (const history of [[], BROAD_HISTORY, ['strength'] as Modality[]]) {
        for (const seed of SEEDS) {
          const trio = generateDailies(createRandom(seed), heroClass, history);
          const clearable = trio.filter(
            (quest) =>
              quest.kind === 'ANY_ACTIVITY' ||
              (quest.kind === 'REACH_EP' && quest.target <= walkEp),
          );

          expect(clearable.length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('derives the easy EP target from the reward tables, so it cannot drift out of reach', () => {
    expect(EASY_EP_TARGET).toBeGreaterThan(0);
    expect(EASY_EP_TARGET).toBeLessThanOrEqual(walkEp);
  });

  it('never asks for a modality the player has no history of', () => {
    const history: readonly Modality[] = ['strength', 'walk'];

    for (const heroClass of HERO_CLASSES) {
      for (const seed of SEEDS) {
        for (const quest of generateDailies(createRandom(seed), heroClass, history)) {
          if (quest.kind === 'SPECIFIC_MODALITY') {
            expect(history).toContain(quest.modality);
          }
        }
      }
    }
  });

  it('never asks a hero with no history for a specific modality at all', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const seed of SEEDS) {
        const trio = generateDailies(createRandom(seed), heroClass, []);
        expect(trio.some((quest) => quest.kind === 'SPECIFIC_MODALITY')).toBe(false);
      }
    }
  });

  it('never asks for `other` — the modality that means "we could not tell"', () => {
    for (const seed of SEEDS) {
      const trio = generateDailies(createRandom(seed), 'PALADIN', [...MODALITIES]);
      expect(trio.some((quest) => quest.modality === 'other')).toBe(false);
    }
  });

  it('leans towards what the class neglects — the cross-training nudge', () => {
    // A WARRIOR converts strength best and swimming worst, and has done both.
    const history: readonly Modality[] = ['strength', 'swim'];
    expect(classBiasFor('WARRIOR', 'swim')).toBeLessThan(1);
    expect(classBiasFor('WARRIOR', 'strength')).toBeGreaterThan(1);

    let swims = 0;
    let lifts = 0;
    for (let seed = 0; seed < 600; seed += 1) {
      for (const quest of generateDailies(createRandom(seed), 'WARRIOR', history)) {
        if (quest.modality === 'swim') {
          swims += 1;
        }
        if (quest.modality === 'strength') {
          lifts += 1;
        }
      }
    }

    expect(swims).toBeGreaterThan(lifts);
  });

  it('is deterministic per seed, and different across seeds', () => {
    const first = generateDailies(createRandom(555), 'ROGUE', BROAD_HISTORY);
    const again = generateDailies(createRandom(555), 'ROGUE', BROAD_HISTORY);
    expect(again).toEqual(first);

    const trios = SEEDS.map((seed) =>
      JSON.stringify(generateDailies(createRandom(seed), 'ROGUE', BROAD_HISTORY)),
    );
    expect(new Set(trios).size).toBeGreaterThan(1);
  });

  it('ignores the ORDER of the history it is given', () => {
    const forwards = generateDailies(createRandom(31), 'MAGE', BROAD_HISTORY);
    const backwards = generateDailies(createRandom(31), 'MAGE', [...BROAD_HISTORY].reverse());
    expect(backwards).toEqual(forwards);
  });

  it('de-duplicates a repetitive history', () => {
    const once = generateDailies(createRandom(88), 'PRIEST', ['walk', 'strength']);
    const many = generateDailies(createRandom(88), 'PRIEST', [
      'walk',
      'walk',
      'walk',
      'strength',
      'walk',
    ]);
    expect(many).toEqual(once);
  });

  it('never repeats a quest inside a trio', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const seed of SEEDS) {
        const trio = generateDailies(createRandom(seed), heroClass, BROAD_HISTORY);
        expect(new Set(trio.map((quest) => quest.id)).size).toBe(DAILY_QUEST_COUNT);
        expect(
          new Set(trio.map((quest) => `${quest.kind}:${quest.target}:${quest.modality ?? ''}`)).size,
        ).toBe(DAILY_QUEST_COUNT);
      }
    }
  });

  it('never asks for a recovery session twice under two different names', () => {
    for (const seed of SEEDS) {
      const trio = generateDailies(createRandom(seed), 'WARRIOR', BROAD_HISTORY);
      const recoveryish = trio.filter(
        (quest) =>
          quest.kind === 'RECOVER' ||
          (quest.modality !== undefined && RECOVER_MODALITIES.includes(quest.modality)),
      );
      expect(recoveryish.length).toBeLessThanOrEqual(1);
    }
  });

  it('starts every quest at zero, incomplete, and paying something', () => {
    for (const quest of generateDailies(createRandom(3), 'PALADIN', BROAD_HISTORY)) {
      expect(quest.progress).toBe(0);
      expect(quest.complete).toBe(false);
      expect(quest.target).toBeGreaterThan(0);
      expect(quest.rewardEp).toBe(QUEST_REWARD_EP[quest.kind]);
      expect(quest.rewardEp).toBeGreaterThan(0);
    }
  });

  it('never sets a target that pushes a player into the daily taper', () => {
    for (const seed of SEEDS) {
      for (const quest of generateDailies(createRandom(seed), 'WARRIOR', BROAD_HISTORY)) {
        if (quest.kind === 'REACH_EP') {
          expect(quest.target).toBeLessThan(DAILY_SOFT_CAP_EP);
        }
      }
    }
  });

  it('describes each quest from its kind, target and modality', () => {
    const trio = generateDailies(createRandom(2), 'WARRIOR', BROAD_HISTORY);
    for (const quest of trio) {
      expect(quest.description).not.toContain('{');
      expect(quest.description.length).toBeGreaterThan(0);

      if (quest.kind === 'REACH_EP') {
        expect(quest.description).toContain(String(quest.target));
      }
      if (quest.modality !== undefined) {
        expect(quest.description).toContain(MODALITY_LABEL[quest.modality]);
      }
    }
  });

  it('sets `modality` for SPECIFIC_MODALITY quests and for nothing else', () => {
    for (const seed of SEEDS) {
      for (const quest of generateDailies(createRandom(seed), 'ROGUE', BROAD_HISTORY)) {
        if (quest.kind === 'SPECIFIC_MODALITY') {
          expect(quest.modality).toBeDefined();
        } else {
          expect('modality' in quest).toBe(false);
        }
      }
    }
  });

  it('offers the guaranteed win both ways across the draw', () => {
    const kinds = new Set(
      SEEDS.map((seed) => generateDailies(createRandom(seed), 'WARRIOR', BROAD_HISTORY)[0]?.kind),
    );
    expect(kinds).toContain('ANY_ACTIVITY');
    expect(kinds).toContain('REACH_EP');
  });

  it('survives degenerate generators at both ends of the unit interval', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const rng of [() => 0, () => 0.999999, () => 1]) {
        const trio = generateDailies(rng, heroClass, BROAD_HISTORY);
        expect(trio).toHaveLength(DAILY_QUEST_COUNT);
        expect(new Set(trio.map((quest) => quest.id)).size).toBe(DAILY_QUEST_COUNT);
      }
    }
  });

  it('does not mutate the history it was handed', () => {
    const history = Object.freeze<Modality[]>(['strength', 'swim']);
    expect(() => generateDailies(createRandom(1), 'WARRIOR', history)).not.toThrow();
    expect(history).toEqual(['strength', 'swim']);
  });
});
