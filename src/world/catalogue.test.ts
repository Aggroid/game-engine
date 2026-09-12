import { hasAffixKind, ZONES, bossPhaseEncounters, bossPhases, bossPhasesAreCoherent, creatureById, creatureRank, zoneById, zonesAreCoherent, AFFIXES, AFFIX_IDS, affixById, CREATURE_IDS } from './catalogue';

/**
 * The world catalogue is CONTENT, and content fails differently from code: a
 * typo in a mob id does not crash, it produces a dungeon with an unfightable
 * door in it, three layers away from the mistake. These tests are the place that
 * catches it.
 */

describe('the catalogue is internally coherent', () => {
  it('has no zone that names a creature it does not have', () => {
    expect(zonesAreCoherent()).toBe(true);
  });

  it('has no boss whose phase shares fail to sum to a whole boss', () => {
    expect(bossPhasesAreCoherent()).toBe(true);
  });

  it('gives every creature a unique id, because ids are forever', () => {
    expect(new Set(CREATURE_IDS).size).toBe(CREATURE_IDS.length);
  });

  it('gives every affix a unique id and player-facing copy', () => {
    expect(new Set(AFFIX_IDS).size).toBe(AFFIX_IDS.length);
    for (const affix of AFFIXES) {
      expect(affix.name.length).toBeGreaterThan(0);
      // The CLIENT renders this. An affix with no description is an affix the
      // player is subjected to without being told what it does.
      expect(affix.description.length).toBeGreaterThan(0);
    }
  });
});

describe('the authored zone', () => {
  const zone = zoneById('verdant-wastes');

  it('exists, and is the reference shape the others were cloned from', () => {
    expect(zone).not.toBeNull();
    expect(ZONES).toHaveLength(4);
  });

  it('carries a full trash table, two rares and one boss', () => {
    expect(zone?.trashMobIds).toHaveLength(6);
    expect(zone?.rareIds).toHaveLength(2);
    expect(creatureRank(zone?.bossId ?? '')).toBe('BOSS');
  });

  it('covers a level band a new hero starts inside', () => {
    expect(zone?.levelMin).toBe(1);
    expect(zone?.levelMax).toBeGreaterThan(zone?.levelMin ?? 0);
  });

  /*
   * The world must not run on a different scale from the fight button. A player
   * who has fought both a Training Dummy and a Thornling has to find them
   * comparable, or the two halves of the game read as two games.
   */
  it('scales its trash roughly in line with the standalone encounter table', () => {
    const thornling = creatureById('vw-thornling');
    expect(thornling?.level).toBe(1);
    // The shipped level-1 encounter is 40 hp / 4 attack / 1 defence.
    expect(thornling?.hp).toBeGreaterThan(20);
    expect(thornling?.hp).toBeLessThan(60);
    expect(thornling?.attack).toBeLessThanOrEqual(6);
  });

  it('rises monotonically in health across its trash table by level', () => {
    const table = (zone?.trashMobIds ?? [])
      .map((id) => creatureById(id))
      .filter((creature): creature is NonNullable<typeof creature> => creature !== null);

    const byLevel = [...table].sort((left, right) => left.level - right.level);
    for (let index = 1; index < byLevel.length; index += 1) {
      expect((byLevel[index] as { hp: number }).hp).toBeGreaterThan(
        (byLevel[index - 1] as { hp: number }).hp,
      );
    }
  });
});

describe('unknown ids degrade rather than throwing', () => {
  /*
   * A run stored last month may name a creature this build has retired. A lookup
   * that threw would turn "one encounter is missing" into "this player's run
   * cannot be opened at all".
   */
  it('returns null for a creature this build does not have', () => {
    expect(creatureById('not-a-creature')).toBeNull();
    expect(creatureRank('not-a-creature')).toBeNull();
    expect(bossPhaseEncounters('not-a-creature')).toBeNull();
  });

  it('returns null for an unknown zone and an unknown affix', () => {
    expect(zoneById('nowhere')).toBeNull();
    expect(affixById('not-an-affix')).toBeNull();
  });

  it('returns no phases rather than throwing for a creature that has none', () => {
    expect(bossPhases('vw-thornling')).toEqual([]);
  });
});

describe('a multi-phase boss becomes a chain of ordinary battles', () => {
  const chain = bossPhaseEncounters('vw-rotcrown');

  it('produces one encounter per authored phase', () => {
    expect(chain).toHaveLength(bossPhases('vw-rotcrown').length);
    expect(chain?.length).toBeGreaterThan(1);
  });

  /*
   * THIS IS WHAT KEEPS PHASES OUT OF THE SIMULATOR. Each phase is a whole
   * battle with its own `encounterId`, so a run replays as an ordered sequence
   * of logs rather than as three logs all claiming to be the same fight.
   */
  it('gives every phase a distinct encounter id', () => {
    const ids = (chain ?? []).map((encounter) => encounter.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('splits the boss into the whole boss, not more and not less', () => {
    const base = creatureById('vw-rotcrown');
    const total = (chain ?? []).reduce((sum, phase) => sum + phase.hp, 0);
    // Rounding per phase means this is close, not exact — within one point per phase.
    expect(Math.abs(total - (base?.hp ?? 0))).toBeLessThanOrEqual(chain?.length ?? 0);
  });

  it('escalates: the last phase hits hardest and armours least', () => {
    const phases = chain ?? [];
    const first = phases[0] as { attack: number; defence: number };
    const last = phases[phases.length - 1] as { attack: number; defence: number };

    expect(last.attack).toBeGreaterThan(first.attack);
    expect(last.defence).toBeLessThan(first.defence);
  });

  it('never starts a phase dead, which would produce an empty battle log', () => {
    for (const phase of chain ?? []) expect(phase.hp).toBeGreaterThanOrEqual(1);
  });

  /*
   * A caller must not have to ask "is this a boss?" before fighting it. A
   * creature with no phases is a one-link chain, which is the right answer for a
   * rare and for a trash mob.
   */
  it('treats a creature with no phases as a chain of one', () => {
    expect(bossPhaseEncounters('vw-gloomstag')).toHaveLength(1);
  });
});

/**
 * ============================================================================
 * THE WHOLE WORLD, AND WHY IT IS ALL ONE SHAPE.
 * ============================================================================
 * A zone that could be "a bit different" is a zone that has to be DESIGNED
 * rather than filled in, and a solo developer cannot afford to design five of
 * anything. These tests are what keep the shape from drifting the next time
 * somebody adds a zone with seven mobs "just for this one".
 */
describe('every zone is the same shape', () => {
  it('gives all four the same budget: six trash, two rares, one boss', () => {
    for (const zone of ZONES) {
      expect(zone.trashMobIds).toHaveLength(6);
      expect(zone.rareIds).toHaveLength(2);
      expect(creatureRank(zone.bossId)).toBe('BOSS');
      expect(zone.dungeonName.length).toBeGreaterThan(0);
    }
  });

  it('names every creature exactly once across the whole world', () => {
    const used = ZONES.flatMap((zone) => [...zone.trashMobIds, ...zone.rareIds, zone.bossId]);
    expect(new Set(used).size).toBe(used.length);
  });

  it('covers levels 1 to 40 with no gap and no overlap', () => {
    const bands = ZONES.map((zone) => [zone.levelMin, zone.levelMax] as const);
    expect(bands[0]?.[0]).toBe(1);
    expect(bands[bands.length - 1]?.[1]).toBe(40);

    for (let index = 1; index < bands.length; index += 1) {
      // Each band starts where the last one ended: 1-10, 10-20, 20-30, 30-40.
      expect(bands[index]?.[0]).toBe(bands[index - 1]?.[1]);
    }
  });

  /**
   * THE CHAIN IS DATA. Each zone's boss opens the next, and the last one points
   * nowhere — which is what lets the client say "this is the edge of the known
   * world" instead of rendering a locked door onto a zone that does not exist.
   */
  it('chains each zone to the next, and ends', () => {
    for (let index = 0; index < ZONES.length - 1; index += 1) {
      expect(ZONES[index]?.nextZoneId).toBe(ZONES[index + 1]?.id);
    }
    expect(ZONES[ZONES.length - 1]?.nextZoneId).toBeUndefined();
  });

  /*
   * A player who has fought the standalone encounters and then the world must
   * not find the two run on different scales. Each band is roughly 2.5x the one
   * before it, which is the step from the level-1 dummy to the level-10 troll.
   */
  it('scales each band above the one before it', () => {
    const topOf = (zoneIndex: number): number => {
      const zone = ZONES[zoneIndex];
      const tops = (zone?.trashMobIds ?? []).map((id) => creatureById(id)?.hp ?? 0);
      return Math.max(...tops);
    };

    for (let index = 1; index < ZONES.length; index += 1) {
      expect(topOf(index)).toBeGreaterThan(topOf(index - 1) * 2);
    }
  });

  it('gives every boss more health than the toughest trash in its zone', () => {
    for (const zone of ZONES) {
      const boss = creatureById(zone.bossId)?.hp ?? 0;
      const worstTrash = Math.max(
        ...zone.trashMobIds.map((id) => creatureById(id)?.hp ?? 0),
      );
      expect(boss).toBeGreaterThan(worstTrash * 2);
    }
  });

  it('escalates every boss through its phases', () => {
    for (const zone of ZONES) {
      const chain = bossPhaseEncounters(zone.bossId) ?? [];
      expect(chain.length).toBeGreaterThan(1);

      const first = chain[0] as { attack: number; defence: number };
      const last = chain[chain.length - 1] as { attack: number; defence: number };
      expect(last.attack).toBeGreaterThan(first.attack);
      expect(last.defence).toBeLessThan(first.defence);
    }
  });
});

/**
 * ============================================================================
 * TEN AFFIXES, SPLIT EVENLY DOWN TWO AXES.
 * ============================================================================
 * Five change the CREATURES and five change the LAYOUT. A rotation weighted
 * towards one axis would feel like the same week twice — "everything is tougher
 * again" — where a pair drawn from both reads as a different dungeon. Ten
 * affixes give forty-five distinct weekly pairs, which is most of the reason a
 * small content set stops repeating.
 */
describe('the affix roster', () => {
  it('has ten', () => {
    expect(AFFIXES).toHaveLength(10);
  });

  it('splits evenly between changing the creatures and changing the layout', () => {
    const layout = AFFIX_IDS.filter((id) =>
      ['NO_REST_NODES', 'NO_CACHE_NODES', 'EXTRA_STALKER', 'BIGGER_PACKS', 'EXTRA_FLOOR'].some(
        (kind) => hasAffixKind([id], kind as never),
      ),
    );
    expect(layout).toHaveLength(5);
    expect(AFFIX_IDS.length - layout.length).toBe(5);
  });

  it('gives every one a name and a sentence the client can render', () => {
    for (const affix of AFFIXES) {
      expect(affix.name.length).toBeGreaterThan(0);
      expect(affix.description.length).toBeGreaterThan(10);
    }
  });
});
