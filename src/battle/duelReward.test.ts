import {
  DUEL_XP_BASE,
  DUEL_XP_MAX_MULTIPLIER,
  DUEL_XP_ZERO_BELOW,
  duelXp,
  duelGold,
  DUEL_GOLD_PER_XP,
} from './duelReward';

/**
 * The rule has to be statable to a player in one sentence: beating someone
 * above you pays more, below you pays less, and five levels below pays nothing.
 * These tests exist to keep that sentence true.
 */

describe('the level gap decides the payout', () => {
  it('pays the base for an even fight', () => {
    expect(duelXp(10, 10)).toBe(DUEL_XP_BASE);
  });

  it('pays MORE for beating somebody above you', () => {
    expect(duelXp(10, 11)).toBeGreaterThan(duelXp(10, 10));
    expect(duelXp(10, 15)).toBeGreaterThan(duelXp(10, 11));
  });

  it('pays LESS for beating somebody below you', () => {
    expect(duelXp(10, 9)).toBeLessThan(duelXp(10, 10));
    expect(duelXp(10, 7)).toBeLessThan(duelXp(10, 9));
  });

  it('rises monotonically with the opponent’s level', () => {
    let previous = -1;
    for (let loser = 1; loser <= 40; loser += 1) {
      const xp = duelXp(20, loser);
      expect(xp).toBeGreaterThanOrEqual(previous);
      previous = xp;
    }
  });
});

describe('the cutoff', () => {
  /**
   * EXACTLY ZERO AT FIVE BELOW, by construction: `DUEL_XP_PER_LEVEL` is
   * `1 / DUEL_XP_ZERO_BELOW`, so the taper reaches zero precisely where the
   * rule says it does rather than somewhere near it.
   */
  it('pays nothing at exactly five levels below', () => {
    expect(duelXp(10, 10 - DUEL_XP_ZERO_BELOW)).toBe(0);
  });

  it('pays nothing any further below', () => {
    for (let below = DUEL_XP_ZERO_BELOW; below <= 30; below += 1) {
      expect(duelXp(20, 20 - below)).toBe(0);
    }
  });

  /** And STILL pays at four below, so the cutoff is a cliff, not a slope to nowhere. */
  it('still pays something at four levels below', () => {
    expect(duelXp(10, 6)).toBeGreaterThan(0);
  });

  it('pays nothing for beating a level-1 as a high-level hero', () => {
    expect(duelXp(50, 1)).toBe(0);
  });
});

describe('the ceiling', () => {
  /**
   * With no level band a level-1 may challenge a level-50 and will almost
   * always lose — but "almost" is not "never", and an uncapped multiplier would
   * make one lucky seed worth more than a month of training.
   */
  it('caps the giant-killing payout', () => {
    expect(duelXp(1, 50)).toBe(DUEL_XP_BASE * DUEL_XP_MAX_MULTIPLIER);
    expect(duelXp(1, 500)).toBe(DUEL_XP_BASE * DUEL_XP_MAX_MULTIPLIER);
  });

  it('reaches the cap only well above an even fight', () => {
    expect(duelXp(10, 11)).toBeLessThan(DUEL_XP_BASE * DUEL_XP_MAX_MULTIPLIER);
  });
});

describe('what the ledger requires', () => {
  /**
   * INTEGERS ONLY. The fold requires them — folding fractional deltas gives
   * order-dependent totals — so a fractional payout would corrupt replay.
   */
  it('is always an integer', () => {
    for (let winner = 1; winner <= 30; winner += 1) {
      for (let loser = 1; loser <= 30; loser += 1) {
        expect(Number.isInteger(duelXp(winner, loser))).toBe(true);
      }
    }
  });

  it('is never negative', () => {
    for (let winner = 1; winner <= 30; winner += 1) {
      for (let loser = 1; loser <= 30; loser += 1) {
        expect(duelXp(winner, loser)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  /**
   * A level reaches this from a ledger fold, and a fold of a corrupt or empty
   * ledger can produce something that is not a number. Paying `NaN` would write
   * a `NaN` ledger row, and one of those makes every LATER fold `NaN` too — the
   * hero's whole history would read as broken, permanently.
   */
  it('pays nothing rather than NaN for a nonsense level', () => {
    expect(duelXp(Number.NaN, 10)).toBe(0);
    expect(duelXp(10, Number.NaN)).toBe(0);
    expect(duelXp(Number.POSITIVE_INFINITY, 10)).toBe(0);
  });

  it('truncates a fractional level rather than propagating it', () => {
    expect(duelXp(10.9, 10.2)).toBe(duelXp(10, 10));
  });
});

describe('gold follows the XP', () => {
  /**
   * ONE CURVE, ONE MULTIPLIER. Two independent curves for the same event drift
   * the first time either is retuned.
   */
  it('pays gold in proportion to the XP', () => {
    for (const opponent of [6, 8, 10, 12, 20]) {
      const xp = duelXp(10, opponent);
      const gold = duelGold(10, opponent);
      if (xp === 0) expect(gold).toBe(0);
      else expect(gold).toBe(Math.max(1, Math.round(xp * DUEL_GOLD_PER_XP)));
    }
  });

  it('pays nothing where the XP pays nothing', () => {
    expect(duelXp(10, 5)).toBe(0);
    expect(duelGold(10, 5)).toBe(0);
  });

  /** Below the XP: training is the main source, and a duel must not out-earn it. */
  it('is worth less than the XP it accompanies', () => {
    expect(duelGold(10, 10)).toBeLessThan(duelXp(10, 10));
  });

  it('never pays a fractional gold', () => {
    for (let opponent = 1; opponent <= 30; opponent += 1) {
      expect(Number.isInteger(duelGold(10, opponent))).toBe(true);
    }
  });

  /** A win that pays zero gold reads as a bug, so anything earned pays at least 1. */
  it('pays at least one gold whenever it pays anything', () => {
    for (let opponent = 6; opponent <= 30; opponent += 1) {
      if (duelXp(10, opponent) > 0) expect(duelGold(10, opponent)).toBeGreaterThanOrEqual(1);
    }
  });
});
