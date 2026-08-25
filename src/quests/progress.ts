/**
 * Advancing dailies against a scored activity.
 *
 * ONE DECISION SHAPES THIS WHOLE FILE: quest progress is measured against `rawEp`, the effort
 * BEFORE caps, not against the `ep` actually paid.
 *
 * The caps exist for duty of care — past a sane daily load the economy stops paying, so that a
 * progress bar can never talk somebody into a stress fracture (see `caps.ts`). But a player who
 * has hit the weekly ceiling and trains anyway has unambiguously done the work, and telling them
 * "that session did not count towards your dailies" would be the app punishing them for the
 * safety limit it imposed. Worse, it would break the streak of exactly the most committed users.
 * So: the CAPS decide what a session PAYS, the dailies acknowledge that it HAPPENED.
 *
 * Everything here is pure and returns NEW objects. A quest list arrives from a database row and
 * goes back to one; mutating in place would make "what did the player see this morning"
 * unanswerable, and the fold-a-ledger discipline in `progression.ts` exists for the same reason.
 */
import type { DailyQuest, EffortResult, QuestKind } from '../contracts/types';

import { RECOVER_MODALITIES } from './constants';

/**
 * Did this activity happen at all?
 *
 * `rawEp > 0` rather than `ep > 0` (see the file header) and rather than a duration check: a
 * zero-length or zero-intensity record is a sync artefact, not a session, and it must not tick
 * a quest. The intensity FLOOR guarantees any real logged minute clears this.
 */
function counts(effort: EffortResult): boolean {
  return effort.rawEp > 0;
}

/**
 * How much progress each kind of quest earns from one activity — a table, not a switch.
 *
 * The table shape means a new `QuestKind` cannot be added to the contract without the compiler
 * demanding its progress rule here, which is the whole reason `QUEST_KINDS` is a `Record` key
 * and not a string union used loosely.
 */
const PROGRESS_BY_KIND: Readonly<
  Record<QuestKind, (quest: DailyQuest, effort: EffortResult) => number>
> = {
  /** Any real session. The point of this quest is that it cannot be failed by a bad choice. */
  ANY_ACTIVITY: (_quest, effort) => (counts(effort) ? 1 : 0),

  /** Effort, truncated to an integer: quest targets are EP and EP is integral by invariant. */
  REACH_EP: (_quest, effort) => Math.max(0, Math.trunc(effort.rawEp)),

  /** Only the asked-for modality. `modality` is set for this kind by construction. */
  SPECIFIC_MODALITY: (quest, effort) =>
    counts(effort) && effort.modality === quest.modality ? 1 : 0,

  /** Either of the two recovery modalities — see `RECOVER_MODALITIES` for why it is both. */
  RECOVER: (_quest, effort) =>
    counts(effort) && RECOVER_MODALITIES.includes(effort.modality) ? 1 : 0,
};

/**
 * Applies one scored activity to a day's quests.
 *
 * Progress is CLAMPED AT `target`, so a completed quest reads `3 / 3` rather than `7 / 3` and a
 * client can render `progress / target` directly. Already-complete quests are returned as
 * copies and never re-evaluated, which makes this idempotent in the way that matters: replaying
 * a day's activities through it cannot push a quest past done or double its payout.
 *
 * Completion is derived (`progress >= target`) rather than tracked, so it cannot disagree with
 * the number the player is looking at.
 *
 * @param quests The day's quests, in the order they were generated. Never mutated.
 * @param effort One scored activity, from `computeEffortPoints`.
 * @returns A new array of new quest objects, in the same order.
 */
export function applyQuestProgress(
  quests: readonly DailyQuest[],
  effort: EffortResult,
): DailyQuest[] {
  return quests.map((quest): DailyQuest => {
    if (quest.complete) {
      return { ...quest };
    }

    const earned = PROGRESS_BY_KIND[quest.kind](quest, effort);
    const progress = Math.min(quest.target, quest.progress + earned);

    return { ...quest, progress, complete: progress >= quest.target };
  });
}
