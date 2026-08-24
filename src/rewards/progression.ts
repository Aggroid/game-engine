/**
 * The level curve, and the fold that turns a ledger into a hero.
 *
 * TWO INVARIANTS CARRY THIS FILE, AND BOTH ARE LOAD-BEARING FOR THE WHOLE PRODUCT:
 *
 * 1. `levelFromXp` IS THE EXACT INVERSE OF `xpForLevel` AT EVERY BOUNDARY.
 *    They are computed from one formula in one direction and searched in the other, never
 *    written twice. Two independently-tuned expressions for "level" is how a player ends
 *    up seeing "Level 7" on one screen and "Level 6" on another — the classic, unfixable,
 *    trust-destroying bug of this genre.
 *
 * 2. `foldLedger` IS ORDER-INDEPENDENT.
 *    Hero state is a fold over an append-only ledger, so the same rows in any order MUST
 *    produce the same hero — the backend may re-read rows in a different order, a
 *    late-syncing watch may insert yesterday's session after today's, and a rebalance may
 *    replay everything from the beginning. This holds because the fold does nothing but
 *    add integers, and integer addition is exact, associative and commutative. Any float
 *    in this path, or any per-entry clamp, would silently reintroduce order-dependence:
 *    a clamp is `max`, `max` does not commute with `+`, and a hero would then depend on
 *    the order their workouts happened to be read in.
 */
import type { HeroState, RewardEntry, StatBlock, StatKey } from '../contracts/types';
import { STAT_KEYS } from '../contracts/types';

import { LEVEL_CURVE_BASE, LEVEL_CURVE_EXPONENT } from './constants';
import { REWARD_KIND_STAT } from './routing';

/** The level every hero starts at. Level 1 costs no XP by definition. */
const FIRST_LEVEL = 1;

/**
 * Cumulative XP required to REACH a level — not the XP for the step from the one below.
 *
 * Cumulative rather than incremental because that is what makes the inverse cheap and
 * exact, and because it means a hero's level can always be recomputed from lifetime XP
 * alone. `Hero.level` is therefore a cache, never a fact: nothing in the system has to
 * remember to increment it, so nothing can forget to.
 *
 * @param level 1-based. Anything at or below 1 costs 0; non-integers are floored, so a
 *              caller cannot conjure a fractional threshold.
 * @returns Total lifetime XP needed to be this level. Strictly increasing above level 1.
 */
export function xpForLevel(level: number): number {
  const whole = Math.floor(level);
  if (whole <= FIRST_LEVEL) {
    return 0;
  }

  return Math.round(LEVEL_CURVE_BASE * (whole - FIRST_LEVEL) ** LEVEL_CURVE_EXPONENT);
}

/**
 * The level implied by a lifetime XP total: the largest `L` with `xpForLevel(L) <= xp`.
 *
 * Found by galloping then bisecting on `xpForLevel` itself, rather than by algebraically
 * inverting the curve. Deliberate: the forward function ROUNDS, so an algebraic inverse
 * agrees with it almost everywhere and disagrees exactly at the boundaries — precisely
 * where a player is watching. Searching the real function cannot drift from it, no matter
 * how the curve is later retuned. Both loops are O(log level) and integer-driven.
 */
export function levelFromXp(xp: number): number {
  if (xp < xpForLevel(FIRST_LEVEL + 1)) {
    return FIRST_LEVEL;
  }

  // Gallop upwards until the level is bracketed. Runs at least once, given the guard.
  let upper = FIRST_LEVEL + 1;
  while (xpForLevel(upper) <= xp) {
    upper *= 2;
  }

  // Invariant: xpForLevel(lower) <= xp < xpForLevel(upper).
  let lower = Math.floor(upper / 2);
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (xpForLevel(middle) <= xp) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  return lower;
}

/** A fresh zeroed stat block, built from `STAT_KEYS` so it can never miss a key. */
function emptyStats(): StatBlock {
  return Object.fromEntries(STAT_KEYS.map((key: StatKey) => [key, 0])) as StatBlock;
}

/**
 * Folds a reward ledger into hero totals.
 *
 * THE ORDER-INDEPENDENCE PROPERTY (see the file header) is the single most important
 * behaviour in this package, and the shuffle test that guards it is the highest-value
 * test in the repo: if this fold is ever order-dependent, every replay after a rebalance
 * produces a subtly different hero and nobody finds out until players compare notes.
 *
 * Entry amounts are truncated to integers on the way in. Amounts are SIGNED — a
 * correction or a decay is a negative row, so history is appended to and never edited —
 * and totals are clamped at zero only ONCE, at the very end, where clamping cannot
 * interact with ordering.
 *
 * `ITEM_DROP` rows are counted by nobody here: inventory is not part of `HeroState`.
 * They pass through untouched rather than being treated as an error, because a ledger
 * legitimately contains rows this fold has no opinion about.
 *
 * @param entries Any ledger slice, in any order, possibly containing negative rows.
 * @returns Totals plus the level implied by the XP total. Never mutates `entries`.
 */
export function foldLedger(entries: readonly RewardEntry[]): HeroState {
  const stats = emptyStats();
  let xp = 0;
  let gold = 0;

  for (const { kind, amount } of entries) {
    const whole = Math.trunc(amount);

    if (kind === 'XP') {
      xp += whole;
      continue;
    }

    if (kind === 'GOLD') {
      gold += whole;
      continue;
    }

    const statKey = REWARD_KIND_STAT[kind];
    if (statKey !== undefined) {
      stats[statKey] += whole;
    }
  }

  const totalXp = Math.max(0, xp);

  for (const key of STAT_KEYS) {
    stats[key] = Math.max(0, stats[key]);
  }

  return {
    level: levelFromXp(totalXp),
    xp: totalXp,
    gold: Math.max(0, gold),
    stats,
  };
}
