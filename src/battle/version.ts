/**
 * The version of the SIMULATOR'S OUTPUT — the turn loop, the PRNG algorithm and every
 * tuning value in `constants.ts` taken together.
 *
 * Stamped onto every `BattleLog`. BUMP IT ON ANY CHANGE THAT COULD MOVE A SINGLE EVENT,
 * and never reuse a number: a stored log is only re-derivable by the exact simulator that
 * wrote it, so the version is what makes "re-run this disputed battle" a well-defined
 * operation years later. Changing a constant, reordering an RNG draw or swapping the PRNG
 * are all output changes. Tracked separately from `ENGINE_VERSION` (the reward economy),
 * because the two move for entirely different reasons.
 *
 * This lives in its own zero-import module ON PURPOSE. It was previously declared in the
 * barrel, which made `simulate.ts -> index.ts -> simulate.ts` a cycle. That resolves under
 * CommonJS, but this package is consumed by React Native through Metro and may later be
 * built as ESM, where cycle resolution order differs and `SIM_VERSION` could initialise as
 * `undefined`. A dedicated leaf module removes the failure mode instead of depending on it.
 */
export const SIM_VERSION = '0.2.0';

/*
 * HISTORY. Each entry is a simulator whose logs can only be re-derived by it.
 *
 *  0.1.0  The original turn loop. A duel was run through `simulate` by dressing
 *         the defender as an `Encounter`, which dropped their `critPct` and
 *         `regen` — so a defender could never crit and never healed, and AGI
 *         and SPI were worth nothing to the hero being attacked.
 *
 *  0.2.0  `simulateDuel` (`duel.ts`): hero versus hero with both sides' full
 *         combat sheets. Both crit on their own AGI, both regenerate on their
 *         own SPI, both draw two RNG values per blow. `simulate` itself is
 *         UNCHANGED — but the version is shared, so PvE logs written before
 *         this carry 0.1.0 and are still re-derivable by 0.1.0's `simulate`,
 *         which is byte-identical to this one.
 */
