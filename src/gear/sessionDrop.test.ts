import { SESSION_DROP_CHANCE, SESSION_DROP_FULL_EP } from './constants';
import { DROP_CHANCE_PVE, DROP_CHANCE_PVP } from './constants';
import { rollSessionDrop } from './sessionDrop';

/**
 * Gear came only from fighting, which put the most interesting reward in the
 * game behind the half that is not about training.
 */

/** A generator that replays a fixed list, then zeros. Deterministic by design. */
function scripted(...values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('whether a session drops anything', () => {
  it('drops when the effort roll comes in under the chance', () => {
    // First draw decides the drop; the rest pick rarity and item.
    const drop = rollSessionDrop(scripted(0, 0.99, 0), SESSION_DROP_FULL_EP, 40);

    expect(drop).not.toBeNull();
  });

  it('drops nothing when the roll misses', () => {
    expect(rollSessionDrop(scripted(0.99), SESSION_DROP_FULL_EP, 40)).toBeNull();
  });

  it('drops nothing for a session that earned nothing', () => {
    expect(rollSessionDrop(scripted(0), 0, 40)).toBeNull();
    expect(rollSessionDrop(scripted(0), -5, 40)).toBeNull();
    expect(rollSessionDrop(scripted(0), Number.NaN, 40)).toBeNull();
  });

  /**
   * ============================================================================
   * A TEN-MINUTE WALK IS NOT THE SAME LOTTERY TICKET AS AN HOUR UNDER THE BAR.
   * ============================================================================
   * Without this the optimal strategy is many tiny logged sessions, which is
   * both gameable and the opposite of the behaviour the game exists to reward.
   */
  it('scales the chance with the effort', () => {
    // A roll that would hit at full effort must miss at a fifth of it.
    const justUnderFull = SESSION_DROP_CHANCE * 0.9;

    expect(rollSessionDrop(scripted(justUnderFull, 0.99, 0), SESSION_DROP_FULL_EP, 40)).not.toBeNull();
    expect(rollSessionDrop(scripted(justUnderFull, 0.99, 0), SESSION_DROP_FULL_EP / 5, 40)).toBeNull();
  });

  it('does not keep scaling past a full session', () => {
    const atCap = SESSION_DROP_CHANCE * 0.99;

    // Twice the effort is not twice the chance: the scale clamps at 1.
    expect(rollSessionDrop(scripted(atCap, 0.99, 0), SESSION_DROP_FULL_EP * 4, 40)).not.toBeNull();
    expect(rollSessionDrop(scripted(SESSION_DROP_CHANCE, 0.99, 0), SESSION_DROP_FULL_EP * 4, 40)).toBeNull();
  });

  /**
   * The effort roll is drawn UNCONDITIONALLY. A draw that happens only on some
   * branches makes the stream position depend on the branch, and every later
   * roll from the same seed shifts.
   */
  it('always draws exactly one value before deciding', () => {
    let draws = 0;
    const counting = () => {
      draws += 1;
      return 0.99;
    };

    rollSessionDrop(counting, SESSION_DROP_FULL_EP, 40);

    expect(draws).toBe(1);
  });
});

describe('what a session can drop', () => {
  it('never drops grey or orange', () => {
    /*
     * Grey from training would mean most sessions "dropped" something
     * worthless, which is worse than dropping nothing. Orange stays the reward
     * for fighting, so the two sources keep distinct ceilings.
     */
    for (let seed = 0; seed < 200; seed += 1) {
      const rng = scripted(0, seed / 200, seed / 200);
      const drop = rollSessionDrop(rng, SESSION_DROP_FULL_EP, 60);
      if (drop !== null) {
        expect(drop.rarity).not.toBe('POOR');
        expect(drop.rarity).not.toBe('LEGENDARY');
      }
    }
  });

  it('never drops something the hero could not wear', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const drop = rollSessionDrop(scripted(0, seed / 100, seed / 100), SESSION_DROP_FULL_EP, 3);
      if (drop !== null) expect(drop.levelRequirement).toBeLessThanOrEqual(3);
    }
  });

  it('is deterministic for the same draws', () => {
    const a = rollSessionDrop(scripted(0, 0.4, 0.6), SESSION_DROP_FULL_EP, 40);
    const b = rollSessionDrop(scripted(0, 0.4, 0.6), SESSION_DROP_FULL_EP, 40);

    expect(a).toEqual(b);
  });
});

describe('against the combat rates', () => {
  /**
   * BELOW BOTH, DELIBERATELY. A player gets roughly three fights a day against
   * one session. If training dropped at the same rate it would become the
   * efficient way to farm gear, and fighting would stop mattering for loot —
   * the one thing it is best at, now that XP and gold lean towards training.
   */
  it('drops less often than fighting does', () => {
    expect(SESSION_DROP_CHANCE).toBeLessThan(DROP_CHANCE_PVE);
    expect(SESSION_DROP_CHANCE).toBeLessThan(DROP_CHANCE_PVP);
  });
});
