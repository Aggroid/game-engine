/**
 * Projection of a hero's earned stats onto the numbers a fight actually uses.
 *
 * Combat values are DERIVED, NEVER STORED. `Hero` carries no `hp` and no `attack` by
 * design (see `contracts/types.ts`), because the alternative — writing combat numbers into
 * the database at level-up — means every rebalance leaves millions of stale rows behind
 * and a hero's power depends on when it last happened to be recomputed. Deriving on demand
 * makes a tuning change in `constants.ts` apply to every hero in the game simultaneously.
 *
 * GEAR FOLLOWS THE SAME RULE. Equipment is an OPTIONAL second argument, not a field on `Hero`,
 * because a geared stat block is a projection too: the hero's `stats` are the fold of their
 * reward ledger and nothing else, so equipping an item must never write to them (see
 * `applyGear`). Passing no equipment derives an unequipped hero, which is exactly what the
 * single-argument call has always meant.
 */
import type { DerivedCombat, EquippedItems, Hero } from '../contracts/types';
import { applyGear } from '../gear/equip';
import {
  ATTACK_BASE,
  ATTACK_PER_PRIMARY,
  CLASS_PRIMARY_STAT,
  CRIT_PCT_MAX,
  CRIT_PCT_PER_AGI,
  DEFENCE_PER_VIT,
  HP_BASE,
  HP_PER_LEVEL,
  HP_PER_VIT,
  REGEN_PER_SPI,
  STAMINA_BASE,
  STAMINA_PER_END,
} from './constants';

/**
 * Rounds to a non-negative integer.
 *
 * Every combat value except `critPct` is an integer by contract, and the rounding happens
 * HERE rather than in the simulator so that no float can reach an emitted `BattleEvent`:
 * fractional HP would make a log's arithmetic unreproducible across engines and would leak
 * `0.30000000000000004`-style values into a document the client renders verbatim.
 */
function toStat(value: number): number {
  return Math.max(0, Math.round(value));
}

/**
 * Computes a hero's combat numbers from level, class and the six earned stats.
 *
 * PURE. Reads `hero` and `equipped`, mutates neither, touches no clock and no randomness — the
 * same hero with the same loadout always derives the same block, which is what lets a stored
 * `BattleLog` be re-simulated. A battle log must therefore record the loadout it was fought in,
 * for the same reason it records the seed.
 *
 * @param hero     The hero as stored: identity plus EARNED totals, never gear-inflated.
 * @param equipped What the hero has on, if anything. Omit for an unequipped derivation — the
 *                 one-argument call is unchanged and still means exactly what it always did.
 * @returns Freshly derived combat values. Never cached, never written back to the hero.
 */
export function deriveCombat(hero: Hero, equipped?: EquippedItems): DerivedCombat {
  const stats = equipped === undefined ? hero.stats : applyGear(hero.stats, equipped);
  const primaryStat = CLASS_PRIMARY_STAT[hero.heroClass];

  return {
    // VIT and level both buy survivability so that levelling feels like progress even in a
    // week where the player earned no VIT at all.
    hp: toStat(HP_BASE + stats.vit * HP_PER_VIT + hero.level * HP_PER_LEVEL),
    // The ONLY place class changes the maths: attack scales off the class primary stat.
    attack: toStat(ATTACK_BASE + stats[primaryStat] * ATTACK_PER_PRIMARY),
    defence: toStat(stats.vit * DEFENCE_PER_VIT),
    // Percentage points, may be fractional (per the contract), and capped so that an
    // all-AGI build reaches a ceiling instead of critting on every swing.
    critPct: Math.min(CRIT_PCT_MAX, Math.max(0, stats.agi * CRIT_PCT_PER_AGI)),
    regen: toStat(stats.spi * REGEN_PER_SPI),
    stamina: toStat(STAMINA_BASE + stats.end * STAMINA_PER_END),
  };
}
