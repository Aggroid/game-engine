/**
 * The engine's own seeded pseudo-random number generator.
 *
 * WHY THIS EXISTS IN-PACKAGE AND WHY `Math.random()` IS BANNED:
 * a `BattleLog` is not just playback data, it is the audit trail for a disputed fight.
 * Re-running `simulate(hero, encounter, seed)` a year later must reproduce a stored log
 * event for event, which is only possible if the random stream is a pure function of the
 * seed. `Math.random()` is unseeded and engine-specific, so a single call anywhere in the
 * simulator would make every historical battle unreplayable — killing both dispute
 * resolution and the "rewatch any fight" feature. Nothing here reads ambient state.
 *
 * The algorithm is mulberry32: 32-bit state, one multiply-xor round, excellent
 * distribution for a game simulator and — the part that actually matters — identical
 * output on every JS engine, because it only uses `Math.imul` and unsigned 32-bit shifts,
 * which are exactly specified. Floating point never enters the state, so there is no
 * platform drift.
 *
 * THIS ALGORITHM IS VERSIONED BEHAVIOUR. Changing it changes the output of every battle
 * ever fought, so any change here MUST bump `SIM_VERSION` — old logs can then still be
 * re-derived by pinning the simulator version that wrote them, and no version is reused.
 */

/** 2^32 — the divisor that maps the 32-bit state onto the unit interval. */
const UINT32_RANGE = 4294967296;

/**
 * Builds a deterministic random source from an integer seed.
 *
 * @param seed Any number; coerced to a uint32, so `-1`, `1.5` and `2 ** 32 + 1` are all
 *             valid and stable inputs rather than errors — a caller should never be able
 *             to crash a battle by handing over an unusual seed.
 * @returns A generator of floats in `[0, 1)`. The same seed always yields the same
 *          sequence; the generator is stateful, so one battle uses exactly one of them.
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;

  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}
