/**
 * The `rewards` public surface — activity in, ledger rows out.
 *
 * Consumers (`backend`, and `mobile-app` for types) import from here rather than from
 * individual modules, so the internal file layout stays free to change without breaking
 * a versioned git dependency in two other repositories.
 */

// The engine version lives in its own zero-import leaf module, NOT here: `apply.ts` needs
// it, and this barrel re-exports `apply.ts`, so declaring it here would form a cycle that
// resolves under CommonJS but can initialise as `undefined` under Metro or ESM — stamping
// every ledger row with an undefined version in the consumer only. See `./version.ts`.
export { ENGINE_VERSION } from './version';

export * from './constants';
export * from './modality';
export * from './caps';
export * from './effort';
export * from './apply';
export * from './progression';

// Named rather than starred: `routing` re-exports the two tuning tables it owns the
// lookups for, and those already arrive via `./constants` above.
export { REWARD_KIND_STAT, STAT_REWARD_KIND, classBiasFor, statWeightsFor } from './routing';
export { createStartingLedger, STARTING_STAT_VALUE } from './genesis';
