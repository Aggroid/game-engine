/**
 * Where effort goes: which STATS a modality builds, and how efficiently a CLASS converts
 * that modality.
 *
 * Both questions are answered by lookup tables, never by branching logic. That is a
 * deliberate architectural choice, not a style preference:
 *
 *  - A table can be reviewed by a game designer, diffed in a pull request, exported to
 *    the balance spreadsheet and re-imported. A chain of `if (heroClass === 'WARRIOR')`
 *    can only be reviewed by an engineer, and only by reading all of it.
 *  - Adding a modality or a class becomes a row, not a code change, so the compiler —
 *    via `Record<Modality, ...>` and `Record<HeroClass, ...>` — tells us about every
 *    missing cell at build time instead of shipping a silent zero.
 *
 * The tables themselves are DECLARED IN `./constants.ts`, because the repo invariant is
 * that every tuning value has exactly one home and these are the highest-leverage tuning
 * values in the package. They are re-exported here under the same names so callers can
 * import them from the module that owns the routing behaviour.
 */
import type { HeroClass, Modality, RewardKind, StatKey } from '../contracts/types';
import { STAT_KEYS } from '../contracts/types';

import { CLASS_BIAS_NEUTRAL, CLASS_MODALITY_BIAS, MODALITY_STAT_WEIGHTS } from './constants';

export { CLASS_MODALITY_BIAS, MODALITY_STAT_WEIGHTS };

/**
 * `StatKey` -> the `RewardKind` that grants it, derived from `STAT_KEYS`.
 *
 * Generated rather than typed out so a seventh stat cannot be added with its reward kind
 * quietly missing — the contract already makes `STAT_${Uppercase<StatKey>}` a compile-time
 * requirement, and this keeps the runtime side honest to the same rule.
 */
export const STAT_REWARD_KIND: Readonly<Record<StatKey, RewardKind>> = Object.fromEntries(
  STAT_KEYS.map((key): [StatKey, RewardKind] => [key, `STAT_${key.toUpperCase() as Uppercase<StatKey>}`]),
) as Record<StatKey, RewardKind>;

/**
 * The inverse: `RewardKind` -> the stat it credits, or absent for `XP`, `GOLD` and
 * `ITEM_DROP`. Partial on purpose — the fold uses the absence to mean "not a stat row".
 */
export const REWARD_KIND_STAT: Readonly<Partial<Record<RewardKind, StatKey>>> = Object.fromEntries(
  STAT_KEYS.map((key): [RewardKind, StatKey] => [STAT_REWARD_KIND[key], key]),
) as Partial<Record<RewardKind, StatKey>>;

/**
 * The stat split for a modality: which stats it builds and in what proportion.
 *
 * Total by construction — every modality has a row — so this never returns `undefined`
 * and no caller needs a fallback that would silently pay nothing.
 */
export function statWeightsFor(modality: Modality): Readonly<Partial<Record<StatKey, number>>> {
  return MODALITY_STAT_WEIGHTS[modality];
}

/**
 * How efficiently a class converts a modality. Neutral (1.0) when the class has no
 * opinion, which is the common case — the tables list only affinities and penalties.
 *
 * This single number is what makes the same workout worth different amounts to different
 * heroes, which is the core mechanic: class is a training identity, and every specialism
 * is paid for with a deliberate neglect penalty elsewhere.
 */
export function classBiasFor(heroClass: HeroClass, modality: Modality): number {
  return CLASS_MODALITY_BIAS[heroClass][modality] ?? CLASS_BIAS_NEUTRAL;
}
