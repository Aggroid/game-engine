import { createRng } from '../battle/prng';
import type { EncounterSpec } from '../contracts/types';
import { creatureById } from './catalogue';
import { DEPTH_ATTACK_GROWTH, DEPTH_DEFENCE_GROWTH, DEPTH_HP_GROWTH, ENCOUNTER_VARIANCE, RANK_MULTIPLIER, worldTuningIsCoherent } from './constants';
import { rollEncounter, rollNodeEncounters } from './encounter';

const TRASH: EncounterSpec = { id: 'e1', mobId: 'vw-mire-hound', rank: 'TRASH' };
const ELITE: EncounterSpec = { id: 'e1', mobId: 'vw-mire-hound', rank: 'ELITE' };

/** Rolls one encounter from a fresh stream, so each call is independent. */
function roll(spec: EncounterSpec, depth: number, affixes: string[] = [], seed = 1) {
  return rollEncounter(spec, depth, affixes, createRng(seed));
}

describe('the tuning surface is internally coherent', () => {
  /*
   * THE LOAD-BEARING RELATIONSHIP. Variance is one-sided and must not exceed the
   * smallest depth growth, or the luckiest roll on floor 3 could be harder than
   * the unluckiest on floor 4 and "deeper is never weaker" would stop being true.
   * That property is what makes push-or-extract legible, so it is pinned here
   * rather than left as a comment somebody can retune past.
   */
  it('keeps variance inside the depth growth it is bounded by', () => {
    expect(worldTuningIsCoherent()).toBe(true);
    expect(ENCOUNTER_VARIANCE).toBeLessThanOrEqual(
      Math.min(DEPTH_HP_GROWTH, DEPTH_ATTACK_GROWTH, DEPTH_DEFENCE_GROWTH),
    );
  });

  it('grows health faster than damage, so depth costs time before it costs runs', () => {
    expect(DEPTH_HP_GROWTH).toBeGreaterThan(DEPTH_ATTACK_GROWTH);
  });
});

describe('determinism', () => {
  it('produces an identical encounter from an identical seed, forever', () => {
    expect(roll(TRASH, 4, ['drowned'], 12345)).toEqual(roll(TRASH, 4, ['drowned'], 12345));
  });

  it('produces a different encounter from a different seed', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => roll(TRASH, 4, [], seed));
    const distinct = new Set(seeds.map((encounter) => JSON.stringify(encounter)));
    // Not all eight need differ — variance is narrow — but they cannot all agree.
    expect(distinct.size).toBeGreaterThan(1);
  });

  /*
   * THREE DRAWS, ALWAYS, WHATEVER THE INPUT. A draw that happened only on some
   * branches would make the stream position depend on the branch, and every
   * later roll from the same seed would shift. Same discipline the simulator and
   * `rollSessionDrop` already keep.
   */
  it('consumes exactly three numbers regardless of rank, depth or affixes', () => {
    for (const [spec, depth, affixes] of [
      [TRASH, 1, []],
      [ELITE, 9, ['drowned', 'brittle']],
      [TRASH, 5, ['starving', 'hunted']],
    ] as const) {
      let draws = 0;
      const counting = () => {
        draws += 1;
        return 0.5;
      };
      rollEncounter(spec, depth, [...affixes], counting);
      expect(draws).toBe(3);
    }
  });
});

describe('depth', () => {
  it('leaves floor one exactly as the catalogue wrote it, give or take variance', () => {
    const base = creatureById('vw-mire-hound');
    const rolled = roll(TRASH, 1, [], 99);

    expect(rolled?.hp).toBeGreaterThanOrEqual(base?.hp ?? 0);
    expect(rolled?.hp).toBeLessThanOrEqual(Math.round((base?.hp ?? 0) * (1 + ENCOUNTER_VARIANCE)));
  });

  /**
   * THE PROPERTY THAT MATTERS MOST. Across every seed, the same spec one floor
   * deeper is never weaker — that is the promise the run screen makes when it
   * asks "push on, or bank what you have?".
   */
  it('is never weaker one floor deeper, for any seed', () => {
    for (let depth = 1; depth <= 8; depth += 1) {
      for (let seed = 0; seed < 40; seed += 1) {
        const shallow = roll(TRASH, depth, [], seed);
        // The WORST possible roll one floor deeper, against the best here.
        const deeper = rollEncounter(TRASH, depth + 1, [], () => 0);
        const best = rollEncounter(TRASH, depth, [], () => 0.999999);

        expect(deeper?.hp).toBeGreaterThanOrEqual(best?.hp ?? 0);
        expect(deeper?.attack).toBeGreaterThanOrEqual(best?.attack ?? 0);
        expect(shallow).not.toBeNull();
      }
    }
  });

  it('treats a nonsensical depth as floor one rather than as an error', () => {
    const floorOne = rollEncounter(TRASH, 1, [], () => 0);
    expect(rollEncounter(TRASH, 0, [], () => 0)).toEqual(floorOne);
    expect(rollEncounter(TRASH, -5, [], () => 0)).toEqual(floorOne);
    expect(rollEncounter(TRASH, Number.NaN, [], () => 0)).toEqual(floorOne);
  });

  /*
   * LEVEL IS IDENTITY, NOT DIFFICULTY. A mob whose level climbed with depth
   * would make a deep floor of a low-level dungeon pay like high-level content —
   * which is exactly the farming loop this design exists to prevent.
   */
  it('never moves a creature level with depth', () => {
    const base = creatureById('vw-mire-hound');
    for (const depth of [1, 3, 7, 12]) {
      expect(roll(TRASH, depth)?.level).toBe(base?.level);
    }
  });
});

describe('rank', () => {
  it('makes an elite meaningfully harder than the same mob as trash', () => {
    const trash = rollEncounter(TRASH, 3, [], () => 0);
    const elite = rollEncounter(ELITE, 3, [], () => 0);

    expect(elite?.hp).toBeGreaterThan(trash?.hp ?? 0);
    expect(elite?.attack).toBeGreaterThan(trash?.attack ?? 0);
    expect(RANK_MULTIPLIER.ELITE).toBeGreaterThan(RANK_MULTIPLIER.TRASH);
  });
});

describe('affixes', () => {
  it('Drowned makes things take far more killing', () => {
    const plain = rollEncounter(TRASH, 3, [], () => 0);
    const drowned = rollEncounter(TRASH, 3, ['drowned'], () => 0);
    expect(drowned?.hp).toBeGreaterThan(plain?.hp ?? 0);
  });

  it('Brittle raises damage and strips armour, on the enemy side of the ledger', () => {
    const plain = rollEncounter(TRASH, 3, [], () => 0);
    const brittle = rollEncounter(TRASH, 3, ['brittle'], () => 0);

    expect(brittle?.attack).toBeGreaterThan(plain?.attack ?? 0);
    expect(brittle?.defence).toBeLessThan(plain?.defence ?? 0);
  });

  it('stacks two affixes rather than letting the last one win', () => {
    const one = rollEncounter(TRASH, 3, ['drowned'], () => 0);
    const both = rollEncounter(TRASH, 3, ['drowned', 'brittle'], () => 0);

    expect(both?.hp).toBe(one?.hp);
    expect(both?.attack).toBeGreaterThan(one?.attack ?? 0);
  });

  /*
   * A run stored under a newer build may name an affix this engine has never
   * heard of. It must degrade to the affixes it knows, not fail to derive.
   */
  it('skips an affix it does not know instead of refusing the encounter', () => {
    const plain = rollEncounter(TRASH, 3, [], () => 0);
    expect(rollEncounter(TRASH, 3, ['from-the-future'], () => 0)).toEqual(plain);
  });

  it('ignores generation affixes here, because they act on the layout', () => {
    const plain = rollEncounter(TRASH, 3, [], () => 0);
    expect(rollEncounter(TRASH, 3, ['starving', 'hunted'], () => 0)).toEqual(plain);
  });
});

describe('a retired creature', () => {
  it('yields null rather than a NaN encounter', () => {
    expect(roll({ id: 'e1', mobId: 'gone', rank: 'TRASH' }, 3)).toBeNull();
  });

  /*
   * Losing one mob from a pack degrades a run; losing the node strands it. So a
   * node whose creatures have partly been retired still fights.
   */
  it('is dropped from a pack without stranding the whole node', () => {
    const specs: EncounterSpec[] = [
      { id: 'a', mobId: 'vw-thornling', rank: 'TRASH' },
      { id: 'b', mobId: 'gone', rank: 'TRASH' },
      { id: 'c', mobId: 'vw-mire-hound', rank: 'TRASH' },
    ];

    const rolled = rollNodeEncounters(specs, 2, [], createRng(7));
    expect(rolled.map((encounter) => encounter.id)).toEqual(['a', 'c']);
  });
});
