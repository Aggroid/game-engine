/**
 * ASCEND gear — THE TUNING SURFACE FOR EQUIPMENT.
 *
 * EVERY VALUE IN THIS FILE IS PROVISIONAL, pending the M0 economy spreadsheet. Same rule
 * as `rewards/constants.ts`: a rebalance of gear must be a diff of this file plus a bump
 * of `ENGINE_VERSION`, never an archaeology exercise across the logic.
 *
 * WHERE THE LINE BETWEEN THIS FILE AND `catalogue.ts` FALLS, AND WHY:
 *  - CONTENT lives in `catalogue.ts`: an item's id, name, slot, rarity and its own stat
 *    bonus. Those are inseparable from the item's identity — "Worn Barbell gives +3 STR"
 *    is what the item IS, and moving it here would leave a catalogue of empty husks.
 *  - CROSS-ITEM TUNING lives here: the level gate and shop price implied by a RARITY, the
 *    drop weights, and how many pieces a set bonus asks for. Those are dials that apply to
 *    every item at once, and every one of them is a number a designer will want to move
 *    without touching twenty-seven rows.
 *
 * The practical payoff is that no LEGENDARY item can ever accidentally be sold for a POOR
 * price, and no item can be given a hand-typed level gate that disagrees with its rarity:
 * the catalogue does not get to have an opinion about either.
 */
import type { Rarity } from '../contracts/types';

/* -------------------------------------------------------------------------- *
 * Rarity implications
 * -------------------------------------------------------------------------- */

/**
 * Minimum hero level for each rarity tier.
 *
 * Gear NEVER becomes obsolete in this game (§4.11) — the effort behind a piece was real, so
 * there is no expansion-style reset. The level gate is therefore the ONLY pacing tool left:
 * it decides when a piece enters a hero's life, not when it leaves it. The bands are wide on
 * purpose, so a EPIC drop is an event a player remembers rather than a weekly event.
 */
export const LEVEL_REQUIREMENT_BY_RARITY: Readonly<Record<Rarity, number>> = {
  POOR: 1,
  UNCOMMON: 6,
  RARE: 12,
  EPIC: 18,
  LEGENDARY: 25,
};

/**
 * Shop price per rarity, or `null` for drop-only gear.
 *
 * Roughly quadrupling per tier, well ahead of `GOLD_PER_EP`, so that gear lags levels and
 * buying a tier up stays a deliberate saving decision rather than a Tuesday purchase.
 *
 * LEGENDARY IS DELIBERATELY UNPRICED. It is the one tier that cannot be bought with volume,
 * because a top tier purchasable by grinding is a top tier that rewards overtraining — the
 * exact failure the daily and weekly caps exist to prevent.
 */
export const SHOP_PRICE_BY_RARITY: Readonly<Record<Rarity, number | null>> = {
  POOR: 60,
  UNCOMMON: 240,
  RARE: 900,
  EPIC: 2600,
  LEGENDARY: null,
};

/* -------------------------------------------------------------------------- *
 * Drops
 * -------------------------------------------------------------------------- */

/**
 * Relative weights of each rarity in a drop roll. Sums to 100, so a weight reads as a
 * percentage at a glance — which is what makes a rebalance conversation possible with
 * someone who does not read TypeScript.
 *
 * Weights, not probabilities, because a caller may pass its own partial override for a
 * boss chest or a first-week onboarding boost (see `rollDrop`), and weights compose under
 * override while probabilities would have to be renormalised by hand at every call site.
 */
export const DEFAULT_RARITY_WEIGHTS: Readonly<Record<Rarity, number>> = {
  POOR: 60,
  UNCOMMON: 25,
  RARE: 10,
  EPIC: 4,
  LEGENDARY: 1,
};

/* -------------------------------------------------------------------------- *
 * Set bonuses
 * -------------------------------------------------------------------------- */

/**
 * Pieces needed for the partial set bonus.
 *
 * Half a set. The partial tier exists so that a player who has three of six pieces is
 * already being rewarded for the set they are collecting — an all-or-nothing six-piece
 * bonus makes the first five pieces feel like nothing at all.
 */
export const SET_BONUS_PARTIAL_PIECES = 3;

/**
 * Pieces needed for the full set bonus.
 *
 * FIVE, not six, and deliberately one short of `ITEM_SLOTS.length`. A set that
 * demanded every slot would dictate the whole loadout, leaving nothing to choose
 * — the sixth slot is where a player fits the best thing they own regardless of
 * set, which is exactly the decision that makes an auction house interesting.
 * It is also what WoW does, and for the same reason.
 *
 * Bonuses are CUMULATIVE: a five-piece hero holds both tiers at once, so the
 * last piece adds a bonus rather than swapping one out.
 */
export const SET_BONUS_FULL_PIECES = 5;

/* -------------------------------------------------------------------------- *
 * Rolled instances
 * -------------------------------------------------------------------------- */

/**
 * Stat points per point of item level, before the rarity multiplier.
 *
 * PROVISIONAL, like everything else in this file, and more consequential than
 * most: it sets the absolute scale of gear against earned stats. A hero earns
 * roughly one stat point per level from training, so at 1.5 a single item level
 * is worth more than a level of real work. That ratio is the whole balance of
 * "does gear or training decide a fight", and it belongs in the M0 spreadsheet
 * (story 3) rather than here.
 */
export const STAT_BUDGET_PER_ITEM_LEVEL = 1.5;

/**
 * How much of the budget each tier gets.
 *
 * THESE RATIOS DECIDE WHETHER THE TIERS OVERLAP, which is the most important
 * property in the file. With a quality band of [0.75, 1.00], a tier's best roll
 * beats the next tier's worst roll only when the step between them is under
 * 1/0.75 = 1.333x. The first version of this table used steps of 1.5x to 2.0x,
 * which made the ladder strictly ordered — every EPIC beat every RARE — and a
 * strictly ordered ladder means colour is the only information an item carries.
 * Nothing to compare, nothing to price, no reason for an auction house.
 *
 * So the tradeable middle deliberately overlaps, and the two ends deliberately
 * do not:
 *
 *   POOR      0.50   junk. A clear gap below UNCOMMON: vendor fodder should
 *                    never rival something worth wearing.
 *   UNCOMMON  1.00 |
 *   RARE      1.28 |  1.28x steps. Adjacent tiers OVERLAP, so a well-rolled
 *   EPIC      1.64 |  blue can beat a badly-rolled purple.
 *   LEGENDARY 2.30   1.40x. The one step wide enough to break the overlap:
 *                    orange drops at weight 1 against POOR's 60, so it has to
 *                    be categorically better, not merely luckier.
 *
 * At item level 20 that gives, as total stat: POOR 11-15, UNCOMMON 22-30,
 * RARE 28-38, EPIC 36-49, LEGENDARY 51-69. Pinned by tests in `roll.test.ts`,
 * because a later tuning pass that accidentally re-orders the ladder would
 * otherwise quietly delete the reason the market exists.
 */
export const STAT_BUDGET_MULTIPLIER_BY_RARITY: Readonly<Record<Rarity, number>> = {
  POOR: 0.5,
  UNCOMMON: 1.0,
  RARE: 1.28,
  EPIC: 1.64,
  LEGENDARY: 2.3,
};

/**
 * Quality band for a roll, as a fraction of the tier's budget.
 *
 * The floor is 0.75 rather than 0: an item that rolled near zero would be
 * indistinguishable from a bug, and "your EPIC is worthless" is a worse
 * experience than not dropping one. The spread interacts with the multipliers
 * above — see the overlap note there, which is the reason this number cannot be
 * changed on its own.
 */
export const ROLL_QUALITY_MIN = 0.75;
export const ROLL_QUALITY_MAX = 1.0;

/**
 * How many stats an instance carries, `[min, max]` inclusive.
 *
 * Widening with rarity is what makes the top tiers feel different in KIND and
 * not merely in size: a POOR item is a single number, a LEGENDARY is a build
 * decision. Capped at four against six stat keys so no item is ever
 * strictly-better-at-everything.
 */
export const STAT_COUNT_BY_RARITY: Readonly<Record<Rarity, readonly [number, number]>> = {
  POOR: [1, 1],
  UNCOMMON: [1, 2],
  RARE: [2, 2],
  EPIC: [2, 3],
  LEGENDARY: [3, 4],
};

/* -------------------------------------------------------------------------- *
 * Drop bands and sources
 * -------------------------------------------------------------------------- */

/**
 * The level window a drop is scoped to, relative to the hero.
 *
 * A level-20 hero sees items of level 18 to 23. Skewed UPWARD on purpose: a
 * band centred on the hero would mean half of all drops are already behind
 * them, and the reason to fight someone your own level is the chance of
 * something you cannot wear yet.
 */
export const DROP_BAND_BELOW = 2;
export const DROP_BAND_ABOVE = 3;

/**
 * Rarity weights for a fight against a computer-controlled encounter.
 *
 * CAPPED AT UNCOMMON, and the zeroes are the point: `pickRarity` never selects a
 * zero-weighted tier, so PvE cannot produce blue, purple or orange at any
 * volume. Grinding encounters keeps a hero moving and keeps the game playable
 * with a single account, but everything worth owning has to be taken off another
 * player.
 *
 * This is what stops "winner takes all" from being a trap. A player who loses
 * every duel can still farm encounters, rebuild, and come back — the harshness
 * lands on good gear, not on having any gear at all.
 */
export const PVE_RARITY_WEIGHTS: Readonly<Record<Rarity, number>> = {
  POOR: 70,
  UNCOMMON: 30,
  RARE: 0,
  EPIC: 0,
  LEGENDARY: 0,
};

/**
 * Chance that a won fight drops anything at all, by source.
 *
 * Deliberately low for PvP. The tier weights already make a LEGENDARY rare
 * GIVEN a drop; this makes drops themselves uncommon, so the two multiply. A
 * player who wins every duel they fight still does not fill a bag in a week,
 * which is what "hard to get nice items" has to mean once the level band
 * guarantees the items are relevant.
 */
export const DROP_CHANCE_PVP = 0.35;
export const DROP_CHANCE_PVE = 0.2;

/**
 * How far apart two heroes can be and still be matched.
 *
 * Same window as the drop band, so the opponent you are allowed to fight and
 * the loot you are allowed to receive agree. If these ever diverge, a hero can
 * be matched against someone whose gear they could never win.
 */
export const PVP_LEVEL_BAND = DROP_BAND_ABOVE;

/**
 * Hours before the same pairing can be fought again.
 *
 * Without it the strategy is to find the weakest hero in your band and farm
 * them, which is both the least interesting way to play and miserable for them.
 */
export const PVP_REMATCH_COOLDOWN_HOURS = 6;

/* -------------------------------------------------------------------------- *
 * Re-rolling — the gold sink
 * -------------------------------------------------------------------------- */

/**
 * Gold per point of item level, before the tier multiplier.
 *
 * PROVISIONAL and consequential: this sets whether re-rolling is a meaningful
 * drain or a rounding error. The number that matters is the ratio to INCOME. At
 * `WEEKLY_HARD_CAP_EP` and `GOLD_PER_EP` a maxed player mints 1,000 gold a week,
 * so at 8 gold per item level a single re-roll of a level-20 EPIC costs roughly
 * 380 — about a third of a hard week. That feels like the right order: worth
 * doing for an item you care about, not something to spam.
 *
 * Belongs in the M0 spreadsheet (story 3) like every other tuning value here.
 */
export const REROLL_GOLD_PER_ITEM_LEVEL = 8;

/**
 * How much more a higher tier costs to re-roll.
 *
 * Tracks the stat-budget multipliers rather than being invented separately: a
 * tier that carries more stat is worth more to improve, and keeping the two
 * curves aligned means the cost per point of expected gain stays roughly flat
 * across tiers. POOR and LEGENDARY are present but unreachable in practice —
 * neither is tradeable, and neither is worth re-rolling — so they are priced
 * consistently rather than specially.
 */
export const REROLL_COST_MULTIPLIER_BY_RARITY: Readonly<Record<Rarity, number>> = {
  POOR: 0.5,
  UNCOMMON: 1.0,
  RARE: 1.6,
  EPIC: 2.4,
  LEGENDARY: 4.0,
};

/**
 * Cost multiplier per previous re-roll of the SAME item.
 *
 * THE MECHANIC DOES NOT WORK WITHOUT THIS. At a flat cost, a wealthy player
 * re-rolls fifty times, keeps a guaranteed 1.00 roll, and gold has bought power
 * — which is exactly what `rerollItem` exists to prevent. At 1.55x per attempt
 * the tenth costs about 60x the first, so chasing a perfect roll gets expensive
 * faster than it gets likely.
 *
 * Uncapped on purpose. A cap would be a price at which perfection becomes
 * routine for anybody patient enough, and there is no such price that is also
 * affordable early.
 */
export const REROLL_COST_ESCALATION = 1.55;
