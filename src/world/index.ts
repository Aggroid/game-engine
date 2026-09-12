/**
 * Public surface of the world module — zones, dungeon generation and affixes.
 *
 * Consumed by `backend` (which owns runs, stores their seeds and replays them
 * through `simulate()`) and, types-only, by `mobile-app` (which renders the
 * forks). Nothing in `src/world` may import this barrel: the module-graph test
 * in `rewards/index.test.ts` explains what that cycle does to a versioned
 * dependency under Metro.
 *
 * ============================================================================
 * WHAT IS DELIBERATELY NOT EXPORTED.
 * ============================================================================
 * `affixEffect` and the `AffixEffect` union stay inside the module. An affix's
 * MECHANISM is engine business — the client renders `Affix.description` and the
 * backend applies effects only by calling `rollEncounter`. The moment a consumer
 * branches on an affix's mechanism, retuning one becomes a three-repo change.
 */
export {
  AFFIXES,
  AFFIX_IDS,
  CREATURE_IDS,
  ZONES,
  affixById,
  bossPhaseEncounters,
  bossPhases,
  bossPhasesAreCoherent,
  creatureById,
  creatureRank,
  zoneById,
  zonesAreCoherent,
} from './catalogue';

export { rollEncounter, rollNodeEncounters } from './encounter';
export { affixesForWeek, floorCountForTier, generateDungeon } from './generate';
export { hashToSeed, partSeed } from './seed';
export { rollSessionCurrency } from './currency';

export {
  AFFIXES_PER_WEEK,
  BASE_FLOOR_COUNT,
  CURRENCY_FULL_EP,
  DEPTH_ATTACK_GROWTH,
  DEPTH_DEFENCE_GROWTH,
  DEPTH_HP_GROWTH,
  ENCOUNTER_VARIANCE,
  FINAL_FLOOR_IS_ELITE,
  FLOORS_PER_TIER,
  KEY_DROP_CHANCE,
  MAX_FLOOR_COUNT,
  MAX_NODES_PER_FLOOR,
  MIN_NODES_PER_FLOOR,
  NODE_WEIGHT,
  PACK_SIZE_MAX,
  PACK_SIZE_MIN,
  RANK_MULTIPLIER,
  REST_HEAL_SHARE,
  SIGIL_DROP_CHANCE,
  SWEEP_SIZE_MAX,
  SWEEP_SIZE_MIN,
  WIPE_LOOT_KEPT,
  worldTuningIsCoherent,
} from './constants';
