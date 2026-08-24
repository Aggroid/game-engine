import { STAT_KEYS, type RewardEntry } from '../contracts/types';
import { STAT_REWARD_KIND } from './routing';
import { ENGINE_VERSION } from './version';

/**
 * The stat value every hero starts with, on each of the six stats.
 * Mirrors the `@default(5)` columns in the backend's Prisma schema — if one moves,
 * both move.
 */
export const STARTING_STAT_VALUE = 5;

/**
 * The opening rows of a hero's ledger.
 *
 * WHY THIS EXISTS. The architecture says a hero IS a fold of its ledger — that is what
 * makes a rebalance a replay instead of a migration. But `foldLedger` folds from zero,
 * so without these rows a brand-new hero's starting stats live nowhere in the event log,
 * and every caller has to remember to add them back by hand. That convention would drift
 * the moment a second consumer appeared, and the drift would be invisible: stats would
 * simply be wrong, with no error anywhere.
 *
 * Emitting the starting stats AS LEDGER ROWS makes the invariant literally true:
 *
 *     hero === foldLedger([...createStartingLedger(), ...everythingSinceThen])
 *
 * Write these once, at hero creation, in the same transaction as the hero row.
 */
export function createStartingLedger(): RewardEntry[] {
  return STAT_KEYS.map((key) => ({
    kind: STAT_REWARD_KIND[key],
    amount: STARTING_STAT_VALUE,
    engineVersion: ENGINE_VERSION,
  }));
}
