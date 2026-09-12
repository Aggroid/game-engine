import type { DungeonPlan, NodeKind } from '../contracts/types';
import { ZONES, zoneById } from './catalogue';
import {
  AFFIXES_PER_WEEK,
  BASE_FLOOR_COUNT,
  MAX_FLOOR_COUNT,
  MAX_NODES_PER_FLOOR,
  MIN_NODES_PER_FLOOR,
  PACK_SIZE_MAX,
  PACK_SIZE_MIN,
} from './constants';
import { affixesForWeek, floorCountForTier, generateDungeon } from './generate';

const ZONE = 'verdant-wastes';

function plan(overrides: Partial<Parameters<typeof generateDungeon>[0]> = {}): DungeonPlan {
  const result = generateDungeon({ zoneId: ZONE, tier: 1, affixes: [], seed: 4242, ...overrides });
  if (result === null) throw new Error('the reference zone must generate');
  return result;
}

function kindsIn(dungeon: DungeonPlan): NodeKind[] {
  return dungeon.floors.flatMap((floor) => floor.nodes.map((node) => node.kind));
}

describe('determinism', () => {
  /**
   * THE GUARANTEE THE STORAGE MODEL RESTS ON. The backend stores four small
   * fields per run instead of a serialised map, and a run resumed on a second
   * device must not disagree with the first about what was behind a door.
   */
  it('re-derives an identical dungeon from the same four inputs', () => {
    expect(plan({ seed: 777, tier: 3, affixes: ['drowned'] })).toEqual(
      plan({ seed: 777, tier: 3, affixes: ['drowned'] }),
    );
  });

  it('gives a different dungeon for a different seed', () => {
    const first = JSON.stringify(plan({ seed: 1 }));
    const others = [2, 3, 4, 5, 6].map((seed) => JSON.stringify(plan({ seed })));
    expect(others.some((other) => other !== first)).toBe(true);
  });

  it('records the affixes verbatim, so a plan says what it was started under', () => {
    // Unknown ids included: the plan is a record of the run, not of what this
    // build could make sense of.
    expect(plan({ affixes: ['drowned', 'from-the-future'] }).affixes).toEqual([
      'drowned',
      'from-the-future',
    ]);
  });
});

describe('shape', () => {
  it('goes deeper with tier, never wider', () => {
    expect(floorCountForTier(1)).toBe(BASE_FLOOR_COUNT);
    expect(floorCountForTier(3)).toBeGreaterThan(floorCountForTier(1));

    for (const tier of [1, 2, 5]) {
      for (const floor of plan({ tier }).floors) {
        expect(floor.nodes.length).toBeGreaterThanOrEqual(MIN_NODES_PER_FLOOR);
        expect(floor.nodes.length).toBeLessThanOrEqual(MAX_NODES_PER_FLOOR);
      }
    }
  });

  it('ends: a run must terminate however absurd the tier', () => {
    expect(floorCountForTier(1000)).toBeLessThanOrEqual(MAX_FLOOR_COUNT);
    expect(floorCountForTier(0)).toBe(BASE_FLOOR_COUNT);
    expect(floorCountForTier(Number.NaN)).toBe(BASE_FLOOR_COUNT);
  });

  it('numbers floors from one, in order', () => {
    const depths = plan({ tier: 4 }).floors.map((floor) => floor.depth);
    expect(depths).toEqual(depths.map((_unused, index) => index + 1));
  });

  /*
   * Node ids are what `choosePath(runId, nodeId)` names. Two doors sharing an id
   * would mean picking one and fighting the other.
   */
  it('gives every node in a plan a unique id', () => {
    const ids = plan({ tier: 5 }).floors.flatMap((floor) => floor.nodes.map((node) => node.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every encounter in a plan a unique id, so the run replays in order', () => {
    const ids = plan({ tier: 5 }).floors.flatMap((floor) =>
      floor.nodes.flatMap((node) => node.encounterSpecs.map((spec) => spec.id)),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only ever sends you at creatures from this zone', () => {
    const trash = new Set(zoneById(ZONE)?.trashMobIds ?? []);
    for (const floor of plan({ tier: 5 }).floors) {
      for (const node of floor.nodes) {
        for (const spec of node.encounterSpecs) expect(trash.has(spec.mobId)).toBe(true);
      }
    }
  });

  it('ends the last floor on an elite, because a dungeon needs an ending', () => {
    const dungeon = plan({ tier: 2 });
    const lastFloor = dungeon.floors[dungeon.floors.length - 1];
    expect(lastFloor?.nodes[0]?.kind).toBe('ELITE');
  });

  /*
   * REST and CACHE pay nothing to fight, and that is deliberate: a floor where
   * every door is a fight is a floor you walk through rather than weigh.
   */
  it('puts no fights behind a rest or a cache', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const floor of plan({ seed, tier: 4 }).floors) {
        for (const node of floor.nodes) {
          if (node.kind === 'REST' || node.kind === 'CACHE') {
            expect(node.encounterSpecs).toHaveLength(0);
          } else {
            expect(node.encounterSpecs.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('keeps packs within their authored size', () => {
    for (const seed of [11, 22, 33, 44]) {
      for (const floor of plan({ seed, tier: 5 }).floors) {
        for (const node of floor.nodes) {
          if (node.kind !== 'PACK') continue;
          expect(node.encounterSpecs.length).toBeGreaterThanOrEqual(PACK_SIZE_MIN);
          expect(node.encounterSpecs.length).toBeLessThanOrEqual(PACK_SIZE_MAX);
        }
      }
    }
  });
});

describe('affixes shape the layout', () => {
  it('Starving removes rest entirely, rather than making it rare', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(kindsIn(plan({ seed, tier: 5, affixes: ['starving'] }))).not.toContain('REST');
    }
  });

  it('Hunted plants exactly one stalker, somewhere', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const stalkers = kindsIn(plan({ seed, tier: 4, affixes: ['hunted'] })).filter(
        (kind) => kind === 'STALKER',
      );
      expect(stalkers).toHaveLength(1);
    }
  });

  it('never plants a stalker when nothing is hunting you', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(kindsIn(plan({ seed, tier: 5 }))).not.toContain('STALKER');
    }
  });

  /*
   * The stalker never takes the last floor's first door, or it would eat the
   * ending. There are always at least two doors, so there is always room.
   */
  it('leaves the ending intact even when the stalker lands on the last floor', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const dungeon = plan({ seed, tier: 1, affixes: ['hunted'] });
      const lastFloor = dungeon.floors[dungeon.floors.length - 1];
      expect(lastFloor?.nodes[0]?.kind).toBe('ELITE');
    }
  });

  /*
   * THE PAYOFF OF DRAWING THE STALKER'S FLOOR UNCONDITIONALLY. Adding Hunted to
   * a week changes WHERE the elite is and nothing else about the dungeon, so a
   * week's affixes read as modifiers rather than as a different dungeon.
   */
  it('changes only the stalker when Hunted is added to the same seed', () => {
    const plain = plan({ seed: 909, tier: 4 });
    const hunted = plan({ seed: 909, tier: 4, affixes: ['hunted'] });

    expect(hunted.floors.map((floor) => floor.nodes.length)).toEqual(
      plain.floors.map((floor) => floor.nodes.length),
    );

    const differing = kindsIn(hunted).filter((kind, index) => kind !== kindsIn(plain)[index]);
    expect(differing).toEqual(['STALKER']);
  });

  it('stat affixes do not touch the layout at all', () => {
    expect(plan({ seed: 55, tier: 3, affixes: ['drowned', 'brittle'] }).floors).toEqual(
      plan({ seed: 55, tier: 3 }).floors,
    );
  });
});

describe('the weekly rotation', () => {
  it('is a pure function of the week and the zone', () => {
    expect(affixesForWeek('2026-W37', ZONE)).toEqual(affixesForWeek('2026-W37', ZONE));
  });

  it('gives exactly the authored number of affixes, with no repeats', () => {
    for (const week of ['2026-W01', '2026-W20', '2026-W37', '2027-W03']) {
      const chosen = affixesForWeek(week, ZONE);
      expect(chosen).toHaveLength(AFFIXES_PER_WEEK);
      expect(new Set(chosen).size).toBe(chosen.length);
    }
  });

  it('rotates: a year of weeks is not the same week fifty-two times', () => {
    const weeks = Array.from({ length: 52 }, (_unused, index) =>
      affixesForWeek(`2026-W${String(index + 1).padStart(2, '0')}`, ZONE).join('+'),
    );
    expect(new Set(weeks).size).toBeGreaterThan(1);
  });

  /*
   * PER ZONE, not per world: two zones in the same week run different affixes,
   * so a player with two zones unlocked has a reason to pick one.
   */
  it('can differ between two zones in the same week', () => {
    const weeks = Array.from({ length: 30 }, (_unused, index) => `2026-W${index + 1}`);
    const differs = weeks.some(
      (week) =>
        affixesForWeek(week, 'verdant-wastes').join('+') !==
        affixesForWeek(week, 'some-future-zone').join('+'),
    );
    expect(differs).toBe(true);
  });
});

describe('a retired zone', () => {
  it('yields null rather than an empty dungeon nobody can fight', () => {
    expect(generateDungeon({ zoneId: 'nowhere', tier: 1, affixes: [], seed: 1 })).toBeNull();
  });
});

/**
 * ============================================================================
 * THE SECOND SIX AFFIXES, AND THE THREE THAT CHANGE THE LAYOUT.
 * ============================================================================
 * Five affixes change the creatures and five change the layout. A rotation
 * weighted towards one axis would feel like the same week twice — "everything is
 * tougher again" — where a pair drawn from both reads as a different dungeon.
 */
describe('the layout affixes', () => {
  it('Barren removes caches entirely, the way Starving removes rest', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(kindsIn(plan({ seed, tier: 5, affixes: ['barren'] }))).not.toContain('CACHE');
    }
  });

  it('Starving and Barren together leave a dungeon that is only fights', () => {
    const kinds = kindsIn(plan({ tier: 5, affixes: ['starving', 'barren'] }));
    expect(kinds).not.toContain('REST');
    expect(kinds).not.toContain('CACHE');
    expect(kinds.length).toBeGreaterThan(0);
  });

  it('Teeming puts one more body in every pack', () => {
    const plain = plan({ seed: 31, tier: 4 });
    const teeming = plan({ seed: 31, tier: 4, affixes: ['teeming'] });

    const packsOf = (dungeon: DungeonPlan) =>
      dungeon.floors.flatMap((floor) =>
        floor.nodes.filter((node) => node.kind === 'PACK').map((node) => node.encounterSpecs.length),
      );

    const before = packsOf(plain);
    const after = packsOf(teeming);
    expect(after.length).toBe(before.length);
    for (const [index, size] of after.entries()) expect(size).toBe((before[index] ?? 0) + 1);
  });

  /**
   * THE PAYOFF OF ADDING AFTER THE DRAW rather than widening its range. Widening
   * would move the stream position for every later node, so adding one affix to
   * a week would rearrange the whole dungeon instead of making its packs bigger.
   */
  it('Teeming changes pack sizes and nothing else about the dungeon', () => {
    const plain = plan({ seed: 77, tier: 4 });
    const teeming = plan({ seed: 77, tier: 4, affixes: ['teeming'] });

    expect(kindsIn(teeming)).toEqual(kindsIn(plain));
    expect(teeming.floors.map((floor) => floor.nodes.map((node) => node.id))).toEqual(
      plain.floors.map((floor) => floor.nodes.map((node) => node.id)),
    );
  });

  it('Entombed adds a floor', () => {
    expect(plan({ tier: 2, affixes: ['entombed'] }).floors.length).toBe(
      plan({ tier: 2 }).floors.length + 1,
    );
  });

  /*
   * A run must end, whatever the week is doing to it. The ceiling holds even
   * when a deep tier and Entombed are asking for the same extra floor.
   */
  it('never lets Entombed push a run past the hard ceiling', () => {
    expect(plan({ tier: 50, affixes: ['entombed'] }).floors.length).toBeLessThanOrEqual(
      MAX_FLOOR_COUNT,
    );
  });

  it('still ends the last floor on an elite, however deep Entombed made it', () => {
    const dungeon = plan({ tier: 2, affixes: ['entombed'] });
    expect(dungeon.floors[dungeon.floors.length - 1]?.nodes[0]?.kind).toBe('ELITE');
  });
});

describe('the whole world generates', () => {
  /*
   * A zone whose trash table had a typo would produce dungeons with an
   * unfightable door in them, and the symptom would surface three layers away as
   * a run that cannot be fought.
   */
  it('makes a dungeon for every authored zone', () => {
    for (const zone of ZONES) {
      const dungeon = generateDungeon({ zoneId: zone.id, tier: 3, affixes: [], seed: 5 });
      expect(dungeon).not.toBeNull();

      const trash = new Set(zone.trashMobIds);
      for (const floor of dungeon?.floors ?? []) {
        for (const node of floor.nodes) {
          for (const spec of node.encounterSpecs) expect(trash.has(spec.mobId)).toBe(true);
        }
      }
    }
  });

  it('rotates a different pair of affixes per zone per week', () => {
    const pairs = new Set(
      ZONES.flatMap((zone) =>
        Array.from({ length: 20 }, (_unused, index) =>
          affixesForWeek(`2026-W${index + 1}`, zone.id).join('+'),
        ),
      ),
    );
    // Ten affixes give forty-five distinct pairs; eighty draws must find several.
    expect(pairs.size).toBeGreaterThan(5);
  });
});
