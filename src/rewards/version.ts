/**
 * The version stamped on every ledger row this package produces.
 *
 * WHY THIS IS ITS OWN ZERO-IMPORT LEAF MODULE, AND NOT A LINE IN `./index.ts`:
 * `apply.ts` needs this value, and the barrel re-exports `apply.ts`. Declaring it in the
 * barrel therefore creates `apply -> index -> apply`. That cycle happens to resolve under
 * CommonJS — TypeScript hoists exported function bindings above the requires — which is
 * exactly what makes it dangerous: it looks harmless in our own test run. Under Metro
 * (React Native) and under a future ESM build, cycle initialisation order differs, and
 * this binding can be read before it is initialised. Every `RewardEntry` would then be
 * stamped `undefined`, silently, IN THE CONSUMER ONLY — an unversioned, unexplainable,
 * un-rescorable row in an append-only store that nobody can ever clean up.
 *
 * A leaf module with no imports of its own cannot participate in a cycle, so the failure
 * mode is designed out rather than tested for. Nothing in `src/rewards` may import the
 * barrel; everything imports this.
 *
 * BUMP ON ANY CHANGE THAT ALTERS REWARD OUTPUT — a tuning constant, a modality mapping, a
 * routing weight, the level curve, a rounding step. NEVER REUSE A VERSION NUMBER: rows
 * from several engine versions coexist in one hero forever, and the only way to explain
 * or re-score an old row is to know precisely which maths produced it.
 *
 * HISTORY — what each version means, because a stamped row is only useful if the number can
 * be resolved back to the maths that produced it:
 *
 *   0.1.0  M0. Activity -> EP -> ledger rows. Intensity fidelity ladder, modality routing,
 *          class bias, daily soft cap and weekly hard cap, level curve, ledger fold.
 *
 *   0.2.0  Two new terms entered the EP formula, so the same activity can now score
 *          differently than it did under 0.1.0 for the same hero:
 *            - SET LOGGING. `SET_LOG_QUALITY_MAX` was reserved-but-unread in 0.1.0 and is now
 *              applied: a set-by-set log of a STRENGTH session earns up to (never including)
 *              a 1.25x multiplier on that session, with diminishing returns. Every other
 *              modality is untouched, and logging nothing still scores exactly as before.
 *            - GEAR. Active item-set bonuses may carry a `modalityConversionBonus`, which
 *              multiplies the conversion of one real training modality. A hero wearing
 *              nothing, or wearing no completed set, scores exactly as before.
 *          A ledger row stamped 0.1.0 was therefore scored WITHOUT either term; re-scoring one
 *          under 0.2.0 requires knowing what the hero was wearing and what sets they logged at
 *          the time, which is why both are stored alongside the activity and not recomputed.
 *          Gear STAT bonuses are deliberately not part of this: they are a combat projection
 *          (see `applyGear`), never a reward multiplier, so they leave the ledger alone.
 *
 *   0.3.0  GEAR BECAME INSTANCED, and the rarity ladder was renamed. The EP formula itself
 *          is UNCHANGED — no ledger row scores differently under 0.3.0 than it did under
 *          0.2.0 — but three things that gear-derived rows depend on moved:
 *            - RARITY RENAME. `COMMON RARE EPIC LEGENDARY MYTHIC` became
 *              `POOR UNCOMMON RARE EPIC LEGENDARY`, a POSITIONAL remap onto the WoW ladder
 *              (gray, green, blue, purple, orange). Every tier kept its weight and its
 *              position; only the names changed. Note the trap this leaves for anyone
 *              reading old data: the string "RARE" means the SECOND tier before 0.3.0 and
 *              the THIRD tier after it. Rarity is not persisted, so there was nothing to
 *              migrate — but a stored value from an external export would be misread.
 *            - ROLLED INSTANCES. A drop is no longer a catalogue entry; it is a `RolledItem`
 *              with its own stat budget, quality in [0.75, 1.00] and seed. Two drops of the
 *              same template now differ, which is what makes an auction house able to
 *              discover a price. Tier budgets deliberately OVERLAP between UNCOMMON, RARE
 *              and EPIC so a good blue can beat a bad purple; POOR and LEGENDARY sit
 *              outside that overlap on purpose.
 *            - FULL SETS BECAME FIVE PIECES, not six, and the weapon slot left every set.
 *              A hero who had all six pieces of a set under 0.2.0 still holds both bonus
 *              tiers under 0.3.0, so no hero loses a bonus; the change only means the
 *              weapon they were wearing no longer counts toward it.
 */
export const ENGINE_VERSION = '0.4.0';
