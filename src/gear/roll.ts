/**
 * Rolled item instances — the reason two purples are not the same purple.
 *
 * THE PROBLEM THIS SOLVES. The catalogue defines items as DATA with fixed
 * `statBonus`, so before this module every drop of "Ironbound Helm" was
 * byte-identical to every other. That makes an auction house pointless: there
 * is nothing to want. It also makes "hard to get nice items with nice stats"
 * unexpressible, because an item either exists in the catalogue or it does not
 * — there is no such thing as a good one.
 *
 * So a drop now rolls. The catalogue entry becomes a TEMPLATE: it fixes the
 * slot, the set membership and the flavour, and this module decides how much
 * stat the instance actually carries and where it goes.
 *
 * WHAT MAKES IT COMPETITIVE. Three things compose:
 *
 *   1. A stat BUDGET from item level and rarity. Higher tier, more total stat.
 *   2. A QUALITY multiplier in [0.75, 1.00]. Two EPICs of the same item level
 *      can differ by a third in total stat, so the tier tells you roughly what
 *      you have and the roll tells you whether it was worth keeping.
 *   3. A stat COUNT that widens with rarity. A POOR item puts everything in one
 *      stat; a LEGENDARY spreads across three or four, which is what makes the
 *      top tier feel different in kind rather than just bigger.
 *
 * The consequence worth designing for: a 1.00-quality RARE can beat a
 * 0.75-quality EPIC. That is deliberate. It means the ladder is not a straight
 * line, players have a reason to compare rather than just sort by colour, and
 * the auction house has genuine price discovery instead of five fixed prices.
 *
 * DETERMINISM. Every roll comes from a seed, through the same `createRng` the
 * battle simulator uses. Same seed, same item, same result, forever — so a drop
 * is reproducible from its `BattleLog`, and a disputed item can be re-derived
 * rather than argued about. The RNG draw ORDER below is part of that contract:
 * quality, then count, then allocation. Reordering it silently changes every
 * future roll.
 *
 * The rolled stats are what gets STORED and what counts. This module can
 * re-derive them from a seed for audit, but the stored values are authoritative
 * — once an item has been sold for gold in an auction house, a tuning change
 * must not silently rewrite what somebody paid for.
 */
import { createRng } from '../battle/prng';
import {
  STAT_KEYS,
  type DamageType,
  type Item,
  type Rarity,
  type ResistanceBlock,
  type StatKey,
} from '../contracts/types';
import {
  REROLL_COST_ESCALATION,
  REROLL_COST_MULTIPLIER_BY_RARITY,
  REROLL_GOLD_PER_ITEM_LEVEL,
  ROLL_QUALITY_MAX,
  ROLL_QUALITY_MIN,
  STAT_BUDGET_PER_ITEM_LEVEL,
  STAT_COUNT_BY_RARITY,
  STAT_BUDGET_MULTIPLIER_BY_RARITY,
} from './constants';

/**
 * One specific piece of gear that one specific hero owns.
 *
 * Distinct from `Item`, which is the catalogue template. An `Item` is content;
 * a `RolledItem` is a possession, and only the latter can be equipped, priced or
 * traded.
 */
export interface RolledItem {
  /** Catalogue template this was rolled from. */
  readonly itemId: string;
  readonly name: string;
  readonly slot: Item['slot'];
  readonly rarity: Rarity;
  readonly setId?: string;
  /** Drives the stat budget. NOT the level needed to wear it. */
  readonly itemLevel: number;
  /** Minimum hero level to equip. */
  readonly levelRequirement: number;
  /** The rolled stats. Authoritative — not recomputed at read time. */
  readonly statBonus: Partial<Record<StatKey, number>>;
  /**
   * Where this roll landed in [0.75, 1.00].
   *
   * Surfaced rather than kept internal because it is the single most useful
   * thing a player can know about an item they are deciding whether to sell,
   * and because an auction house needs it to be comparable across listings.
   */
  readonly quality: number;
  /**
   * For a weapon: the school its wielder's blows become. From the template.
   *
   * An ordinary weapon has none, and its wielder falls back to their class's.
   */
  readonly damageType?: DamageType;
  /** What wearing this wards off, by school. From the template, never rolled. */
  readonly resistance?: ResistanceBlock;
  /** Provenance: lets the roll be re-derived and audited. */
  readonly rollSeed: number;
}

/** Total stat points an item of this level and tier is allowed to carry. */
export function statBudgetFor(itemLevel: number, rarity: Rarity): number {
  const base = Math.max(1, itemLevel) * STAT_BUDGET_PER_ITEM_LEVEL;
  return base * STAT_BUDGET_MULTIPLIER_BY_RARITY[rarity];
}

/**
 * Roll one instance of a catalogue template.
 *
 * @param template   The catalogue item. Its own `statBonus` is IGNORED — it
 *                   describes a shape, not an instance, and honouring it would
 *                   make every roll of that item partly identical.
 * @param itemLevel  Drives the budget. Comes from the drop's level band.
 * @param seed       Anything deterministic. In practice the battle seed mixed
 *                   with the drop index, so two drops in one fight differ.
 */
/**
 * The roll itself: tier and item level in, stats and quality out.
 *
 * Shared by `rollItem` and `rerollItem` so the two cannot drift. If a drop and a
 * re-roll used different maths, a re-rolled item would be distinguishable from a
 * dropped one — and the whole promise of a re-roll is that it gives you the item
 * you could have found.
 *
 * THE RNG DRAW ORDER IS PART OF THE SEED CONTRACT: quality, then stat count,
 * then which stats, then the split. Reordering it silently changes every future
 * roll and every re-roll.
 */
function rollStats(
  rarity: Rarity,
  itemLevel: number,
  seed: number,
): { statBonus: Partial<Record<StatKey, number>>; quality: number } {
  const rng = createRng(seed);

  // DRAW 1 — quality. First so that adding stats later cannot shift it.
  const quality = ROLL_QUALITY_MIN + rng() * (ROLL_QUALITY_MAX - ROLL_QUALITY_MIN);

  // DRAW 2 — how many stats this instance carries.
  const [minStats, maxStats] = STAT_COUNT_BY_RARITY[rarity];
  const statCount = minStats + Math.floor(rng() * (maxStats - minStats + 1));

  // DRAW 3.. — which stats, then how the budget splits between them.
  const chosen = pickStats(statCount, rng);
  const budget = Math.floor(statBudgetFor(itemLevel, rarity) * quality);

  return { statBonus: allocate(budget, chosen, rng), quality };
}

export function rollItem(template: Item, itemLevel: number, seed: number): RolledItem {
  const { statBonus, quality } = rollStats(template.rarity, itemLevel, seed);

  return {
    itemId: template.id,
    name: template.name,
    slot: template.slot,
    rarity: template.rarity,
    ...(template.setId === undefined ? {} : { setId: template.setId }),
    /*
     * CARRIED FROM THE TEMPLATE, UNROLLED. A roll decides how GOOD an item is;
     * the school it deals and what it wards decide what KIND it is. Rolling them
     * too would make "frost-warded" a property of one instance rather than of a
     * piece of gear, and a player could not go looking for one.
     */
    ...(template.damageType === undefined ? {} : { damageType: template.damageType }),
    ...(template.resistance === undefined ? {} : { resistance: { ...template.resistance } }),
    itemLevel,
    /*
     * FROM THE ROLL, NOT THE TEMPLATE.
     *
     * The catalogue's `levelRequirement` describes where that template sits in
     * PvE progression, and honouring it here would be exploitable the moment
     * items became tradeable: a template requiring level 4, rolled at item
     * level 23, would let a level-4 alt wear level-23 stats bought from the
     * auction house. Tying the requirement to the item level closes that, and
     * makes the rule a player can state — you can wear what you could have won.
     */
    levelRequirement: itemLevel,
    statBonus,
    quality,
    rollSeed: seed,
  };
}

/**
 * Choose which stats an instance carries.
 *
 * A partial Fisher-Yates over a COPY of `STAT_KEYS`: drawing with rejection
 * would consume a variable number of RNG values depending on collisions, and
 * that would make the roll depend on how unlucky the shuffle was rather than
 * only on the seed. A fixed number of draws keeps the seed contract stable.
 */
function pickStats(count: number, rng: () => number): readonly StatKey[] {
  const pool = [...STAT_KEYS];
  const wanted = Math.min(count, pool.length);

  for (let index = 0; index < wanted; index += 1) {
    const swap = index + Math.floor(rng() * (pool.length - index));
    const held = pool[index] as StatKey;
    pool[index] = pool[swap] as StatKey;
    pool[swap] = held;
  }

  return pool.slice(0, wanted);
}

/**
 * Split the budget across the chosen stats, unevenly.
 *
 * Even division would make every item of a tier feel the same even with quality
 * variance, so weights are drawn per stat and normalised. Every chosen stat is
 * then floored to at least 1: a stat listed as present but contributing zero is
 * a lie on the item card.
 */
function allocate(
  budget: number,
  stats: readonly StatKey[],
  rng: () => number,
): Partial<Record<StatKey, number>> {
  if (stats.length === 0) {
    return {};
  }

  const weights = stats.map(() => 0.5 + rng());
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  const result: Partial<Record<StatKey, number>> = {};
  let spent = 0;

  stats.forEach((stat, index) => {
    const share = Math.max(1, Math.floor((budget * (weights[index] as number)) / total));
    result[stat] = share;
    spent += share;
  });

  /*
   * Flooring loses points, so the remainder goes to the largest stat. That
   * keeps `sum(statBonus)` within one point of the budget, which is what lets a
   * test assert the budget is respected — without it, a tier's real power would
   * drift below its stated budget by an amount that grows with stat count.
   */
  const remainder = budget - spent;
  if (remainder > 0) {
    const biggest = stats.reduce((best, stat) =>
      (result[stat] ?? 0) > (result[best] ?? 0) ? stat : best,
    );
    result[biggest] = (result[biggest] ?? 0) + remainder;
  }

  return result;
}

/**
 * Total stat carried, for comparing two instances.
 *
 * The number an auction house sorts by and a player judges an offer with.
 * Deliberately unweighted by class: what a stat is worth depends on the hero
 * reading the listing, and baking one hero's preference into a shared market
 * would misprice every item for everyone else.
 */
export function totalStats(item: RolledItem): number {
  return Object.values(item.statBonus).reduce((sum, value) => sum + (value ?? 0), 0);
}

/**
 * Re-rolls an item's stats for gold.
 *
 * ============================================================================
 * GOLD BUYS VARIANCE, NEVER POWER. This is the property that makes the whole
 * mechanic safe, and everything else here follows from it.
 * ============================================================================
 *
 * The tier and the item level do NOT change, so the stat BUDGET does not change.
 * A re-rolled EPIC is still an EPIC of the same item level: gold can turn a bad
 * roll into a good one, and can never turn a blue into a purple or raise the
 * ceiling that fighting set. "Your real training is the grind" survives, because
 * the thing gold cannot buy is the thing that actually gates power.
 *
 * WHY THIS IS THE GOLD SINK THE GAME NEEDS. The auction-house cut only removes a
 * fraction of what CHANGES HANDS, while supply grows with every session — at
 * WEEKLY_HARD_CAP_EP and GOLD_PER_EP a maxed player mints 1,000 gold a week
 * forever, and would have to trade twenty times that for a 5% cut to keep up.
 * Re-rolling drains instead in proportion to how much gold somebody HAS: it is
 * unbounded, it is optional, and it stops being worth doing on its own, because
 * `rerollCost` climbs with every attempt on the same item.
 *
 * IT ALWAYS REPLACES. The new roll stands even when it is worse, and that is
 * deliberate: an option that only ever improves an item is not a sink, it is a
 * delay before everybody owns a perfect one. The consequence is that players
 * with good rolls rationally never re-roll, which is correct — the mechanic is
 * for the 0.76 purples, and it turns those from junk into lottery tickets. That
 * is also what gives cheap high-tier items a real market.
 *
 * A NOTE ON WHAT THIS IS, LEGALLY. Spending currency for a random outcome is
 * loot-box-shaped. It is fine while gold cannot be bought with money — and it
 * becomes a disclosable loot box the day it can. If a premium tier ever sells
 * gold, this mechanic is the reason that decision needs its own look. The
 * quality band is deliberately public (`ROLL_QUALITY_MIN`/`MAX`) so the odds can
 * always be shown rather than inferred.
 *
 * @param current The item as owned now. Its identity, tier, item level and set
 *                membership all survive; only the stats and quality move.
 * @param seed    Deterministic, supplied by the caller. In practice derived from
 *                the previous `rollSeed` and the attempt number, so a re-roll is
 *                reproducible from the row and a retried request cannot re-roll
 *                into something better.
 */
export function rerollItem(current: RolledItem, seed: number): RolledItem {
  const { statBonus, quality } = rollStats(current.rarity, current.itemLevel, seed);

  return {
    ...current,
    statBonus,
    quality,
    rollSeed: seed,
  };
}

/**
 * What the next re-roll of an item costs.
 *
 * THREE TERMS, and the third is the one that matters:
 *
 *   ITEM LEVEL   a level-40 item costs more to re-roll than a level-5 one,
 *                because it is worth more.
 *   RARITY       a purple costs more than a green, for the same reason.
 *   ATTEMPTS     multiplied by REROLL_COST_ESCALATION for every previous
 *                re-roll of THIS item.
 *
 * Without escalation the mechanic breaks completely: a wealthy player would
 * simply re-roll fifty times and hold a guaranteed 1.00 roll, which converts
 * gold straight into power and makes every rolled item eventually perfect. With
 * it, chasing a top roll gets expensive faster than it gets likely — the tenth
 * attempt costs about 60x the first — so people stop where the marginal gain
 * stops being worth it, and the sink self-balances with no cap to tune.
 *
 * @param attemptsSoFar How many times this item has already been re-rolled.
 */
export function rerollCost(rarity: Rarity, itemLevel: number, attemptsSoFar: number): number {
  const base = Math.max(1, itemLevel) * REROLL_GOLD_PER_ITEM_LEVEL;
  const tier = REROLL_COST_MULTIPLIER_BY_RARITY[rarity];
  const escalation = REROLL_COST_ESCALATION ** Math.max(0, attemptsSoFar);

  return Math.ceil(base * tier * escalation);
}
