import type { HeroClass, StatKey } from '../contracts/types';

/**
 * Talents: the contract.
 *
 * ============================================================================
 * MODELLED ON THE WOW TALENT TREE, AND ON THE PARTS OF IT THAT MATTER.
 * ============================================================================
 * The shape that makes those trees work is not the art or the tier count — it
 * is three rules acting together:
 *
 *   1. ONE POINT PER LEVEL, spent permanently. Scarcity is what makes a choice
 *      a choice; a tree you can fill is a checklist.
 *   2. DEPTH IS PAID FOR WITH BREADTH. A deep talent unlocks only after enough
 *      points sit in the SAME tree, so specialising costs the option to dabble.
 *      This is the whole reason three trees produce more than three builds.
 *   3. RANKS, not switches. Most talents take several points at diminishing
 *      commitment, so a player can take a little of something or commit to it.
 *
 * A hero may spend across ALL THREE of their class's trees. Hybrid builds are
 * the point — the gating makes them cost something rather than forbidding them.
 *
 * WHAT IS DELIBERATELY NOT HERE: respec. Points are permanent for now, which is
 * the honest default when the numbers are untuned — a respec button turns every
 * balance change into a shrug, and we would never learn which talents are dead.
 * Adding one later is a feature, not a correction.
 */

/** The three specialisations of each class. */
export const SPEC_IDS = [
  // WARRIOR
  'protection',
  'arms',
  'fury',
  // MAGE
  'fire',
  'frost',
  'lightning',
  // ROGUE — shown as Hunter
  'beast',
  'archer',
  'attacker',
  // PRIEST
  'spirit',
  'shadow',
  'darkness',
  // PALADIN
  'holy',
  'paladin_protection',
  'fighter',
] as const;

export type SpecId = (typeof SPEC_IDS)[number];

/**
 * Which specs belong to which class.
 *
 * `paladin_protection` is not a typo: Warrior and Paladin both have a spec
 * called "Protection" and a `SpecId` has to be unique across the game, because
 * a stored allocation is a flat map of spec id to points and would otherwise
 * merge the two. The DISPLAY name is "Protection" for both — see `TalentTree.name`.
 */
export const SPECS_BY_CLASS: Record<HeroClass, readonly [SpecId, SpecId, SpecId]> = {
  WARRIOR: ['protection', 'arms', 'fury'],
  MAGE: ['fire', 'frost', 'lightning'],
  ROGUE: ['beast', 'archer', 'attacker'],
  PRIEST: ['spirit', 'shadow', 'darkness'],
  PALADIN: ['holy', 'paladin_protection', 'fighter'],
};

/**
 * What a talent rank does.
 *
 * A UNION RATHER THAN A FUNCTION, because a talent has to be DATA: the engine is
 * replay-safe only if a hero's derived numbers can be recomputed from stored
 * values, and a stored allocation plus a versioned table of effects can be. A
 * table of closures could not be serialised, diffed, or shown to a player.
 *
 * `SPELL` effects are declared now and carry no mechanics yet — spells land in
 * a later version. They are in the union so the content can be written once,
 * and so a tree is not silently all-stats while the interesting half waits.
 */
export type TalentEffect =
  /** Flat points of an earned stat, as though trained for. */
  | { kind: 'STAT'; stat: StatKey; perRank: number }
  /** Percentage points added to a derived combat value. `+5` means +5%. */
  | { kind: 'COMBAT_PCT'; target: CombatTarget; perRank: number }
  /** Flat addition to a derived combat value, after percentages. */
  | { kind: 'COMBAT_FLAT'; target: CombatTarget; perRank: number }
  /**
   * Modifies a spell this spec casts. Inert until spells exist.
   *
   * Carried so the tree reads as designed rather than as a stat sheet, and so
   * turning spells on is adding a mechanic rather than rewriting the content.
   */
  | { kind: 'SPELL'; spellId: string; note: string; perRank: number };

/** Derived values a talent may move. Mirrors `DerivedCombat`, plus dodge. */
export const COMBAT_TARGETS = [
  'hp',
  'attack',
  'defence',
  'critPct',
  'regen',
  'stamina',
  'dodgePct',
] as const;

export type CombatTarget = (typeof COMBAT_TARGETS)[number];

export interface Talent {
  id: string;
  name: string;
  /** One line, written for a player deciding whether to spend a point. */
  description: string;
  /** How many points this talent accepts. */
  maxRank: number;
  /**
   * Which tier it sits in, from 1.
   *
   * Tier `n` requires `(n - 1) * TALENT_TIER_POINT_STEP` points already spent
   * IN THE SAME TREE — the rule that makes depth cost breadth.
   */
  tier: number;
  effects: readonly TalentEffect[];
}

export interface TalentTree {
  id: SpecId;
  /** Shown to the player. NOT unique across classes — see `SPECS_BY_CLASS`. */
  name: string;
  heroClass: HeroClass;
  /** One line on what the spec is for. */
  summary: string;
  talents: readonly Talent[];
}

/**
 * A hero's spent points: talent id -> ranks.
 *
 * FLAT, and keyed by talent id rather than nested by tree, because that is what
 * survives a content change gracefully. A tree that gains a talent leaves every
 * stored allocation still readable; a nested shape would need a migration each
 * time the content moved.
 */
export type TalentAllocation = Readonly<Record<string, number>>;
