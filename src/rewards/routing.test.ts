/**
 * Routing table tests.
 *
 * These assert the PROPERTIES of the tables rather than their current numbers, so a
 * designer can rebalance freely and still be caught by the rules the economy depends on:
 * one source of truth, comparable stat pools per modality, and no penalty deep enough to
 * tell a user their real workout was worthless.
 */
import { HERO_CLASSES, MODALITIES, STAT_KEYS } from '../contracts/types';

import {
  CLASS_MODALITY_BIAS as CONSTANTS_CLASS_BIAS,
  MODALITY_STAT_WEIGHTS as CONSTANTS_STAT_WEIGHTS,
  MET_TABLE,
  MODALITY_WEIGHT,
} from './constants';
import {
  CLASS_MODALITY_BIAS,
  MODALITY_STAT_WEIGHTS,
  REWARD_KIND_STAT,
  STAT_REWARD_KIND,
  classBiasFor,
  statWeightsFor,
} from './routing';

describe('the tuning tables have exactly one home', () => {
  it('re-exports the very same tables that constants declares', () => {
    // Identity, not equality: two copies of a tuning table is two economies.
    expect(MODALITY_STAT_WEIGHTS).toBe(CONSTANTS_STAT_WEIGHTS);
    expect(CLASS_MODALITY_BIAS).toBe(CONSTANTS_CLASS_BIAS);
  });

  it('carries a row for every modality in the taxonomy', () => {
    for (const modality of MODALITIES) {
      expect(MET_TABLE[modality]).toBeGreaterThan(0);
      expect(MODALITY_WEIGHT[modality]).toBeGreaterThan(0);
      expect(MODALITY_STAT_WEIGHTS[modality]).toBeDefined();
    }
  });

  it('carries a row for every class', () => {
    for (const heroClass of HERO_CLASSES) {
      expect(CLASS_MODALITY_BIAS[heroClass]).toBeDefined();
    }
  });
});

describe('MODALITY_STAT_WEIGHTS', () => {
  it('gives every modality a stat pool of the same total size', () => {
    // Magnitude is `MODALITY_WEIGHT`'s job. If shares also varied in total, two dials
    // would control the same thing and the economy would stop being reasonable about.
    for (const modality of MODALITIES) {
      const total = Object.values(MODALITY_STAT_WEIGHTS[modality]).reduce(
        (sum, share) => sum + share,
        0,
      );

      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('routes every modality to at least one stat', () => {
    for (const modality of MODALITIES) {
      expect(Object.keys(MODALITY_STAT_WEIGHTS[modality]).length).toBeGreaterThan(0);
    }
  });

  it('only ever names real stats', () => {
    for (const modality of MODALITIES) {
      for (const key of Object.keys(MODALITY_STAT_WEIGHTS[modality])) {
        expect(STAT_KEYS).toContain(key);
      }
    }
  });

  it('is returned whole by statWeightsFor, for every modality', () => {
    for (const modality of MODALITIES) {
      expect(statWeightsFor(modality)).toBe(MODALITY_STAT_WEIGHTS[modality]);
    }
  });
});

describe('CLASS_MODALITY_BIAS', () => {
  it('only ever names real modalities', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const key of Object.keys(CLASS_MODALITY_BIAS[heroClass])) {
        expect(MODALITIES).toContain(key);
      }
    }
  });

  it('keeps every bias inside a band that neither trivialises nor punishes', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const modality of MODALITIES) {
        const bias = classBiasFor(heroClass, modality);

        expect(bias).toBeGreaterThanOrEqual(0.8);
        expect(bias).toBeLessThanOrEqual(1.3);
      }
    }
  });

  it('is neutral where a class has no opinion', () => {
    // WARRIOR has no entry for team sport, so it converts at the neutral rate.
    expect(CLASS_MODALITY_BIAS.WARRIOR.sport_team).toBeUndefined();
    expect(classBiasFor('WARRIOR', 'sport_team')).toBe(1);
  });

  it('gives every specialist both an affinity and a deliberate neglect penalty', () => {
    for (const heroClass of HERO_CLASSES.filter((c) => c !== 'PALADIN')) {
      const biases = MODALITIES.map((modality) => classBiasFor(heroClass, modality));

      expect(Math.max(...biases)).toBeGreaterThan(1);
      expect(Math.min(...biases)).toBeLessThan(1);
    }
  });

  it('makes the generalist the only class that converts the unrecognised well', () => {
    for (const heroClass of HERO_CLASSES.filter((c) => c !== 'PALADIN')) {
      expect(classBiasFor('PALADIN', 'other')).toBeGreaterThan(classBiasFor(heroClass, 'other'));
    }
  });
});

describe('stat and reward-kind mapping', () => {
  it('maps every stat to its reward kind and back again', () => {
    for (const key of STAT_KEYS) {
      const kind = STAT_REWARD_KIND[key];

      expect(kind).toBe(`STAT_${key.toUpperCase()}`);
      expect(REWARD_KIND_STAT[kind]).toBe(key);
    }
  });

  it('has no stat opinion about XP, gold or item drops', () => {
    expect(REWARD_KIND_STAT.XP).toBeUndefined();
    expect(REWARD_KIND_STAT.GOLD).toBeUndefined();
    expect(REWARD_KIND_STAT.ITEM_DROP).toBeUndefined();
  });
});
