/**
 * Public surface of the gear module — catalogue, sets, equipping and drops.
 *
 * Consumed by `backend` (which owns inventories and rolls drops against a stored seed) and,
 * types-only, by `mobile-app` (which renders a loadout). Nothing in `src/gear` may import
 * this barrel: the module-graph test in `rewards/index.test.ts` explains what that cycle
 * does to a versioned dependency under Metro.
 */
export * from './constants';
export * from './catalogue';
export * from './setBonuses';
export * from './equip';
export * from './drops';
