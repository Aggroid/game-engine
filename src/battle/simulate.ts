/**
 * The turn loop: hero + encounter + seed -> a replayable `BattleLog`.
 *
 * THE LOG IS THE PRODUCT. The client never simulates anything; it plays back this event
 * list frame by frame. That is why every event carries the FULL HP state after it resolved
 * rather than a delta — the renderer does no arithmetic, so it cannot disagree with the
 * server, and a battle can be scrubbed, paused or resumed at any event. It is also why the
 * log stores `seed` and `simVersion`: given those, this function re-derives a disputed
 * battle exactly, forever.
 *
 * Determinism rules obeyed here:
 *  - the only randomness is `createRng(seed)`, drawn in a FIXED order per turn;
 *  - both sides draw the same number of values per strike, so the stream position depends
 *    on the turn structure alone and never on which branch a previous roll took;
 *  - all HP and damage are integers, so nothing float-shaped can reach an emitted event.
 *
 * Known v0.1.0 gap: `DerivedCombat.stamina` is derived but not yet consumed — there is no
 * fatigue mechanic in the loop, so END currently has no effect on a fight. Adding one is a
 * `SIM_VERSION` bump, which is exactly why it is called out rather than quietly stubbed.
 */
import type {
  BattleActor,
  BattleEvent,
  BattleEventType,
  BattleLog,
  BattleOutcome,
  Encounter,
  Hero,
} from '../contracts/types';
import {
  BLOCK_MITIGATION_RATIO,
  CRIT_MULTIPLIER,
  DAMAGE_VARIANCE,
  ENEMY_CRIT_PCT,
  MAX_TURNS,
  MIN_DAMAGE,
} from './constants';
import { deriveCombat } from './derive';
import { SIM_VERSION } from './version';
import { createRng } from './prng';

/**
 * Coerces a content-authored number to a non-negative integer.
 *
 * `Encounter` promises integers, but encounters are CONTENT — hand-written or tuned in a
 * spreadsheet — and one fractional HP value in a data file would put a fractional HP into
 * every event of that fight and fail `BattleEventSchema` at the backend boundary. Cheaper
 * to normalise once here than to debug a bad row in production.
 */
function toInt(value: number): number {
  return Math.max(0, Math.round(value));
}

/**
 * Simulates one battle and returns its complete log.
 *
 * PURE: `hero` and `encounter` are read and never mutated, and identical arguments always
 * produce a byte-identical log.
 *
 * Turn structure — hero always acts first, which is a deliberate design bias that makes a
 * marginal matchup winnable and gives the player the opening beat of the animation:
 *   1. hero strikes (damage roll, then crit roll)
 *   2. enemy faints -> VICTORY, battle ends
 *   3. enemy strikes back
 *   4. hero faints -> DEFEAT, battle ends
 *   5. hero regenerates from SPI, capped at max HP
 * After `MAX_TURNS` turns with both sides standing the battle ends in DEFEAT: the contract
 * has no draw, and letting a stalemate count as anything but a loss would make turtling a
 * strategy.
 *
 * @param hero      The attacking hero. Combat values are derived, never read off the hero.
 * @param encounter The opponent, as content data.
 * @param seed      Integer seed for the in-package PRNG. Stored in the log; replaying with
 *                  it reproduces the events exactly.
 * @returns The full `BattleLog`, terminating in a `VICTORY` or `DEFEAT` event.
 */
export function simulate(hero: Hero, encounter: Encounter, seed: number): BattleLog {
  const rng = createRng(seed);
  const combat = deriveCombat(hero);

  const heroMaxHp = combat.hp;
  const enemyAttack = toInt(encounter.attack);
  const enemyDefence = toInt(encounter.defence);

  const events: BattleEvent[] = [];
  let heroHp = heroMaxHp;
  let enemyHp = toInt(encounter.hp);
  let turn = 0;

  /** Appends one beat, stamped with the HP state as it stands right now. */
  const emit = (actor: BattleActor, type: BattleEventType, amount: number): void => {
    events.push({ turn, actor, type, amount, heroHp, enemyHp });
  };

  /**
   * Resolves one blow from `attacker` and emits its beats.
   *
   * Shared by both sides so the two directions of combat cannot drift apart, and so the
   * RNG draws exactly two values per strike whichever side is swinging.
   */
  const strike = (attacker: BattleActor, attack: number, defence: number, critPct: number): void => {
    // Draw order is part of the contract with the seed: variance first, then crit. Both are
    // drawn unconditionally — skipping the crit roll when it cannot land would make the
    // stream position depend on a branch, and every log written before that change would
    // stop replaying.
    const variance = 1 + (rng() * 2 - 1) * DAMAGE_VARIANCE;
    const crit = rng() * 100 < critPct;

    const swing = Math.max(MIN_DAMAGE, Math.round(attack * variance * (crit ? CRIT_MULTIPLIER : 1)));
    // Floored at MIN_DAMAGE so a high-defence opponent slows a fight down instead of
    // stalling it: without this floor, defence >= attack means sixty turns of nothing.
    const damage = Math.max(MIN_DAMAGE, swing - defence);
    const absorbed = swing - damage;

    const defender: BattleActor = attacker === 'HERO' ? 'ENEMY' : 'HERO';
    if (defender === 'ENEMY') {
      enemyHp = Math.max(0, enemyHp - damage);
    } else {
      heroHp = Math.max(0, heroHp - damage);
    }

    emit(attacker, crit ? 'CRIT' : 'ATTACK', damage);
    if (absorbed >= swing * BLOCK_MITIGATION_RATIO) {
      emit(defender, 'BLOCK', absorbed);
    }
    emit(defender, 'HIT', damage);
  };

  let outcome: BattleOutcome = 'LOSS';
  let resolved = false;

  while (turn < MAX_TURNS) {
    turn += 1;

    strike('HERO', combat.attack, enemyDefence, combat.critPct);
    if (enemyHp === 0) {
      emit('ENEMY', 'FAINT', 0);
      emit('HERO', 'VICTORY', 0);
      outcome = 'WIN';
      resolved = true;
      break;
    }

    strike('ENEMY', enemyAttack, combat.defence, ENEMY_CRIT_PCT);
    if (heroHp === 0) {
      emit('HERO', 'FAINT', 0);
      emit('HERO', 'DEFEAT', 0);
      outcome = 'LOSS';
      resolved = true;
      break;
    }

    // Regen resolves at the END of the turn, so a hero can be finished off before it heals:
    // SPI buys attrition, not immortality. Capped at max HP so the log can never show a
    // hero above the HP the client drew its bar from.
    const healed = Math.min(combat.regen, heroMaxHp - heroHp);
    if (healed > 0) {
      heroHp += healed;
      emit('HERO', 'REGEN', healed);
    }
  }

  if (!resolved) {
    // Exhaustion. Nobody fainted, so no FAINT event is emitted — but the log still has to
    // end in a terminal event, because the client's playback state machine only stops on one.
    outcome = 'LOSS';
    emit('HERO', 'DEFEAT', 0);
  }

  return { encounterId: encounter.id, seed, simVersion: SIM_VERSION, events, outcome, turns: turn };
}
