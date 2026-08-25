/**
 * Daily quest generation.
 *
 * THREE RULES, AND THEY ARE PRODUCT RULES BEFORE THEY ARE CODE:
 *
 * 1. A BAD DAY MUST STILL YIELD A WIN. One of the three is always clearable by a thirty-minute
 *    walk — either `ANY_ACTIVITY` or a `REACH_EP` whose target is DERIVED from what such a walk
 *    is actually worth (see `EASY_EP_TARGET`). Dailies fail in exactly one way in this genre:
 *    they ask for a session the player cannot fit in, all three expire, and the app becomes a
 *    daily report on their failures. That is churn, and it is entirely self-inflicted.
 *
 * 2. NEVER ASK FOR SOMETHING THE PLAYER HAS NO WAY TO DO. A `SPECIFIC_MODALITY` quest is only
 *    ever generated for a modality that appears in `recentModalities`. Asking someone with no
 *    pool history to swim is not a nudge, it is a locked door — and it is the fastest way to
 *    teach a player that the daily quests are not for them.
 *
 * 3. NUDGE TOWARDS WHAT THE CLASS NEGLECTS. Draw weights lean towards the modalities this class
 *    converts BADLY (`CLASS_MODALITY_BIAS` below neutral), which is the cross-training nudge:
 *    the WARRIOR who never stretches gets asked to, the PRIEST who never lifts gets asked to.
 *    A lean, not a rule — the player's own history still decides what is on the menu.
 *
 * THE RNG IS AN ARGUMENT. Same rule as drops and battles: the caller owns the seed, so a day's
 * quests can be re-derived from (hero, date) forever, and two devices looking at the same day
 * cannot disagree about what was asked of the player.
 */
import type { DailyQuest, HeroClass, Modality, QuestKind } from '../contracts/types';
import { MODALITIES } from '../contracts/types';
import { UNKNOWN_MODALITY } from '../rewards/modality';
import { classBiasFor } from '../rewards/routing';

import {
  DAILY_QUEST_COUNT,
  EASY_ANY_ACTIVITY_SHARE,
  EASY_EP_TARGET,
  FAMILIAR_MODALITY_WEIGHT,
  MODALITY_LABEL,
  NEGLECTED_MODALITY_WEIGHT,
  NEGLECT_BIAS_THRESHOLD,
  QUEST_DESCRIPTION_TEMPLATE,
  QUEST_REWARD_EP,
  RECOVER_MODALITIES,
  RECOVER_WEIGHT,
  SESSION_TARGET,
  STRETCH_EP_TARGETS,
  STRETCH_EP_WEIGHT,
} from './constants';

/** A quest before it is given an id, a description and a slot in the trio. */
interface QuestSpec {
  kind: QuestKind;
  target: number;
  modality?: Modality;
}

/** A spec together with its relative likelihood of being drawn. */
interface WeightedSpec {
  weight: number;
  spec: QuestSpec;
}

/**
 * The guaranteed win — rule 1.
 *
 * Both branches are the same promise phrased two ways, so which one appears is a coin flip:
 * a daily screen that always opens with the identical line reads like a template, and a
 * template is something a player learns to stop reading.
 */
function easySpec(rng: () => number): QuestSpec {
  return rng() < EASY_ANY_ACTIVITY_SHARE
    ? { kind: 'ANY_ACTIVITY', target: SESSION_TARGET }
    : { kind: 'REACH_EP', target: EASY_EP_TARGET };
}

/**
 * Is this class BAD at this modality? Its bias below neutral is the engine's own record of
 * what the class avoids, which makes it exactly the right thing to lean the draw towards.
 */
function isNeglected(heroClass: HeroClass, modality: Modality): boolean {
  return classBiasFor(heroClass, modality) < NEGLECT_BIAS_THRESHOLD;
}

/**
 * The candidates for the two non-guaranteed slots.
 *
 * `SPECIFIC_MODALITY` candidates are filtered by iterating the canonical `MODALITIES` order and
 * keeping the ones the player has actually done. Iterating the taxonomy rather than the history
 * does three jobs at once: it de-duplicates a history like `[walk, walk, swim]`, it makes the
 * output independent of the ORDER the caller happened to pass (a deterministic function of a
 * history is not much use if reversing that history changes the answer), and it drops anything
 * not in the taxonomy.
 *
 * TWO EXCLUSIONS, both deliberate:
 *  - `other`, because "log an other session today" is not a sentence, and because the modality
 *    means "we could not tell what this was" — an unusable target by definition.
 *  - `recovery` and `mobility`, because the `RECOVER` candidate already covers both. Two quests
 *    that the same yoga session clears looks like a bug to a player. The nudge is not lost: a
 *    class that neglects rest gets a heavier `RECOVER` weight instead.
 *
 * `RECOVER` and the stretch EP targets are ALWAYS candidates, which is what guarantees the pool
 * can fill the trio even for a brand-new hero with no history at all.
 */
function candidatePool(
  heroClass: HeroClass,
  recentModalities: readonly Modality[],
): WeightedSpec[] {
  const trained = new Set(recentModalities);

  const modalityCandidates = MODALITIES.filter(
    (modality) =>
      modality !== UNKNOWN_MODALITY &&
      !RECOVER_MODALITIES.includes(modality) &&
      trained.has(modality),
  ).map(
    (modality): WeightedSpec => ({
      weight: isNeglected(heroClass, modality)
        ? NEGLECTED_MODALITY_WEIGHT
        : FAMILIAR_MODALITY_WEIGHT,
      spec: { kind: 'SPECIFIC_MODALITY', target: SESSION_TARGET, modality },
    }),
  );

  const recoverWeight = RECOVER_MODALITIES.some((modality) => isNeglected(heroClass, modality))
    ? NEGLECTED_MODALITY_WEIGHT
    : RECOVER_WEIGHT;

  return [
    ...modalityCandidates,
    { weight: recoverWeight, spec: { kind: 'RECOVER', target: SESSION_TARGET } },
    ...STRETCH_EP_TARGETS.map(
      (target): WeightedSpec => ({
        weight: STRETCH_EP_WEIGHT,
        spec: { kind: 'REACH_EP', target },
      }),
    ),
  ];
}

/**
 * Draws one candidate index, consuming exactly one number from `rng`.
 *
 * The trailing return is the floating-point tail — reached only by an `rng` that returns
 * exactly `1`, which the contract forbids but a caller-supplied function may still do.
 */
function drawIndex(rng: () => number, candidates: readonly WeightedSpec[]): number {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const target = rng() * total;
  let cumulative = 0;

  for (const [index, candidate] of candidates.entries()) {
    cumulative += candidate.weight;
    if (target < cumulative) {
      return index;
    }
  }

  return candidates.length - 1;
}

/** Fills a template from `constants.ts`. Placeholders absent for a kind are simply not there. */
function describe(spec: QuestSpec): string {
  return QUEST_DESCRIPTION_TEMPLATE[spec.kind]
    .replace('{target}', String(spec.target))
    .replace('{modality}', spec.modality === undefined ? '' : MODALITY_LABEL[spec.modality]);
}

/**
 * Gives a spec its slot, id, copy and payout.
 *
 * Ids are unique WITHIN THE TRIO and carry no date: the engine has no clock, so namespacing a
 * quest by day is the caller's job — the same division of labour as `EngineContext.localDate`.
 */
function toQuest(spec: QuestSpec, index: number): DailyQuest {
  const slot = index + 1;
  const suffix = spec.modality === undefined ? '' : `-${spec.modality}`;

  return {
    id: `daily-${slot}-${spec.kind.toLowerCase()}${suffix}`,
    kind: spec.kind,
    description: describe(spec),
    target: spec.target,
    progress: 0,
    complete: false,
    rewardEp: QUEST_REWARD_EP[spec.kind],
    ...(spec.modality !== undefined ? { modality: spec.modality } : {}),
  };
}

/**
 * Generates a hero's dailies for one day.
 *
 * Returns EXACTLY `DAILY_QUEST_COUNT` quests, always, for every class and every history
 * including an empty one — the pool is built so that it cannot run dry (see `candidatePool`,
 * and the structural test that pins it).
 *
 * Deterministic: the same seeded `rng`, class and history always produce the same trio, so a
 * day's quests can be re-derived rather than stored, and never drift between devices.
 *
 * @param rng              A generator of floats in `[0, 1)`, owned and seeded by the CALLER.
 * @param heroClass        Decides which modalities count as neglected, and so which are nudged.
 * @param recentModalities What this player has actually been doing lately. Order is irrelevant;
 *                         an empty history is normal for a new hero and never an error.
 * @returns Three fresh quests at zero progress. Never mutates its inputs.
 */
export function generateDailies(
  rng: () => number,
  heroClass: HeroClass,
  recentModalities: readonly Modality[],
): DailyQuest[] {
  // Rule 1 first, so the guaranteed win is never crowded out by the draw.
  const specs: QuestSpec[] = [easySpec(rng)];
  const pool = candidatePool(heroClass, recentModalities);

  while (specs.length < DAILY_QUEST_COUNT) {
    const index = drawIndex(rng, pool);
    specs.push((pool[index] as WeightedSpec).spec);
    // Drawn without replacement: three variations of "earn 80 EP" is not a set of dailies.
    pool.splice(index, 1);
  }

  return specs.map(toQuest);
}
