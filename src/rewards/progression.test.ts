/**
 * Level curve and ledger fold.
 *
 * THE SHUFFLE-INVARIANCE TEST IN THIS FILE IS THE HIGHEST-VALUE TEST IN THE REPO.
 * Hero state is a fold over an append-only ledger. If that fold is order-dependent — one
 * float, one per-entry clamp — then a late-syncing watch, a differently-ordered database
 * read, or any replay after a rebalance produces a subtly different hero, and nothing
 * fails loudly. The corruption is silent, permanent, and only discovered when players
 * compare notes.
 */
import { REWARD_KINDS, STAT_KEYS } from '../contracts/types';
import type { HeroState, RewardEntry, RewardKind } from '../contracts/types';

import {
  ACTIVITY_TYPE_BY_MODALITY,
  activity,
  context,
  createRandom,
  hero,
  shuffle,
  zeroStats,
} from './__fixtures__/support';
import { applyRewards } from './apply';
import { LEVEL_STEP_BASE } from './constants';
import { computeEffortPoints } from './effort';
import { foldLedger, levelFromXp, xpForLevel,
  xpForLevelStep,
} from './progression';
import { ENGINE_VERSION } from './version';

/** Builds a large, messy, deterministic ledger — including corrections and item drops. */
function buildLedger(seed: number, size: number): RewardEntry[] {
  const next = createRandom(seed);

  return Array.from({ length: size }, (): RewardEntry => {
    const kind = REWARD_KINDS[Math.floor(next() * REWARD_KINDS.length)] as RewardKind;
    // Mostly positive, occasionally a negative correction row — the ledger is append-only,
    // so a refund or a decay is a negative row rather than an edit to history.
    const amount = next() < 0.1 ? -Math.floor(next() * 40) : Math.floor(next() * 400);

    return { kind, amount, engineVersion: ENGINE_VERSION };
  });
}

describe('xpForLevel', () => {
  it('costs nothing to be level 1', () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it('treats levels below 1 as free rather than throwing', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-25)).toBe(0);
  });

  it('puts level 2 inside the first real training session', () => {
    /*
     * `LEVEL_STEP_BASE` since 0.7.0, and lower than the old `LEVEL_CURVE_BASE`
     * on purpose: 120 XP was most of a hard session before anything happened,
     * on the one level-up that has to land while a new user is still watching.
     */
    expect(xpForLevel(2)).toBe(LEVEL_STEP_BASE);
  });

  it('is strictly increasing, so no two levels share a threshold', () => {
    for (let level = 2; level <= 500; level += 1) {
      expect(xpForLevel(level)).toBeGreaterThan(xpForLevel(level - 1));
    }
  });

  it('returns whole numbers only', () => {
    for (let level = 1; level <= 200; level += 1) {
      expect(Number.isInteger(xpForLevel(level))).toBe(true);
    }
  });

  it('floors a fractional level rather than inventing a threshold between two levels', () => {
    expect(xpForLevel(3.9)).toBe(xpForLevel(3));
  });

  it('gets harder as it goes, but never unreachably so', () => {
    const early = xpForLevel(11) - xpForLevel(10);
    const late = xpForLevel(51) - xpForLevel(50);

    expect(late).toBeGreaterThan(early);
    expect(late / early).toBeLessThan(10);
  });

  it('snapshots the shape of the curve', () => {
    const curve = [1, 2, 3, 5, 10, 20, 30, 50, 75, 100].map((level) => [level, xpForLevel(level)]);

    expect(curve).toMatchSnapshot();
  });
});

describe('levelFromXp', () => {
  it('is the exact inverse of xpForLevel at every boundary', () => {
    for (let level = 1; level <= 300; level += 1) {
      const threshold = xpForLevel(level);

      // Exactly on the threshold: the new level.
      expect(levelFromXp(threshold)).toBe(level);

      if (level > 1) {
        // One XP short of it: still the old level. This is the off-by-one that would show
        // a player "Level 7" on one screen and "Level 6" on another.
        expect(levelFromXp(threshold - 1)).toBe(level - 1);
      }

      // One XP past it: still the new level, not the next one.
      expect(levelFromXp(threshold + 1)).toBe(level);
    }
  });

  it('never drops below level 1, whatever it is handed', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(1)).toBe(1);
    expect(levelFromXp(-9000)).toBe(1);
  });

  it('is monotonic non-decreasing in XP', () => {
    let previous = 0;

    for (let xp = 0; xp <= 20000; xp += 7) {
      const level = levelFromXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('holds its invariant for an absurdly large total', () => {
    const xp = 1e12;
    const level = levelFromXp(xp);

    expect(xpForLevel(level)).toBeLessThanOrEqual(xp);
    expect(xpForLevel(level + 1)).toBeGreaterThan(xp);
  });
});

describe('foldLedger — order invariance', () => {
  it('produces an identical hero state for every shuffle of the same ledger', () => {
    const entries = buildLedger(20260817, 400);
    const baseline = foldLedger(entries);
    const next = createRandom(1234567);

    let sawADifferentOrder = false;

    for (let round = 0; round < 200; round += 1) {
      const shuffled = shuffle(entries, next);
      if (JSON.stringify(shuffled) !== JSON.stringify(entries)) {
        sawADifferentOrder = true;
      }

      expect(foldLedger(shuffled)).toEqual(baseline);
    }

    // Guard the guard: a shuffle that never reorders would make the test above vacuous.
    expect(sawADifferentOrder).toBe(true);
  });

  it('is order-independent for a ledger built from real scored workouts', () => {
    const subject = hero({ heroClass: 'ROGUE' });
    const entries: RewardEntry[] = [];
    let epToday = 0;
    let epThisWeek = 0;

    for (const [index, modality] of (
      ['strength', 'cardio_intense', 'swim', 'walk', 'recovery', 'sport_racket'] as const
    ).entries()) {
      const effort = computeEffortPoints(
        activity({
          activityType: ACTIVITY_TYPE_BY_MODALITY[modality],
          durationSec: (index + 1) * 1800,
        }),
        context({ epToday, epThisWeek }),
      );

      epToday += effort.ep;
      epThisWeek += effort.ep;
      entries.push(...applyRewards(subject, effort));
    }

    const baseline = foldLedger(entries);
    const next = createRandom(31337);

    for (let round = 0; round < 100; round += 1) {
      expect(foldLedger(shuffle(entries, next))).toEqual(baseline);
    }

    expect(baseline).toMatchSnapshot();
  });

  it('stays order-independent when corrections push a total negative', () => {
    const entries: RewardEntry[] = [
      { kind: 'XP', amount: 100, engineVersion: ENGINE_VERSION },
      { kind: 'XP', amount: -400, engineVersion: ENGINE_VERSION },
      { kind: 'XP', amount: 50, engineVersion: ENGINE_VERSION },
    ];

    // Clamping per entry would make this order-dependent: max() does not commute with +.
    const forwards = foldLedger(entries);
    const backwards = foldLedger([...entries].reverse());

    expect(forwards).toEqual(backwards);
    expect(forwards.xp).toBe(0);
    expect(forwards.level).toBe(1);
  });

  it('does not mutate the ledger it folds', () => {
    const entries = buildLedger(7, 50);
    const before = structuredClone(entries);

    foldLedger(entries);

    expect(entries).toEqual(before);
  });
});

describe('foldLedger — totals', () => {
  it('folds an empty ledger into a level 1 hero with nothing', () => {
    const expected: HeroState = { level: 1, xp: 0, gold: 0, stats: zeroStats() };

    expect(foldLedger([])).toEqual(expected);
  });

  it('sums each kind into its own total', () => {
    const state = foldLedger([
      { kind: 'XP', amount: 300, engineVersion: ENGINE_VERSION },
      { kind: 'XP', amount: 200, engineVersion: ENGINE_VERSION },
      { kind: 'GOLD', amount: 75, engineVersion: ENGINE_VERSION },
      { kind: 'STAT_STR', amount: 4, engineVersion: ENGINE_VERSION },
      { kind: 'STAT_SPI', amount: 2, engineVersion: ENGINE_VERSION },
    ]);

    expect(state.xp).toBe(500);
    expect(state.gold).toBe(75);
    expect(state.stats.str).toBe(4);
    expect(state.stats.spi).toBe(2);
    expect(state.stats.agi).toBe(0);
  });

  it('ignores item drops, which are inventory rather than hero state', () => {
    const withDrops = foldLedger([
      { kind: 'XP', amount: 500, engineVersion: ENGINE_VERSION },
      { kind: 'ITEM_DROP', amount: 3, engineVersion: ENGINE_VERSION },
    ]);
    const withoutDrops = foldLedger([{ kind: 'XP', amount: 500, engineVersion: ENGINE_VERSION }]);

    expect(withDrops).toEqual(withoutDrops);
  });

  it('never lets a fractional amount into hero state', () => {
    const state = foldLedger([
      { kind: 'XP', amount: 10.9, engineVersion: ENGINE_VERSION },
      { kind: 'GOLD', amount: 5.5, engineVersion: ENGINE_VERSION },
      { kind: 'STAT_VIT', amount: 1.99, engineVersion: ENGINE_VERSION },
    ]);

    expect(state.xp).toBe(10);
    expect(state.gold).toBe(5);
    expect(state.stats.vit).toBe(1);
  });

  it('always carries all six stats, even for a ledger that touched none of them', () => {
    const state = foldLedger([{ kind: 'GOLD', amount: 10, engineVersion: ENGINE_VERSION }]);

    for (const key of STAT_KEYS) {
      expect(state.stats[key]).toBe(0);
    }
  });

  it('reports the level implied by the XP it folded', () => {
    const state = foldLedger([{ kind: 'XP', amount: 5000, engineVersion: ENGINE_VERSION }]);

    expect(state.level).toBe(levelFromXp(5000));
    expect(state.level).toBeGreaterThan(1);
  });

  it('clamps a hostile ledger at zero rather than producing a negative hero', () => {
    const state = foldLedger([
      { kind: 'GOLD', amount: -500, engineVersion: ENGINE_VERSION },
      { kind: 'STAT_AGI', amount: -12, engineVersion: ENGINE_VERSION },
    ]);

    expect(state.gold).toBe(0);
    expect(state.stats.agi).toBe(0);
  });
});

describe('the banded curve', () => {
  /**
   * The shape asked for: quick at the start, progressively slower, and still
   * reachable. The old single power law was smooth and smoothly wrong at both
   * ends — dear at level 2, and nearly flat from 30 to 40.
   */
  it('gets dearer with every band', () => {
    const bandOne = xpForLevelStep(5);
    const bandTwo = xpForLevelStep(15);
    const bandThree = xpForLevelStep(25);
    const bandFour = xpForLevelStep(35);

    expect(bandTwo).toBeGreaterThan(bandOne);
    expect(bandThree).toBeGreaterThan(bandTwo);
    expect(bandFour).toBeGreaterThan(bandThree);
  });

  /**
   * Crossing a band is the steepening a player should FEEL.
   *
   * Bands are `floor((level - 2) / LEVEL_BAND_SIZE)`, so the first boundary is
   * the step to level 12 — levels 2 to 11 are the ten level-ups of band one.
   */
  it('jumps hardest at a band boundary', () => {
    const insideBand = xpForLevelStep(11) - xpForLevelStep(10);
    const acrossBand = xpForLevelStep(12) - xpForLevelStep(11);

    expect(acrossBand).toBeGreaterThan(insideBand);
  });

  it('never goes backwards', () => {
    let previous = 0;
    for (let level = 2; level <= 60; level += 1) {
      const total = xpForLevel(level);
      expect(total).toBeGreaterThan(previous);
      previous = total;
    }
  });

  it('is a whole number of XP at every level', () => {
    for (let level = 1; level <= 60; level += 1) {
      expect(Number.isInteger(xpForLevel(level))).toBe(true);
    }
  });

  /**
   * THE MEMO MUST NOT BE ABLE TO DISAGREE WITH ITSELF. `xpForLevel` fills a
   * cumulative table lazily and `levelFromXp` bisects on it, so a table filled
   * out of order would return different answers depending on what had been
   * asked for first.
   */
  it('gives the same answer whatever order it is asked in', () => {
    const forwards: number[] = [];
    for (let level = 1; level <= 30; level += 1) forwards.push(xpForLevel(level));

    const backwards: number[] = [];
    for (let level = 30; level >= 1; level -= 1) backwards.unshift(xpForLevel(level));

    expect(backwards).toEqual(forwards);
  });

  it('agrees with the sum of its own steps', () => {
    let summed = 0;
    for (let level = 2; level <= 25; level += 1) {
      summed += xpForLevelStep(level);
      expect(xpForLevel(level)).toBe(summed);
    }
  });

  /** `levelFromXp` still inverts it exactly, including at every boundary. */
  it('inverts exactly at every threshold', () => {
    for (let level = 2; level <= 45; level += 1) {
      const threshold = xpForLevel(level);

      expect(levelFromXp(threshold)).toBe(level);
      expect(levelFromXp(threshold - 1)).toBe(level - 1);
    }
  });

  /**
   * Reaching 10 is about twice as fast as the old curve. Pinned as a RATIO
   * against the level-20 cost rather than as a literal, so a retune that keeps
   * the shape keeps the test.
   */
  it('front-loads the first ten levels', () => {
    const toTen = xpForLevel(10);
    const toTwenty = xpForLevel(20);

    // The first ten levels are a small fraction of the next ten.
    expect(toTen / toTwenty).toBeLessThan(0.3);
  });
});
