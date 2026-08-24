/**
 * EVERY TUNING VALUE FOR THE BATTLE SIMULATOR. PROVISIONAL — PENDING BALANCE WORK.
 *
 * These numbers were chosen to make the first vertical slice playable, NOT to be fair or
 * final. Expect all of them to move once real player data exists. They live here, and
 * only here, for two reasons:
 *
 *  1. Balance is a design activity, not a code change. A designer must be able to read
 *     the whole cost model on one screen and change it without touching the loop.
 *  2. Output determinism. Changing any value below changes the outcome of every future
 *     battle, so a change here is a `SIM_VERSION` bump — which is only auditable if the
 *     tuning surface is one file rather than numbers sprinkled through the simulator.
 *
 * A magic number inline in `simulate.ts` or `derive.ts` is a bug, not a style nit.
 */
import type { HeroClass, StatKey } from '../contracts/types';

/* -------------------------------------------------------------------------- *
 * Derived combat — see `derive.ts`
 * -------------------------------------------------------------------------- */

/** Hit points granted per point of VIT. VIT is the only stat that buys survivability twice (HP and defence). */
export const HP_PER_VIT = 8;

/** Hit points granted per hero level, so a levelled hero survives a fight the stats alone would lose. */
export const HP_PER_LEVEL = 12;

/** Hit points every hero has before stats and level, so a level 1 hero with nothing is not one-shot. */
export const HP_BASE = 50;

/** Attack power per point of the CLASS PRIMARY stat — the single reason class matters in combat. */
export const ATTACK_PER_PRIMARY = 2.2;

/** Attack power every hero has regardless of stats, so a fresh hero can still win a starter fight. */
export const ATTACK_BASE = 5;

/** Damage mitigated per point of VIT. Deliberately below `ATTACK_PER_PRIMARY`: defence should soften, never stall. */
export const DEFENCE_PER_VIT = 1.4;

/** Critical-hit chance in percentage points per point of AGI. */
export const CRIT_PCT_PER_AGI = 0.6;

/** Hard ceiling on crit chance, in percentage points. Caps the AGI stacking build before combat becomes a coin flip. */
export const CRIT_PCT_MAX = 50;

/** Damage multiplier applied to a critical hit. */
export const CRIT_MULTIPLIER = 1.8;

/** Hit points regenerated per turn per point of SPI — SPI's whole combat identity is attrition. */
export const REGEN_PER_SPI = 0.8;

/** Sustainable turns per point of END. */
export const STAMINA_PER_END = 0.5;

/** Sustainable turns before any END is earned. */
export const STAMINA_BASE = 3;

/* -------------------------------------------------------------------------- *
 * The turn loop — see `simulate.ts`
 * -------------------------------------------------------------------------- */

/**
 * Symmetric damage roll on every hit, as a fraction: `0.15` means each blow lands
 * somewhere in ±15% of its computed value. Pure texture — it exists so two runs of the
 * same matchup feel different, and it is drawn from the seeded PRNG so they still replay
 * identically.
 */
export const DAMAGE_VARIANCE = 0.15;

/**
 * Hard turn ceiling. A battle MUST terminate: the simulator runs server-side, per player,
 * and an unwinnable matchup between a high-defence hero and a high-defence enemy would
 * otherwise loop forever. Exhausting the ceiling is treated as a LOSS (see `simulate.ts`)
 * rather than a draw, because the contract's `BattleOutcome` has no third state and
 * because "run out the clock" must never be a viable strategy.
 */
export const MAX_TURNS = 60;

/**
 * Damage floor after mitigation. `MIN_DAMAGE` is what actually guarantees `MAX_TURNS` is
 * rarely reached: without it, defence >= attack means literally nothing happens for sixty
 * turns and the player watches a stalemate.
 */
export const MIN_DAMAGE = 1;

/**
 * How much of a blow defence must swallow before the log calls it a BLOCK, as a fraction
 * of the incoming swing. Purely presentational — a BLOCK event carries the amount absorbed
 * and never changes the damage — but it is a tuning value, so it lives here.
 */
export const BLOCK_MITIGATION_RATIO = 0.5;

/**
 * Crit chance for encounters, in percentage points.
 *
 * Zero for now, and deliberately a named constant rather than an inline `0`: `Encounter`
 * in the contract carries no crit stat, so this is the simulator asserting that enemies
 * do not crit in v0.1.0 — a balance decision to be revisited, not an oversight.
 */
export const ENEMY_CRIT_PCT = 0;

/* -------------------------------------------------------------------------- *
 * Class identity
 * -------------------------------------------------------------------------- */

/**
 * Which earned stat each class converts into attack power.
 *
 * This is the load-bearing line of the whole class system: it is what makes the same
 * logged workout worth more to one hero than another, and it is why combat values are
 * derived rather than stored — a rebalance here re-derives every hero in the game at once.
 *
 * PALADIN maps to VIT on purpose: it is the only class whose attack stat is also its
 * survivability stat, so it scales slowly but never has a dump stat.
 */
export const CLASS_PRIMARY_STAT: Record<HeroClass, StatKey> = {
  WARRIOR: 'str',
  ROGUE: 'agi',
  MAGE: 'foc',
  PRIEST: 'spi',
  PALADIN: 'vit',
};
