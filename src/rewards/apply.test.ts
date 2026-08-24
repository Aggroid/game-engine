/**
 * Ledger-row tests.
 *
 * Two things matter more than the amounts: rows are STAMPED with the engine version that
 * produced them, and the hero handed in is NEVER touched. The first is what makes an old
 * ledger explainable after a rebalance; the second is what makes hero state a fold over
 * the ledger rather than a second, divergent source of truth.
 */
import { HERO_CLASSES, MODALITIES, STAT_KEYS } from '../contracts/types';
import type { EffortResult, HeroClass, Modality, RewardEntry } from '../contracts/types';

import { ACTIVITY_TYPE_BY_MODALITY, activity, context, deepFreeze, hero } from './__fixtures__/support';
import { applyRewards } from './apply';
import { GOLD_PER_EP, XP_PER_EP } from './constants';
import { computeEffortPoints } from './effort';
import { ENGINE_VERSION } from './index';
import { MODALITY_STAT_WEIGHTS, classBiasFor } from './routing';
import { ENGINE_VERSION as LEAF_ENGINE_VERSION } from './version';

/** A two-hour strength session — every class has an opinion about lifting. */
const STRENGTH_SESSION: EffortResult = computeEffortPoints(
  activity({ activityType: ACTIVITY_TYPE_BY_MODALITY.strength, durationSec: 2 * 3600 }),
  context(),
);

const amountOf = (entries: readonly RewardEntry[], kind: RewardEntry['kind']): number =>
  entries.find((row) => row.kind === kind)?.amount ?? 0;

describe('applyRewards — versioning', () => {
  it('stamps every row with the engine version', () => {
    const entries = applyRewards(hero(), STRENGTH_SESSION);

    expect(entries.length).toBeGreaterThan(0);
    for (const row of entries) {
      expect(row.engineVersion).toBe(ENGINE_VERSION);
    }
  });

  it('serves the same version from the leaf module and the barrel', () => {
    // Guards the cycle fix: if the version ever moves back into the barrel, this is the
    // pair of imports that would start disagreeing under a non-CommonJS loader.
    expect(LEAF_ENGINE_VERSION).toBe(ENGINE_VERSION);
    expect(ENGINE_VERSION).toBe('0.1.0');
  });
});

describe('applyRewards — immutability', () => {
  it('does not mutate the hero it is given', () => {
    const subject = deepFreeze(hero({ heroClass: 'WARRIOR', xp: 500, gold: 40 }));
    const before = structuredClone(subject);

    expect(() => applyRewards(subject, STRENGTH_SESSION)).not.toThrow();
    expect(subject).toEqual(before);
  });

  it('does not mutate the effort result it is given', () => {
    const effort = deepFreeze({ ...STRENGTH_SESSION });
    const before = structuredClone(effort);

    applyRewards(hero(), effort);

    expect(effort).toEqual(before);
  });

  it('returns a fresh array on every call', () => {
    const subject = hero();

    expect(applyRewards(subject, STRENGTH_SESSION)).not.toBe(
      applyRewards(subject, STRENGTH_SESSION),
    );
  });
});

describe('applyRewards — class divergence', () => {
  const rewardsByClass = Object.fromEntries(
    HERO_CLASSES.map((heroClass) => [
      heroClass,
      applyRewards(hero({ heroClass }), STRENGTH_SESSION),
    ]),
  ) as Record<HeroClass, RewardEntry[]>;

  it('snapshots the same lifting session for all five classes', () => {
    expect(rewardsByClass).toMatchSnapshot();
  });

  it('pays every class a different amount for the identical session', () => {
    for (const a of HERO_CLASSES) {
      for (const b of HERO_CLASSES) {
        if (a === b) {
          continue;
        }

        expect(JSON.stringify(rewardsByClass[a])).not.toBe(JSON.stringify(rewardsByClass[b]));
      }
    }
  });

  it('rewards the specialist and penalises the neglectful, on the same workout', () => {
    const warrior = amountOf(rewardsByClass.WARRIOR, 'XP');
    const paladin = amountOf(rewardsByClass.PALADIN, 'XP');
    const mage = amountOf(rewardsByClass.MAGE, 'XP');

    expect(warrior).toBeGreaterThan(paladin);
    expect(mage).toBeLessThan(paladin);
  });

  it('never makes an off-class workout worthless', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const modality of MODALITIES) {
        expect(classBiasFor(heroClass, modality)).toBeGreaterThanOrEqual(0.8);
      }
    }
  });

  it('gives the generalist no penalty anywhere', () => {
    for (const modality of MODALITIES) {
      expect(classBiasFor('PALADIN', modality)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('applyRewards — routing', () => {
  it('credits exactly the stats the modality table says it should', () => {
    for (const modality of MODALITIES) {
      const effort: EffortResult = {
        ep: 1000,
        rawEp: 1000,
        intensityTier: 'MET_TABLE',
        modality,
      };

      const entries = applyRewards(hero({ heroClass: 'PALADIN' }), effort);
      const credited = entries
        .filter((row) => row.kind.startsWith('STAT_'))
        .map((row) => row.kind.replace('STAT_', '').toLowerCase());

      const expected = STAT_KEYS.filter((key) => MODALITY_STAT_WEIGHTS[modality][key] !== undefined);

      expect(credited.sort()).toEqual([...expected].sort());
    }
  });

  it('routes lifting to strength and vitality, and recovery to spirit', () => {
    const lifting = applyRewards(hero({ heroClass: 'PALADIN' }), {
      ep: 1000,
      rawEp: 1000,
      intensityTier: 'MET_TABLE',
      modality: 'strength',
    });
    const resting = applyRewards(hero({ heroClass: 'PALADIN' }), {
      ep: 1000,
      rawEp: 1000,
      intensityTier: 'MET_TABLE',
      modality: 'recovery',
    });

    expect(amountOf(lifting, 'STAT_STR')).toBeGreaterThan(0);
    expect(amountOf(lifting, 'STAT_VIT')).toBeGreaterThan(0);
    expect(amountOf(lifting, 'STAT_SPI')).toBe(0);

    expect(amountOf(resting, 'STAT_SPI')).toBeGreaterThan(0);
    expect(amountOf(resting, 'STAT_STR')).toBe(0);
  });

  it('emits rows in a stable order: XP, gold, then stats in canonical order', () => {
    const entries = applyRewards(hero({ heroClass: 'PALADIN' }), {
      ep: 2000,
      rawEp: 2000,
      intensityTier: 'MET_TABLE',
      modality: 'other',
    });

    expect(entries.map((row) => row.kind)).toEqual([
      'XP',
      'GOLD',
      ...STAT_KEYS.map((key) => `STAT_${key.toUpperCase()}`),
    ]);
  });
});

describe('applyRewards — amounts', () => {
  it('converts EP into XP and gold at the configured rates', () => {
    const effort: EffortResult = {
      ep: 200,
      rawEp: 200,
      intensityTier: 'MET_TABLE',
      modality: 'sport_team',
    };
    const entries = applyRewards(hero({ heroClass: 'PALADIN' }), effort);

    expect(amountOf(entries, 'XP')).toBe(200 * XP_PER_EP);
    expect(amountOf(entries, 'GOLD')).toBe(200 * GOLD_PER_EP);
  });

  it('writes no rows at all for an effort that earned nothing', () => {
    const entries = applyRewards(hero(), {
      ep: 0,
      rawEp: 0,
      intensityTier: 'FLOOR',
      modality: 'other',
    });

    expect(entries).toEqual([]);
  });

  it('writes only whole amounts', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const modality of MODALITIES) {
        const entries = applyRewards(hero({ heroClass }), {
          ep: 137,
          rawEp: 137,
          intensityTier: 'MET_TABLE',
          modality: modality as Modality,
        });

        for (const row of entries) {
          expect(Number.isInteger(row.amount)).toBe(true);
        }
      }
    }
  });
});
