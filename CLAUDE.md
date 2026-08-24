# CLAUDE.md — game-engine

## What this repo is
The economy and battle simulator for a fitness RPG (working name ASCEND), where real
training logged by any watch or health device feeds an RPG hero.

This package is PURE: it converts data structures into other data structures. Nothing else.
Consumed by `backend` and `mobile-app` as a versioned git dependency.

The dependency direction is one-way and must stay that way:
    backend  ──imports──▶  game-engine
    mobile-app ─imports─▶  game-engine (types only)
This package NEVER calls the backend, a database, or the network.

## Absolute invariants — do not break these
1. Runtime dependencies are allowlisted to `zod` ONLY. `npm run check:pure` fails otherwise.
2. ZERO I/O. No fs, no network, no process.env.
3. NO `Date.now()`, NO `new Date()`, NO `Math.random()`. Time and seeds are arguments.
   Determinism is the whole point: a ledger must replay identically, forever.
4. EP, XP and gold are INTEGERS. Never floats. Folding float deltas gives
   order-dependent totals, which silently corrupts replay.
5. Every reward-producing function is a pure function of its inputs. Never mutate a Hero.
6. `ENGINE_VERSION` and `SIM_VERSION` are exported constants. Bump on any output change;
   never reuse a version number.
7. Tuning values live ONLY in `src/rewards/constants.ts` and `src/battle/constants.ts`.
   No magic numbers scattered through logic.

## Layout
    src/contracts/   Types + zod schemas. The shared contract with backend and mobile-app.
    src/rewards/     Activity -> EffortPoints -> RewardEntry[]. Level curve. Ledger fold. Caps.
    src/battle/      Hero + encounter + seed -> BattleLog. Own in-package PRNG.

## Domain model
Six earned stats: STR AGI END VIT FOC SPI.
Combat values are DERIVED, never stored: HP from VIT+level, Attack from the class primary
stat, Defence from VIT, Crit from AGI, Regen from SPI, Stamina from END.
Five classes: WARRIOR MAGE ROGUE PRIEST PALADIN. Class decides which real training
modality converts efficiently; each has a deliberate neglect penalty.

    EP = durationMinutes * intensity * modalityWeight * modifiers   (rounded to an integer)

Intensity has three fidelity tiers, in order of preference:
    1. HR_ZONES     heart-rate based
    2. MET_TABLE    published MET value for the activity type
    3. CALORIES     active kcal per minute
    4. FLOOR        none of the above available — never throw, return a floor value
ALWAYS record which tier was used. Real HealthKit data is patchy; the engine must cope.

## Testing
Jest. Snapshot tests per modality x per fidelity tier. Property tests for monotonicity,
caps, and ledger-fold order-invariance. Coverage thresholds enforced in CI.
The ledger shuffle-invariance test is the highest-value test in the repo: if folding is
order-dependent, every replay after a rebalance silently produces a different hero.

## Commands
    npm run verify       # check:pure + typecheck + test + build — run this before claiming done
    npm test
    npm run check:pure
    npm run demo         # runs a fake week of training through the engine

## Never
- Never add a dependency to make something convenient.
- Never let a caller supply a precomputed EP value; always recompute.
- Never mutate inputs; return new values.
- Never put a tuning number inline; it belongs in constants.ts.
