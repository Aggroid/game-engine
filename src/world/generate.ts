import type {
  DungeonPlan,
  EncounterSpec,
  FloorPlan,
  NodeKind,
  NodePlan,
} from '../contracts/types';
import { createRng } from '../battle/prng';
import { AFFIX_IDS, hasAffixKind, zoneById } from './catalogue';
import {
  AFFIXES_PER_WEEK,
  BASE_FLOOR_COUNT,
  FINAL_FLOOR_IS_ELITE,
  FLOORS_PER_TIER,
  MAX_FLOOR_COUNT,
  MAX_NODES_PER_FLOOR,
  MIN_NODES_PER_FLOOR,
  NODE_WEIGHT,
  PACK_SIZE_MAX,
  PACK_SIZE_MIN,
  TEEMING_EXTRA_PACK_SIZE,
} from './constants';
import { hashToSeed } from './seed';

/**
 * Dungeon generation, and the weekly affix rotation.
 *
 * ============================================================================
 * A PLAN, NEVER A LIVE RUN.
 * ============================================================================
 * `generateDungeon` returns the LAYOUT: floors, the doors out of each, and what
 * is behind them by name. It does not roll a single number of health. That
 * separation is what lets the backend store four small fields per run instead of
 * a serialised map, and it means retuning the depth curve changes how hard a
 * half-fought dungeon is without changing its shape underneath the player.
 *
 * PURE, and a pure function of the 4-tuple `(zoneId, tier, affixes, seed)` — the
 * same guarantee daily quests and gear drops give. Given a stored seed the whole
 * dungeon re-derives identically, forever, and a run resumed on a second device
 * cannot disagree with the first about what was behind the left-hand door.
 *
 * WHY THIS TAKES A SEED WHERE THE REST OF THE ENGINE TAKES AN RNG. Everywhere
 * else the caller owns the stream (`generateDailies(rng, ...)`,
 * `rollSessionDrop(rng, ...)`) because those are one draw inside a larger
 * sequence. Here the 4-tuple IS the contract, stated that way in the design and
 * relied on by the storage model — and a caller handing over a half-consumed
 * stream would silently break it.
 *
 * ============================================================================
 * KNOWN HAZARD, UNRESOLVED: THIS FUNCTION'S OUTPUT IS NOT VERSIONED.
 * ============================================================================
 * A run stores four fields and re-derives its dungeon on every read, which is
 * the property that makes the storage model cheap. It also means that CHANGING
 * THIS FUNCTION CHANGES THE SHAPE OF RUNS THAT ARE ALREADY IN PROGRESS: the door
 * a player was about to open becomes a different door, mid-run.
 *
 * That is fine for encounter DIFFICULTY — the design explicitly wants a retuned
 * depth curve to reach a half-fought run — and it is not fine for LAYOUT.
 *
 * Neither existing version stamp covers it. `ENGINE_VERSION` is the reward
 * economy and `SIM_VERSION` is the battle simulator's output; a dungeon's layout
 * is neither, so a change here moves no number and nothing notices.
 *
 * The fix is a third stamp — a `WORLD_VERSION` written onto the run row, with
 * generation pinned per version — and it is deliberately NOT being invented
 * here, in the middle of a content pass. Until it exists, treat any change to
 * the generator as breaking for in-flight runs and ship it when there are none.
 */

/* -------------------------------------------------------------------------- *
 * Weighted draws
 * -------------------------------------------------------------------------- */

interface Weighted<T> {
  weight: number;
  value: T;
}

/**
 * Draws one weighted candidate, consuming exactly one number from `rng`.
 *
 * The trailing return covers the floating-point tail, reached only by an `rng`
 * that returns exactly 1 — which the contract forbids and a caller-supplied
 * function may still do. Same guard as `quests/generate.ts`.
 */
function drawWeighted<T>(rng: () => number, candidates: readonly Weighted<T>[]): T {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const target = rng() * total;

  let cumulative = 0;
  for (const candidate of candidates) {
    cumulative += candidate.weight;
    if (target < cumulative) return candidate.value;
  }

  return (candidates[candidates.length - 1] as Weighted<T>).value;
}

/** An integer in `[min, max]`, inclusive at both ends. One draw. */
function drawInt(rng: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of a non-empty list. One draw. */
function drawFrom<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)] ?? (values[0] as T);
}

/* -------------------------------------------------------------------------- *
 * Nodes
 * -------------------------------------------------------------------------- */

/**
 * The kinds that may be drawn on this floor.
 *
 * `STALKER` is filtered out because its weight is zero: it is PLANTED by the
 * Hunted affix, never drawn, which is what makes that affix read as an event
 * rather than as a change in the odds.
 *
 * `REST` under Starving and `CACHE` under Barren are REMOVED rather than
 * zero-weighted, so the remaining weights renormalise. An affix that made rest
 * rare instead of absent would be a worse version of the same idea and far
 * harder to describe in the one line an affix gets.
 */
function kindCandidates(banned: readonly NodeKind[]): Weighted<NodeKind>[] {
  const kinds: NodeKind[] = ['PACK', 'ELITE', 'REST', 'CACHE'];

  return kinds
    .filter((kind) => !banned.includes(kind))
    .map((kind) => ({ weight: NODE_WEIGHT[kind], value: kind }))
    .filter((candidate) => candidate.weight > 0);
}

/**
 * What is actually behind a node.
 *
 * REST and CACHE have no fights, and that is the whole reason push-or-extract is
 * a decision rather than arithmetic: a floor where every door is a fight is a
 * floor you walk through, not one you weigh.
 *
 * ============================================================================
 * A NODE'S CONTENTS COME FROM THEIR OWN STREAM, NOT THE LAYOUT'S.
 * ============================================================================
 * This used to draw from the generator's single stream, and that made the number
 * of draws inside one node change everything after it: a three-mob pack consumed
 * one more number than a two-mob pack, so the Teeming affix — which adds a body
 * to every pack — quietly rearranged the whole dungeon rather than making its
 * packs bigger. The bug was invisible in the output and obvious in a test that
 * compared the two dungeons node by node.
 *
 * A per-node sub-stream, seeded from `(runSeed, nodeId)`, makes node CONTENTS
 * independent of node COUNT. Any affix that changes what is inside a door can
 * then never move the doors — which is the property that lets a week's affixes
 * read as modifiers rather than as a different dungeon.
 */
function encounterSpecsFor(
  runSeed: number,
  kind: NodeKind,
  nodeId: string,
  trashMobIds: readonly string[],
  extraPackSize: number,
): EncounterSpec[] {
  if (kind === 'REST' || kind === 'CACHE') return [];

  const rng = createRng(hashToSeed(`${runSeed >>> 0} ${nodeId} contents`));

  if (kind === 'PACK') {
    // The size draw comes first and from the same range every time; Teeming adds
    // afterwards, so the base pack is the same pack with one more body in it.
    const size = drawInt(rng, PACK_SIZE_MIN, PACK_SIZE_MAX) + extraPackSize;
    return Array.from({ length: size }, (_unused, index) => ({
      id: `${nodeId}-e${index + 1}`,
      mobId: drawFrom(rng, trashMobIds),
      rank: 'TRASH' as const,
    }));
  }

  // ELITE and STALKER are both one creature from the zone's table, ranked up.
  return [{ id: `${nodeId}-e1`, mobId: drawFrom(rng, trashMobIds), rank: 'ELITE' as const }];
}

/* -------------------------------------------------------------------------- *
 * The generator
 * -------------------------------------------------------------------------- */

/** Floors in a dungeon of this tier. Clamped, because a run must end. */
export function floorCountForTier(tier: number): number {
  const steps = Math.max(1, Math.trunc(Number.isFinite(tier) ? tier : 1)) - 1;
  return Math.min(MAX_FLOOR_COUNT, BASE_FLOOR_COUNT + steps * FLOORS_PER_TIER);
}

/**
 * Generates a dungeon.
 *
 * @param input.zoneId  The zone whose trash table and flavour the dungeon uses.
 * @param input.tier    Difficulty step, 1-based. Tiers get DEEPER, never wider.
 * @param input.affixes Affix ids in force. Stored VERBATIM on the plan, unknown
 *                      ids included, so the plan is a faithful record of what the
 *                      run was started under rather than of what this build could
 *                      make sense of.
 * @param input.seed    The run's stored seed.
 * @returns The plan, or `null` for a zone this build does not know — a zone can
 *          be retired, and a stored run naming one must degrade rather than throw.
 */
export function generateDungeon(input: {
  zoneId: string;
  tier: number;
  affixes: readonly string[];
  seed: number;
}): DungeonPlan | null {
  const zone = zoneById(input.zoneId);
  if (zone === null) return null;

  const rng = createRng(input.seed);

  const starving = hasAffixKind(input.affixes, 'NO_REST_NODES');
  const barren = hasAffixKind(input.affixes, 'NO_CACHE_NODES');
  const hunted = hasAffixKind(input.affixes, 'EXTRA_STALKER');
  const teeming = hasAffixKind(input.affixes, 'BIGGER_PACKS');
  const entombed = hasAffixKind(input.affixes, 'EXTRA_FLOOR');

  /*
   * Entombed adds a floor and the ceiling still holds: a run must end, whatever
   * the week is doing to it.
   */
  const floorCount = Math.min(
    MAX_FLOOR_COUNT,
    floorCountForTier(input.tier) + (entombed ? 1 : 0),
  );

  const banned: NodeKind[] = [
    ...(starving ? (['REST'] as const) : []),
    ...(barren ? (['CACHE'] as const) : []),
  ];
  const candidates = kindCandidates(banned);
  const extraPackSize = teeming ? TEEMING_EXTRA_PACK_SIZE : 0;

  /*
   * THE STALKER'S FLOOR IS DRAWN UNCONDITIONALLY, even when nothing is hunting.
   * The draw costs one number and buys something worth more than that: the plan
   * for `affixes: []` and for `affixes: ['hunted']` share a stream position for
   * everything that follows, so adding Hunted to a week changes WHERE the elite
   * is and nothing else about the dungeon.
   */
  const stalkerFloor = drawInt(rng, 1, floorCount);

  const floors: FloorPlan[] = [];

  for (let depth = 1; depth <= floorCount; depth += 1) {
    const nodeCount = drawInt(rng, MIN_NODES_PER_FLOOR, MAX_NODES_PER_FLOOR);
    const isFinalFloor = depth === floorCount;
    const nodes: NodePlan[] = [];

    for (let index = 0; index < nodeCount; index += 1) {
      const nodeId = `f${depth}-n${index + 1}`;
      let kind = drawWeighted(rng, candidates);

      /*
       * TWO OVERRIDES, AND THE ORDER BETWEEN THEM MATTERS.
       *
       * The final floor's first door is always an ELITE, because a generated
       * dungeon needs an ending and "it stops" is not one. The stalker takes a
       * door on its own floor — but never that one, or on the last floor the two
       * rules would fight and the ending would quietly disappear. There are
       * always at least two doors, so there is always somewhere else to put it.
       */
      if (isFinalFloor && index === 0 && FINAL_FLOOR_IS_ELITE) kind = 'ELITE';
      else if (hunted && depth === stalkerFloor && index === (isFinalFloor ? 1 : 0)) {
        kind = 'STALKER';
      }

      nodes.push({
        id: nodeId,
        kind,
        encounterSpecs: encounterSpecsFor(
          input.seed,
          kind,
          nodeId,
          zone.trashMobIds,
          extraPackSize,
        ),
      });
    }

    floors.push({ depth, nodes });
  }

  return {
    zoneId: zone.id,
    tier: Math.max(1, Math.trunc(Number.isFinite(input.tier) ? input.tier : 1)),
    affixes: [...input.affixes],
    floors,
  };
}

/* -------------------------------------------------------------------------- *
 * The weekly rotation
 * -------------------------------------------------------------------------- */

/**
 * The affixes in force for one zone in one week.
 *
 * ============================================================================
 * NO LIVE-OPS, NO SCHEDULED JOB, NO STORED STATE.
 * ============================================================================
 * A pure function of `(weekKey, zoneId)`. The rotation therefore needs nobody to
 * press anything on a Tuesday, cannot drift between two clients looking at the
 * same week, and is knowable in advance and in arrears — which matters, because
 * a run fought last week has to be explainable by what was in force then.
 *
 * PER ZONE, not per world: two zones in the same week run different affixes, so
 * a player with two zones unlocked has a reason to pick one. That is most of
 * what makes a small content set stop repeating.
 *
 * @param weekKey An ISO-week-like key the CALLER owns, e.g. `2026-W37`. The
 *                engine has no clock, so which week it is can only ever be an
 *                argument — same division of labour as `EngineContext.localDate`.
 * @returns Exactly `AFFIXES_PER_WEEK` distinct affix ids, or fewer only if the
 *          catalogue itself holds fewer. Never repeats one within a week.
 */
export function affixesForWeek(weekKey: string, zoneId: string): string[] {
  const rng = createRng(hashToSeed(`${weekKey} ${zoneId}`));
  const pool = [...AFFIX_IDS];
  const chosen: string[] = [];

  const count = Math.min(AFFIXES_PER_WEEK, pool.length);
  for (let index = 0; index < count; index += 1) {
    const drawn = Math.floor(rng() * pool.length);
    // Drawn WITHOUT replacement: "Drowned and Drowned" is not a week.
    chosen.push(pool.splice(Math.min(drawn, pool.length - 1), 1)[0] as string);
  }

  return chosen;
}
