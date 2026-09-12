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
import type { DerivedCombat, EquippedItems, Hero, StatBlock } from '../contracts/types';
import { withTalentCombat, withTalentStats } from '../talents/apply';
import type { TalentAllocation } from '../talents/types';
import { applyGear } from '../gear/equip';
import {
  ATTACK_BASE,
  ATTACK_PER_PRIMARY,
  CLASS_BASE_STATS,
  CLASS_PRIMARY_STAT,
  ATTACK_PER_LEVEL,
  DEFENCE_PER_LEVEL,
  DODGE_PCT_BASE,
  DODGE_PCT_MAX,
  DODGE_PCT_PER_AGI,
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
export function deriveCombat(
  hero: Hero,
  equipped?: EquippedItems,
  /**
   * The hero's talent build. Omit for an untalented derivation — the one- and
   * two-argument calls are unchanged and still mean exactly what they did.
   */
  allocation?: TalentAllocation,
): DerivedCombat {
  /*
   * THREE SOURCES OF STATS, IN ORDER, and the order is the contract:
   *   class base   what you start as
   *   earned       what you trained for
   *   gear         what you are wearing
   *   talents      what you chose
   *
   * Talents add to the stat line rather than to the derived numbers, so a
   * talent's +3 STR behaves exactly like +3 STR that was trained for. A bonus
   * that meant something different depending on where it came from would make
   * every later balance question start with "which kind of STR?".
   */
  const base = CLASS_BASE_STATS[hero.heroClass];
  const earned: StatBlock = {
    str: hero.stats.str + base.str,
    agi: hero.stats.agi + base.agi,
    end: hero.stats.end + base.end,
    vit: hero.stats.vit + base.vit,
    foc: hero.stats.foc + base.foc,
    spi: hero.stats.spi + base.spi,
  };

  const geared = equipped === undefined ? earned : applyGear(earned, equipped);
  const stats = allocation === undefined ? geared : withTalentStats(geared, allocation);
  const primaryStat = CLASS_PRIMARY_STAT[hero.heroClass];

  const combat: DerivedCombat = {
    // VIT and level both buy survivability so that levelling feels like progress even in a
    // week where the player earned no VIT at all.
    hp: toStat(HP_BASE + stats.vit * HP_PER_VIT + hero.level * HP_PER_LEVEL),
    /*
     * LEVEL NOW MOVES ATTACK AND DEFENCE TOO. Before 0.6.0 it bought HP alone,
     * so a level-20 hit exactly as hard as a level-1 with the same stats — the
     * reason duels across levels felt like a coin flip. Kept small against the
     * stat coefficients: training is the game, level is the floor under it.
     */
    attack: toStat(
      ATTACK_BASE + stats[primaryStat] * ATTACK_PER_PRIMARY + hero.level * ATTACK_PER_LEVEL,
    ),
    defence: toStat(stats.vit * DEFENCE_PER_VIT + hero.level * DEFENCE_PER_LEVEL),
    // Percentage points, may be fractional (per the contract), and capped so that an
    // all-AGI build reaches a ceiling instead of critting on every swing.
    critPct: Math.min(CRIT_PCT_MAX, Math.max(0, stats.agi * CRIT_PCT_PER_AGI)),
    regen: toStat(stats.spi * REGEN_PER_SPI),
    stamina: toStat(STAMINA_BASE + stats.end * STAMINA_PER_END),
    // Capped below the crit ceiling: a fight nobody can land a blow in is not a fight.
    dodgePct: Math.min(
      DODGE_PCT_MAX,
      Math.max(0, DODGE_PCT_BASE + stats.agi * DODGE_PCT_PER_AGI),
    ),
  };

  return allocation === undefined ? combat : withTalentCombat(combat, allocation);
}
