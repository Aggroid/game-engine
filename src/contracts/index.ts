/**
 * The shared contract between game-engine, backend and mobile-app.
 *
 * Import from here (`@ascend/game-engine/contracts`) when you want the types AND the zod
 * validators — i.e. from the backend, at its untrusted boundary.
 *
 * Import from `@ascend/game-engine/types` instead when you only want the types, which is
 * what mobile does: that path has zero imports, so zod never reaches the app bundle.
 * Re-exporting schemas here does not change that — `./types` remains independently
 * importable and dependency-free.
 */
export * from './types';
export * from './schemas';
