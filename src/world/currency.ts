import { CURRENCY_FULL_EP, KEY_DROP_CHANCE, SIGIL_DROP_CHANCE } from './constants';

/**
 * What a training session yields towards the PVE world.
 *
 * ============================================================================
 * THIS FUNCTION IS THE COUPLING. THERE IS NO OTHER.
 * ============================================================================
 * Training is the only tap; PVE is the sink. A session can produce EP, stats,
 * XP, gold, a gear roll — and these two currencies, which buy ACCESS rather than
 * power. Nothing in the world pays back in the other direction.
 *
 * Modelled on `rollSessionDrop` deliberately, down to the shape of the taper: a
 * ten-minute walk and an hour under the bar must not be the same lottery ticket,
 * or the optimal strategy becomes many tiny logged sessions — which is gameable
 * and is the exact opposite of the behaviour this game exists to reward.
 *
 * SEEDED, like every other roll here, so a key can be re-derived from the row
 * that granted it forever.
 *
 * @param rng Floats in `[0, 1)`, owned and seeded by the caller.
 * @param ep  Effort points the session earned, AFTER caps. A capped session
 *            yields capped odds — the cap is the whole point of the cap.
 */
export function rollSessionCurrency(rng: () => number, ep: number): {
  keys: number;
  sigils: number;
} {
  /*
   * BOTH DRAWS HAPPEN, ALWAYS, AND BEFORE ANYTHING IS DECIDED — including for a
   * session that earned nothing. A draw that happened only on some branches
   * would make the stream position depend on the branch, and every later roll
   * from the same seed would shift. Same discipline as `rollSessionDrop`.
   */
  const keyRoll = rng();
  const sigilRoll = rng();

  if (!Number.isFinite(ep) || ep <= 0) return { keys: 0, sigils: 0 };

  const scale = Math.min(1, ep / CURRENCY_FULL_EP);

  return {
    // Integers, because these become ledger rows and the fold must stay
    // shuffle-invariant. A fractional key is not a thing a player can hold.
    keys: keyRoll < KEY_DROP_CHANCE * scale ? 1 : 0,
    sigils: sigilRoll < SIGIL_DROP_CHANCE * scale ? 1 : 0,
  };
}
