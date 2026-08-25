/**
 * Public surface of the daily quest module.
 *
 * Consumed by `backend` (which generates a day's trio from a per-day seed and folds activities
 * through it) and, types-only, by `mobile-app`. Nothing in `src/quests` may import this barrel —
 * see the module-graph test in `rewards/index.test.ts` for what that cycle costs.
 */
export * from './constants';
export * from './generate';
export * from './progress';
