/**
 * What winning a duel is worth.
 *
 * ============================================================================
 * THE SHAPE OF THE RULE, AND WHY IT IS THIS SHAPE.
 * ============================================================================
 * XP scales with the LEVEL GAP, and beating somebody far below you is worth
 * nothing at all. Three things follow from that, and all three are the point:
 *
 *   1. Punching UP pays. Beating a higher-level hero is the hardest thing a
 *      player can do, and it is now the best-paid.
 *   2. Punching DOWN tapers to zero rather than stopping at a wall. The level
 *      band that used to forbid the fight outright is gone, so the economy has
 *      to be what discourages farming, not a refusal.
 *   3. FIVE LEVELS BELOW IS WORTH NOTHING, exactly. Not "almost nothing" — the
 *      multiplier is designed so it reaches zero precisely there, which makes
 *      the rule statable in one sentence to a player.
 *
 * WHY AN ECONOMY RULE RATHER THAN A MATCHMAKING ONE: a refusal tells somebody
 * they may not play; a zero tells them it was not worth playing. The second is
 * information, and it leaves the fight available for the reasons that are not
 * about XP — a grudge, a test, helping a friend check their gear.
 */

/**
 * XP for beating somebody at your own level.
 *
 * Sized against a training session, deliberately: sessions in the field earn
 * roughly 20–60 XP, so an even duel is worth about one ordinary workout. A duel
 * that paid multiples of a session would make training the slow path to
 * levelling, which inverts what this game is for.
 */
export const DUEL_XP_BASE = 25;

/**
 * How much each level of gap moves the payout, as a fraction of the base.
 *
 * 0.2 is not an arbitrary knob — it is `1 / DUEL_XP_ZERO_BELOW`, which is what
 * makes the taper hit exactly zero at five levels down. Changing one without
 * the other breaks the sentence the rule is supposed to be explainable in.
 */
export const DUEL_XP_PER_LEVEL = 0.2;

/** At this many levels below you, a win is worth nothing. */
export const DUEL_XP_ZERO_BELOW = 5;

/**
 * Ceiling on the multiplier, for the giant-killing case.
 *
 * With no level band, a level-1 may challenge a level-50. They will almost
 * always lose — but "almost" is not "never", and an uncapped multiplier would
 * make that one lucky seed worth more than a month of training. Capped at 3x,
 * so the best possible duel pays about three sessions.
 */
export const DUEL_XP_MAX_MULTIPLIER = 3;

/**
 * XP awarded to the winner of a duel.
 *
 * PURE, and integer by construction: the ledger fold requires integers, since
 * folding fractional deltas gives order-dependent totals.
 *
 * @param winnerLevel The level of the hero who won.
 * @param loserLevel  The level of the hero who lost.
 * @returns XP to credit the winner. Zero when the loser was far enough below.
 */
export function duelXp(winnerLevel: number, loserLevel: number): number {
  /*
   * Guarded rather than trusted. A level arrives here from a ledger fold, and a
   * fold of a corrupt or empty ledger can produce something that is not a
   * positive integer. Paying `NaN` XP would write a `NaN` ledger row, and a
   * single one of those makes every later fold `NaN` — the hero's whole history
   * would read as broken, permanently.
   */
  if (!Number.isFinite(winnerLevel) || !Number.isFinite(loserLevel)) return 0;

  const gap = Math.trunc(loserLevel) - Math.trunc(winnerLevel);

  // Exactly zero at five below, and at anything further down.
  if (gap <= -DUEL_XP_ZERO_BELOW) return 0;

  const multiplier = Math.min(
    DUEL_XP_MAX_MULTIPLIER,
    1 + gap * DUEL_XP_PER_LEVEL,
  );

  /*
   * `Math.round`, then a floor of 1 for any gap the taper did not zero. Without
   * the floor, four levels below rounds 25 * 0.2 = 5 correctly, but a smaller
   * base would round to 0 and silently create a second, invisible cutoff above
   * the stated one.
   */
  return Math.max(1, Math.round(DUEL_XP_BASE * multiplier));
}
