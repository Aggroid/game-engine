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
export const SIM_VERSION = '0.1.0';
