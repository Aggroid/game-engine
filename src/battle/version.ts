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
export const SIM_VERSION = '0.4.0';

/*
 * ============================================================================
 * THREE VERSIONS, AND THEY MOVE FOR DIFFERENT REASONS. DO NOT KEEP THEM IN STEP.
 * ============================================================================
 *   SIM_VERSION        this file. The battle simulator's OUTPUT.
 *   ENGINE_VERSION     src/rewards/version.ts. The reward economy, stamped on
 *                      every ledger row. Must not move for a combat change, or
 *                      new rows would claim an economy change that never
 *                      happened.
 *   package.json       the ARTEFACT. What npm, a lockfile and a build cache
 *                      identify this package by.
 *
 * THE PACKAGE VERSION IS NOT DECORATION, which is what 0.5.0 proved. SIM_VERSION
 * went 0.1.0 -> 0.2.0 and the git tag went v0.4.0 -> v0.5.0, but package.json
 * stayed at 0.4.0 — so to every cache the artefact was unchanged. The consumer's
 * CI restored a cached `@ascend/game-engine@0.4.0`, never rebuilt `dist/` (which
 * is gitignored and produced by `prepare`), and shipped NEW route code against
 * an OLD engine. It failed in production as
 * `TypeError: simulateDuel is not a function`.
 *
 * So: any change that alters what this package EXPORTS or EMITS bumps
 * package.json too, and a tag is never moved once pushed.
 */

/*
 * HISTORY. Each entry is a simulator whose logs can only be re-derived by it.
 *
 *  0.1.0  The original turn loop. A duel was run through `simulate` by dressing
 *         the defender as an `Encounter`, which dropped their `critPct` and
 *         `regen` — so a defender could never crit and never healed, and AGI
 *         and SPI were worth nothing to the hero being attacked.
 *
 *  0.4.0  DAMAGE SCHOOLS AND RESISTANCE. A blow now belongs to one of six
 *         schools, and the defender's resistance to THAT school scales it after
 *         defence has been subtracted.
 *
 *         EVERY BLOW IN THE GAME CAN NOW LAND FOR A DIFFERENT NUMBER than it
 *         did under 0.3.0 — which is exactly what this version stamp is for. A
 *         log written before this is re-derivable only by 0.3.0's simulator, and
 *         re-running one under 0.4.0 would produce a fight that never happened.
 *
 *         The stream is UNTOUCHED: still two draws per blow, variance then crit,
 *         both unconditional. Resistance is arithmetic on a blow that has already
 *         been rolled, so this version moves for the damage it produces rather
 *         than for the order it draws in. A hero or encounter with no resistance
 *         takes byte-identical damage to 0.3.0 — which is every fight fought so
 *         far, since nothing had any until this version.
 *
 *         Both loops changed, through one shared `clampResist`: two copies of
 *         what a point of resistance is worth would be two balance surfaces, and
 *         a player would find frost resistance doing one thing against a creature
 *         and another against a hero.
 *
 *  0.2.0  `simulateDuel` (`duel.ts`): hero versus hero with both sides' full
 *         combat sheets. Both crit on their own AGI, both regenerate on their
 *         own SPI, both draw two RNG values per blow. `simulate` itself is
 *         UNCHANGED — but the version is shared, so PvE logs written before
 *         this carry 0.1.0 and are still re-derivable by 0.1.0's `simulate`,
 *         which is byte-identical to this one.
 */
