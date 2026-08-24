/**
 * Effort -> ledger rows.
 *
 * This is where a scored workout becomes the append-only record that IS the hero. Hero
 * totals are a fold over these rows and never the source of truth, so every row must be
 * self-describing and stable forever:
 *
 *  - EVERY ROW IS STAMPED WITH `ENGINE_VERSION`, per row rather than per hero, because
 *    rows written by different engine versions coexist in one ledger for the lifetime of
 *    the account. After a rebalance, "which rows did the old maths produce" has to be an
 *    answerable question — for explaining, for re-scoring, and for not doing either by
 *    accident.
 *  - NOTHING IS MUTATED. `hero` is read for its class and nothing else. A reward function
 *    that mutated its hero would make the ledger a lie and replay impossible.
 *  - ZERO-AMOUNT ROWS ARE NOT WRITTEN. A row that grants nothing is noise in an
 *    append-only store and clutter in a rewards screen.
 *
 * `ITEM_DROP` is deliberately NOT produced here. Drops need randomness, randomness needs
 * a seed, and seeds belong to the battle simulator; a drop rolled in the rewards path
 * would be an unreplayable row in an otherwise replayable ledger.
 */
import type { EffortResult, Hero, RewardEntry } from '../contracts/types';
import { STAT_KEYS } from '../contracts/types';

import { GOLD_PER_EP, STAT_POINTS_PER_EP, XP_PER_EP } from './constants';
import { STAT_REWARD_KIND, classBiasFor, statWeightsFor } from './routing';
import { ENGINE_VERSION } from './version';

/** Builds one stamped ledger row. Every row in the package is created through here. */
function entry(kind: RewardEntry['kind'], amount: number): RewardEntry {
  return { kind, amount, engineVersion: ENGINE_VERSION };
}

/**
 * Converts a scored activity into the ledger rows it grants for THIS hero.
 *
 * The class bias applies to all three outputs — XP, gold and stats — rather than only to
 * stats. That is the point of classes: a WARRIOR who lifts gets more out of lifting in
 * every sense, and a WARRIOR who only stretches gets less, which is the "deliberate
 * neglect penalty" the design calls for. Biasing only the stat split would leave every
 * class progressing at an identical rate and reduce class choice to cosmetics.
 *
 * Stat amounts are rounded independently per stat, so a small session can round some
 * stats to zero — those rows are dropped. This is intended: stats are the slow build, and
 * a genuinely tiny session moving every stat by one point would make the six numbers
 * meaningless within a month.
 *
 * Rows come out in a stable order — XP, GOLD, then stats in canonical `STAT_KEYS` order —
 * because a deterministic engine that returned rows in a varying order would produce
 * ledgers that are equal as multisets but differ byte for byte, defeating snapshot tests
 * and any content-addressed storage the backend might later use.
 *
 * @param hero   Read-only. Only `heroClass` is consulted; NEVER mutated.
 * @param effort The scored activity, from `computeEffortPoints`.
 * @returns Zero or more stamped ledger rows. Empty when the effort earned nothing.
 */
export function applyRewards(hero: Hero, effort: EffortResult): RewardEntry[] {
  const bias = classBiasFor(hero.heroClass, effort.modality);
  const entries: RewardEntry[] = [];

  const xp = Math.round(effort.ep * XP_PER_EP * bias);
  if (xp !== 0) {
    entries.push(entry('XP', xp));
  }

  const gold = Math.round(effort.ep * GOLD_PER_EP * bias);
  if (gold !== 0) {
    entries.push(entry('GOLD', gold));
  }

  const statPool = effort.ep * STAT_POINTS_PER_EP * bias;
  const weights = statWeightsFor(effort.modality);

  for (const key of STAT_KEYS) {
    const share = weights[key];
    if (share === undefined) {
      continue;
    }

    const amount = Math.round(statPool * share);
    if (amount !== 0) {
      entries.push(entry(STAT_REWARD_KIND[key], amount));
    }
  }

  return entries;
}
