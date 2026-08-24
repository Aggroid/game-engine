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
 */
export const ENGINE_VERSION = '0.1.0';
