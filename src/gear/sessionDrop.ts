import type { Item } from '../contracts/types';
import {
  SESSION_DROP_CHANCE,
  SESSION_DROP_FULL_EP,
  SESSION_RARITY_WEIGHTS,
} from './constants';
import { rollDrop } from './drops';

/**
 * Whether a training session drops gear, and what.
 *
 * ============================================================================
 * TRAINING IS THE POINT OF THE GAME, SO IT HAD TO BE ABLE TO DROP SOMETHING.
 * ============================================================================
 * Gear came only from fighting, which put the most interesting reward in the
 * game behind the half of it that is not about training. A session that earns
 * XP, gold and stats but can never produce an item makes the fitness loop the
 * poor relation of the combat loop.
 *
 * THE CHANCE SCALES WITH EFFORT, in proportion, up to `SESSION_DROP_FULL_EP`.
 * A ten-minute walk and an hour under the bar cannot be the same lottery
 * ticket, or the optimal strategy becomes many tiny logged sessions — which is
 * both gameable and the opposite of the behaviour this game exists to reward.
 *
 * SEEDED, like every other roll here. `rng` is the caller's, derived from
 * something stored, so a drop can be re-derived from the row that granted it
 * forever. Never `Math.random`.
 *
 * @param rng       Floats in `[0, 1)`, owned and seeded by the caller.
 * @param ep        Effort points the session earned, AFTER caps.
 * @param heroLevel Nothing gated above it can be returned.
 */
export function rollSessionDrop(
  rng: () => number,
  ep: number,
  heroLevel: number,
): Item | null {
  if (!Number.isFinite(ep) || ep <= 0) return null;

  /*
   * The effort roll is drawn UNCONDITIONALLY, before the chance is even known
   * to be non-zero. Same discipline as the battle simulator: a draw that
   * happens only on some branches makes the stream position depend on the
   * branch, and every later roll from the same seed shifts.
   */
  const roll = rng();

  const scale = Math.min(1, ep / SESSION_DROP_FULL_EP);
  const chance = SESSION_DROP_CHANCE * scale;
  if (roll >= chance) return null;

  return rollDrop(rng, heroLevel, SESSION_RARITY_WEIGHTS);
}
