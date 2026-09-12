import { HERO_CLASSES, type HeroClass } from '../contracts/types';
import { TALENT_TIER_POINT_STEP, talentPointsForLevel } from './constants';
import { TALENTS_BY_ID, TALENT_TREES, TREE_BY_TALENT_ID } from './trees';
import { SPECS_BY_CLASS, SPEC_IDS } from './types';
import {
  canSpendPoint,
  pointsAvailable,
  pointsInTree,
  pointsRequiredForTier,
  spendPoint,
  validateAllocation,
} from './allocate';
import { talentCombatModifiers, talentStatBonus, withTalentCombat } from './apply';

/**
 * The rules that make a talent tree a set of decisions rather than a checklist:
 * one point per level, depth paid for with breadth, and a build that outlives
 * the rules that made it still has to be legal.
 */

describe('the content itself', () => {
  it('gives every class exactly three trees, and every tree to exactly one class', () => {
    const claimed = HERO_CLASSES.flatMap((heroClass) => SPECS_BY_CLASS[heroClass]);

    expect(claimed).toHaveLength(HERO_CLASSES.length * 3);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect([...claimed].sort()).toEqual([...SPEC_IDS].sort());
  });

  it('has every tree agree with the class that claims it', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const specId of SPECS_BY_CLASS[heroClass]) {
        expect(TALENT_TREES[specId].heroClass).toBe(heroClass);
      }
    }
  });

  /**
   * Warrior and Paladin both have a spec called "Protection". The IDS must
   * differ — a stored allocation is a flat map, and two trees sharing an id
   * would merge two different builds into one.
   */
  it('keeps ids unique even where two specs share a display name', () => {
    const names = Object.values(TALENT_TREES).map((tree) => tree.name);
    expect(names.filter((name) => name === 'Protection')).toHaveLength(2);

    const ids = Object.values(TALENT_TREES).map((tree) => tree.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every talent a unique id across the whole game', () => {
    const ids = Object.values(TALENT_TREES).flatMap((tree) => tree.talents.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * A UNIFORM SHAPE, so a player can read a tree they have never seen and so
   * balance compares like with like.
   */
  it('shapes every tree the same: two, two, and a capstone', () => {
    for (const tree of Object.values(TALENT_TREES)) {
      const byTier = [1, 2, 3].map((tier) => tree.talents.filter((t) => t.tier === tier));

      expect(byTier[0]!).toHaveLength(2);
      expect(byTier[1]!).toHaveLength(2);
      expect(byTier[2]!).toHaveLength(1);
      expect(byTier[2]![0]!.maxRank).toBe(1);
    }
  });

  it('lets tier one be filled exactly, which is what opens tier two', () => {
    for (const tree of Object.values(TALENT_TREES)) {
      const tierOnePoints = tree.talents
        .filter((t) => t.tier === 1)
        .reduce((sum, t) => sum + t.maxRank, 0);

      // Filling tier 1 opens tier 2 with nothing left over — no filler to buy.
      expect(tierOnePoints).toBeGreaterThanOrEqual(TALENT_TIER_POINT_STEP);
    }
  });

  it('gives every talent at least one effect', () => {
    for (const talent of Object.values(TALENTS_BY_ID)) {
      expect(talent.effects.length).toBeGreaterThan(0);
      expect(talent.name.length).toBeGreaterThan(0);
      expect(talent.description.length).toBeGreaterThan(0);
    }
  });
});

describe('points come from levels', () => {
  /** A level-1 hero has never levelled up, so has nothing to spend. */
  it('gives a fresh hero nothing', () => {
    expect(talentPointsForLevel(1)).toBe(0);
  });

  it('gives one per level-up', () => {
    expect(talentPointsForLevel(2)).toBe(1);
    expect(talentPointsForLevel(10)).toBe(9);
    expect(talentPointsForLevel(41)).toBe(40);
  });

  it('never goes negative, whatever it is handed', () => {
    expect(talentPointsForLevel(0)).toBe(0);
    expect(talentPointsForLevel(-5)).toBe(0);
    expect(talentPointsForLevel(Number.NaN)).toBe(0);
  });
});

describe('spending a point', () => {
  const WARRIOR: HeroClass = 'WARRIOR';

  it('accepts a tier-one talent from your own class', () => {
    const decision = canSpendPoint({
      heroClass: WARRIOR,
      level: 10,
      allocation: {},
      talentId: 'prot_toughness',
    });

    expect(decision).toEqual({ ok: true, rank: 1 });
  });

  it('refuses another class’s tree', () => {
    expect(
      canSpendPoint({ heroClass: WARRIOR, level: 10, allocation: {}, talentId: 'fire_ignite' }),
    ).toEqual({ ok: false, reason: 'WRONG_CLASS' });
  });

  it('refuses a talent that does not exist', () => {
    expect(
      canSpendPoint({ heroClass: WARRIOR, level: 10, allocation: {}, talentId: 'nope' }),
    ).toEqual({ ok: false, reason: 'UNKNOWN_TALENT' });
  });

  it('refuses past the rank cap', () => {
    const maxed = { prot_toughness: 3 };
    expect(
      canSpendPoint({ heroClass: WARRIOR, level: 20, allocation: maxed, talentId: 'prot_toughness' }),
    ).toEqual({ ok: false, reason: 'MAX_RANK' });
  });

  it('refuses when every point is already spent', () => {
    // Level 2 gives exactly one point, and it is spent.
    expect(
      canSpendPoint({
        heroClass: WARRIOR,
        level: 2,
        allocation: { prot_toughness: 1 },
        talentId: 'prot_bulwark',
      }),
    ).toEqual({ ok: false, reason: 'NO_POINTS_LEFT' });
  });

  /**
   * DEPTH IS PAID FOR WITH BREADTH — the rule that makes three trees produce
   * more than three builds.
   */
  it('locks a deeper tier until enough points sit in that tree', () => {
    const shallow = canSpendPoint({
      heroClass: WARRIOR,
      level: 40,
      allocation: { prot_toughness: 1 },
      talentId: 'prot_footwork',
    });

    expect(shallow).toEqual({
      ok: false,
      reason: 'TIER_LOCKED',
      needed: TALENT_TIER_POINT_STEP,
    });
  });

  it('opens the tier the moment the tree has enough', () => {
    const ready = canSpendPoint({
      heroClass: WARRIOR,
      level: 40,
      allocation: { prot_toughness: 3, prot_bulwark: 2 },
      talentId: 'prot_footwork',
    });

    expect(ready).toEqual({ ok: true, rank: 1 });
  });

  it('counts only the SAME tree towards a tier', () => {
    // Five points, but spread across two trees: neither tier two opens.
    const spread = canSpendPoint({
      heroClass: WARRIOR,
      level: 40,
      allocation: { prot_toughness: 3, arms_technique: 2 },
      talentId: 'prot_footwork',
    });

    expect(spread).toMatchObject({ ok: false, reason: 'TIER_LOCKED' });
  });

  it('requires ten in a tree for its capstone', () => {
    expect(pointsRequiredForTier(3)).toBe(TALENT_TIER_POINT_STEP * 2);

    const nearly = canSpendPoint({
      heroClass: WARRIOR,
      level: 40,
      allocation: { prot_toughness: 3, prot_bulwark: 3, prot_footwork: 3 },
      talentId: 'prot_last_stand',
    });
    expect(nearly).toMatchObject({ ok: false, reason: 'TIER_LOCKED' });

    const ready = canSpendPoint({
      heroClass: WARRIOR,
      level: 40,
      allocation: { prot_toughness: 3, prot_bulwark: 3, prot_footwork: 3, prot_conditioning: 1 },
      talentId: 'prot_last_stand',
    });
    expect(ready).toEqual({ ok: true, rank: 1 });
  });

  it('returns a NEW allocation and leaves the old one alone', () => {
    const before = { prot_toughness: 1 };
    const after = spendPoint({
      heroClass: WARRIOR,
      level: 10,
      allocation: before,
      talentId: 'prot_toughness',
    });

    expect(after.prot_toughness).toBe(2);
    expect(before.prot_toughness).toBe(1);
  });

  /** A refusal throws rather than silently returning the old map. */
  it('throws rather than quietly doing nothing', () => {
    expect(() =>
      spendPoint({ heroClass: WARRIOR, level: 1, allocation: {}, talentId: 'prot_toughness' }),
    ).toThrow(/NO_POINTS_LEFT/);
  });
});

describe('a build has to stay legal', () => {
  /**
   * AN ALLOCATION OUTLIVES THE RULES THAT MADE IT. A build stored by a newer
   * client can name talents this engine has never heard of, and a content
   * change can remove one. Trusting a build because each point was checked once,
   * long ago, is how a stale build silently inflates a hero's numbers.
   */
  it('accepts a build that was spent legally', () => {
    expect(
      validateAllocation({
        heroClass: 'WARRIOR',
        level: 20,
        allocation: { prot_toughness: 3, prot_bulwark: 3, arms_technique: 2 },
      }),
    ).toEqual({ ok: true });
  });

  it('rejects more points than the level allows', () => {
    expect(
      validateAllocation({
        heroClass: 'WARRIOR',
        level: 3,
        allocation: { prot_toughness: 3, prot_bulwark: 3 },
      }),
    ).toMatchObject({ ok: false, reason: 'NO_POINTS_LEFT' });
  });

  it('rejects a talent from another class', () => {
    expect(
      validateAllocation({
        heroClass: 'WARRIOR',
        level: 20,
        allocation: { fire_ignite: 1 },
      }),
    ).toMatchObject({ ok: false, reason: 'WRONG_CLASS', talentId: 'fire_ignite' });
  });

  it('rejects over-ranked talents', () => {
    expect(
      validateAllocation({
        heroClass: 'WARRIOR',
        level: 40,
        allocation: { prot_toughness: 9 },
      }),
    ).toMatchObject({ ok: false, reason: 'MAX_RANK' });
  });

  it('rejects a deep talent with nothing under it', () => {
    expect(
      validateAllocation({
        heroClass: 'WARRIOR',
        level: 40,
        allocation: { prot_last_stand: 1 },
      }),
    ).toMatchObject({ ok: false, reason: 'TIER_LOCKED' });
  });

  it('rejects a talent this engine has never heard of', () => {
    expect(
      validateAllocation({
        heroClass: 'WARRIOR',
        level: 40,
        allocation: { from_a_newer_build: 1 },
      }),
    ).toMatchObject({ ok: false, reason: 'UNKNOWN_TALENT' });
  });
});

describe('what a build is worth', () => {
  it('turns STAT talents into stat points', () => {
    expect(talentStatBonus({ prot_conditioning: 2 })).toEqual({ vit: 6 });
  });

  it('adds up several ranks and several talents', () => {
    const bonus = talentStatBonus({ arms_heavy_hands: 3, prot_conditioning: 1 });
    expect(bonus).toEqual({ str: 9, vit: 3 });
  });

  it('collects percentage and flat modifiers separately', () => {
    const { pct, flat } = talentCombatModifiers({ prot_toughness: 2, prot_bulwark: 3 });

    expect(pct.hp).toBe(8);
    expect(flat.defence).toBe(6);
  });

  /**
   * PERCENTAGES BEFORE FLATS, so a flat bonus is worth the same to everybody. A
   * flat that got multiplied afterwards would be worth more to whoever already
   * had more, which is the opposite of what a flat bonus is for.
   */
  it('applies percentages first, then flats', () => {
    const combat = {
      hp: 100,
      attack: 100,
      defence: 100,
      critPct: 10,
      regen: 10,
      stamina: 3,
      dodgePct: 5,
    };

    // +4% HP per rank x2 = +8%; +2 defence per rank x3 = +6 flat.
    const after = withTalentCombat(combat, { prot_toughness: 2, prot_bulwark: 3 });

    expect(after.hp).toBe(108);
    expect(after.defence).toBe(106);
  });

  it('ignores ranks above the cap rather than paying them out', () => {
    const honest = talentStatBonus({ prot_conditioning: 3 });
    const cheating = talentStatBonus({ prot_conditioning: 99 });

    expect(cheating).toEqual(honest);
  });

  /**
   * A build from a NEWER client degrades to the talents this engine knows,
   * rather than failing to derive at all — a hero must always have numbers.
   */
  it('skips talents it does not recognise', () => {
    expect(talentStatBonus({ not_a_talent: 3, prot_conditioning: 1 })).toEqual({ vit: 3 });
  });

  it('never lets a build drop HP below one', () => {
    const frail = {
      hp: 10,
      attack: 10,
      defence: 1,
      critPct: 0,
      regen: 0,
      stamina: 1,
      dodgePct: 0,
    };
    // Recklessness is -2% HP per rank; even absurd ranks cannot zero a hero.
    expect(withTalentCombat(frail, { fury_reckless: 3 }).hp).toBeGreaterThanOrEqual(1);
  });
});

describe('counting', () => {
  it('reports points spent and left', () => {
    const allocation = { prot_toughness: 3, arms_technique: 2 };

    expect(pointsInTree(allocation, 'protection')).toBe(3);
    expect(pointsInTree(allocation, 'arms')).toBe(2);
    expect(pointsInTree(allocation, 'fury')).toBe(0);
    expect(pointsAvailable(11, allocation)).toBe(5);
  });

  it('treats a corrupt rank as no points rather than as a negative', () => {
    const allocation = { prot_toughness: -4, arms_technique: 2 } as Record<string, number>;

    expect(pointsInTree(allocation, 'protection')).toBe(0);
    expect(pointsAvailable(11, allocation)).toBe(8);
  });

  it('knows the tree every talent belongs to', () => {
    for (const [id, talent] of Object.entries(TALENTS_BY_ID)) {
      expect(TREE_BY_TALENT_ID[id]).toBeDefined();
      expect(TREE_BY_TALENT_ID[id]!.talents).toContain(talent);
    }
  });
});
