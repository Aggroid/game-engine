/**
 * @ascend/game-engine — the rules of the game.
 *
 * PURE. No I/O, no clock, no ambient randomness. This package converts data
 * structures into other data structures and nothing else.
 *
 * Dependency direction is one-way and must stay that way:
 *
 *     backend    ──imports──▶  game-engine
 *     mobile-app ──imports──▶  game-engine   (types only, via the /types subpath)
 *
 * This package NEVER calls the backend, a database or the network.
 *
 * Two independent version stamps, because they move for different reasons:
 *   ENGINE_VERSION — the reward economy. Bump when reward output could change.
 *   SIM_VERSION    — the battle simulator. Bump when a single event could move.
 * Both are written onto the rows they produce, which is what makes a rebalance a
 * REPLAY rather than a migration.
 *
 * `gear`, `quests` and `streaks` all sit UNDER those two stamps rather than carrying their own:
 * gear and set logging feed the EP formula (so they are `ENGINE_VERSION`), and quests and streaks
 * produce no ledger rows at all — they hand the caller a target and a multiplier, and the caller
 * writes the row.
 */

export * from './contracts';
export * from './rewards';
export * from './battle';
export * from './gear';
export * from './quests';
export * from './streaks';
