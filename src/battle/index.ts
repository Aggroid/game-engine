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
export * from './constants';
