/**
 * ASCEND daily quests — THE TUNING SURFACE.
 *
 * PROVISIONAL, like every other tuning file here. Same invariant: a rebalance of the daily
 * loop is a diff of this file, never an archaeology exercise across `generate.ts` and
 * `progress.ts`.
 *
 * THE DESIGN CONSTRAINT THAT SHAPES EVERY NUMBER BELOW: a bad day must still yield a win.
 * Dailies in this genre fail in one specific way — they ask for a session the player cannot
 * fit in, the player misses all three, and the app becomes a thing that reports on their
 * failures. So one of the three is always clearable by a walk, and the EP target for it is
 * DERIVED from the reward tables rather than guessed, so it cannot drift out of reach when
 * the economy is retuned.
 */
import type { Modality, QuestKind } from '../contracts/types';
import {
  MET_TABLE,
  MODALITY_WEIGHT,
  REFERENCE_MET,
  TRUST_MULTIPLIER,
} from '../rewards/constants';

/* -------------------------------------------------------------------------- *
 * The trio
 * -------------------------------------------------------------------------- */

/**
 * How many dailies a player gets.
 *
 * Three: enough that one can be the guaranteed win, one the class nudge and one a stretch,
 * and few enough that clearing all three on a good day is normal rather than aspirational.
 * A list of six unfinished quests is a list of six reproaches.
 */
export const DAILY_QUEST_COUNT = 3;

/** Sessions asked for by a count-based quest. One: a daily is a nudge, not a programme. */
export const SESSION_TARGET = 1;

/* -------------------------------------------------------------------------- *
 * The guaranteed win
 * -------------------------------------------------------------------------- */

/**
 * The walk the "bad day" quest must be clearable by.
 *
 * Thirty minutes, unhurried, no equipment, no gym, no change of clothes — the floor of what
 * a person can do on the worst day they will still open the app.
 */
export const WALK_CLEARABLE_MINUTES = 30;

/**
 * The EP target of the easy `REACH_EP` daily — DERIVED, never written down.
 *
 * Computed as what `WALK_CLEARABLE_MINUTES` of walking is worth under the LEAST favourable
 * conditions the engine will score it in: the MET tier (no heart rate strap on a walk) and
 * `MANUAL` trust (the walk the watch missed, typed in afterwards). Floored, so rounding can
 * only ever make it easier.
 *
 * Derived rather than hardcoded because the alternative is a number that silently becomes
 * unreachable the first time `MODALITY_WEIGHT.walk` is retuned downwards — and the failure
 * would be invisible: the quest would simply stop being clearable, in the field, for exactly
 * the users who need it most.
 */
export const EASY_EP_TARGET = Math.floor(
  WALK_CLEARABLE_MINUTES *
    (MET_TABLE.walk / REFERENCE_MET) *
    MODALITY_WEIGHT.walk *
    TRUST_MULTIPLIER.MANUAL,
);

/**
 * Share of the draw on which the guaranteed win is `ANY_ACTIVITY` rather than the easy
 * `REACH_EP`. Half and half: they are the same promise phrased two ways, and alternating
 * keeps the daily screen from reading like a template.
 */
export const EASY_ANY_ACTIVITY_SHARE = 0.5;

/* -------------------------------------------------------------------------- *
 * The other two slots
 * -------------------------------------------------------------------------- */

/**
 * The stretch EP targets, one of which may be drawn for a non-easy slot.
 *
 * Roughly 45, 70 and 90 minutes of ordinary training. The top of the range sits far below
 * `DAILY_SOFT_CAP_EP`: a daily quest must never be the reason somebody trains into the
 * taper, because the taper exists for their joints and not for the economy.
 */
export const STRETCH_EP_TARGETS: readonly number[] = [50, 80, 110];

/**
 * The modalities a `RECOVER` quest accepts.
 *
 * Two, not one, because "recover" has to include the thing the player is actually willing to
 * do: a stretch on the floor counts, and insisting on a logged meditation would make this the
 * quest everyone ignores.
 */
export const RECOVER_MODALITIES: readonly Modality[] = ['recovery', 'mobility'];

/**
 * Class bias at or above which a modality counts as "familiar" rather than neglected.
 *
 * `CLASS_MODALITY_BIAS` lists only affinities and penalties, so a bias BELOW this is exactly
 * the engine's own record of what this class avoids — which makes it the right thing to nudge
 * towards. A WARRIOR is asked to stretch; a PRIEST is asked to lift.
 */
export const NEGLECT_BIAS_THRESHOLD = 1.0;

/**
 * Draw weight for a modality the hero's class is BAD at. The cross-training nudge: three
 * times as likely as a modality they already favour, so the daily leans against the
 * specialisation without ever forbidding it.
 */
export const NEGLECTED_MODALITY_WEIGHT = 3;

/** Draw weight for a modality the hero's class is neutral or good at. */
export const FAMILIAR_MODALITY_WEIGHT = 1;

/** Draw weight of the `RECOVER` candidate. Always available — rest needs no training history. */
export const RECOVER_WEIGHT = 2;

/** Draw weight of each stretch `REACH_EP` candidate. */
export const STRETCH_EP_WEIGHT = 2;

/* -------------------------------------------------------------------------- *
 * Payout
 * -------------------------------------------------------------------------- */

/**
 * EP granted for completing each kind of daily.
 *
 * Small on purpose — a fraction of a real session. Dailies are a reason to open the app and a
 * reason to do something on a flat day; if clearing three of them out-earned training, the
 * game would be paying for engagement instead of for exercise, and this one is not allowed to
 * do that.
 *
 * `SPECIFIC_MODALITY` pays the most because it is the only one that asks the player to do
 * something they would not otherwise have done today.
 */
export const QUEST_REWARD_EP: Readonly<Record<QuestKind, number>> = {
  ANY_ACTIVITY: 10,
  REACH_EP: 15,
  SPECIFIC_MODALITY: 25,
  RECOVER: 15,
};

/* -------------------------------------------------------------------------- *
 * Copy
 * -------------------------------------------------------------------------- */

/**
 * Description templates, by kind, with `{target}` and `{modality}` placeholders.
 *
 * SHIPPING ENGLISH COPY FROM A VERSIONED ENGINE IS A COMPROMISE, and worth naming as one:
 * `BattleEvent` deliberately carries no strings so the client can localise everything, but
 * `DailyQuest.description` is part of the contract and demands one. Keeping the templates here
 * as DATA is the least bad answer — a client that wants to localise has `kind`, `target` and
 * `modality` and can ignore `description` entirely, and nobody has to ship an engine release
 * to fix a typo in a language they do not read.
 */
export const QUEST_DESCRIPTION_TEMPLATE: Readonly<Record<QuestKind, string>> = {
  ANY_ACTIVITY: 'Log any activity today',
  REACH_EP: 'Earn {target} EP today',
  SPECIFIC_MODALITY: 'Log a {modality} session today',
  RECOVER: 'Log a recovery or mobility session today',
};

/**
 * Display names for the modality tokens, for `{modality}` substitution.
 *
 * The taxonomy is written for reward tables, not for humans: nobody wants to be told to "log a
 * cardio_steady session today". Same compromise as the templates above, same escape hatch.
 */
export const MODALITY_LABEL: Readonly<Record<Modality, string>> = {
  strength: 'strength',
  cardio_steady: 'steady cardio',
  cardio_intense: 'hard cardio',
  sport_racket: 'racket sport',
  sport_team: 'team sport',
  swim: 'swim',
  cycle: 'ride',
  mobility: 'mobility',
  walk: 'walk',
  recovery: 'recovery',
  other: 'training',
};
