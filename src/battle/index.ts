/**
 * Public surface of the battle simulator.
 *
 * Consumed by `backend` (which simulates and stores logs) and, types-only, by
 * `mobile-app` (which renders them).
 */

export { SIM_VERSION } from './version';

export { createRng } from './prng';
export { deriveCombat } from './derive';
export { simulate } from './simulate';
export { simulateDuel } from './duel';
export {
  duelXp,
  DUEL_XP_BASE,
  DUEL_XP_PER_LEVEL,
  DUEL_XP_ZERO_BELOW,
  DUEL_XP_MAX_MULTIPLIER,
  duelGold,
  DUEL_GOLD_PER_XP,
} from './duelReward';
export * from './constants';
