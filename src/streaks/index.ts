/**
 * Public surface of the streak module.
 *
 * Consumed by `backend` (which stores `StreakState` per hero and advances it once per qualifying
 * day) and, types-only, by `mobile-app`. Nothing in `src/streaks` may import this barrel — see
 * the module-graph test in `rewards/index.test.ts` for what that cycle costs under Metro.
 */
export * from './constants';
export * from './dates';
export * from './advance';
