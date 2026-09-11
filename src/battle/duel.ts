/**
 * Hero versus hero: two full combat sheets + a seed -> a replayable `BattleLog`.
 *
 * ============================================================================
 * WHY THIS EXISTS SEPARATELY FROM `simulate`.
 * ============================================================================
 * A duel used to be run through `simulate` by dressing the defender up as an
 * `Encounter`. That works arithmetically — an `Encounter` is a stat block, and
 * a hero can be reduced to one — but it silently DISCARDS two of the six
 * numbers a hero has, because `Encounter` has nowhere to put them:
 *
 *     hp, attack, defence    kept
 *     critPct                LOST — `ENEMY_CRIT_PCT` is 0
 *     regen                  LOST — only the hero regenerates in `simulate`
 *
 * `ENEMY_CRIT_PCT = 0` is the right constant for a MONSTER. Applied to a
 * player it means AGI and SPI — `critPct` is `agi * CRIT_PCT_PER_AGI`, `regen`
 * is `spi * REGEN_PER_SPI` — are worth exactly nothing the moment somebody
 * challenges you. Two of the six earned stats stop existing when you defend,
 * which for the classes built on those stats is most of what their training
 * bought them.
 *
 * So attacking was structurally advantaged, and the advantage was invisible:
 * both fighters' gear was applied, both had real HP and attack, and nothing on
 * screen said that only one of them could crit.
 *
 * ============================================================================
 * WHAT SYMMETRY DOES AND DOES NOT MEAN HERE.
 * ============================================================================
 * Both sides now crit on their own AGI and regenerate on their own SPI, using
 * the SAME strike routine and the same number of RNG draws per blow.
 *
 * What stays asymmetric, deliberately: the CHALLENGER STILL SWINGS FIRST. That
 * is the same bias `simulate` gives the hero, and it is a real edge in a close
 * fight. It is kept because a duel needs somebody to open — the alternative is
 * deciding initiative from a stat, which makes one stat decide close fights
 * outright, or from the RNG, which makes the same two heroes trade wins on the
 * seed alone. Paying stamina to be the one who swings first is a reason to
 * attack rather than wait.
 *
 * The log's `outcome` remains from the CHALLENGER's point of view — `WIN` means
 * the challenger won — because the row is written against the challenger's
 * hero id and `BattleOutcome` has no third value.
 */
import type {
  BattleActor,
  BattleEvent,
  BattleEventType,
  BattleLog,
  BattleOutcome,
  DerivedCombat,
} from '../contracts/types';
import {
  BLOCK_MITIGATION_RATIO,
  CRIT_MULTIPLIER,
  DAMAGE_VARIANCE,
  MAX_TURNS,
  MIN_DAMAGE,
} from './constants';
import { SIM_VERSION } from './version';
import { createRng } from './prng';

/** Integers only reach an emitted event. */
function toInt(value: number): number {
  return Math.max(0, Math.round(value));
}

/**
 * Simulates one hero-versus-hero duel.
 *
 * PURE: both sheets are read and never mutated, and identical arguments always
 * produce a byte-identical log.
 *
 * Turn structure, mirrored on both sides:
 *   1. challenger strikes (variance roll, then crit roll)
 *   2. defender faints -> WIN, battle ends
 *   3. defender strikes back (variance roll, then crit roll)
 *   4. challenger faints -> LOSS, battle ends
 *   5. BOTH regenerate, challenger first, each capped at their own max HP
 *
 * After `MAX_TURNS` the duel ends in `LOSS`, matching `simulate`: the contract
 * has no draw, and a stalemate counting as anything but a loss for the
 * attacker would make challenging someone unkillable a free way to farm.
 *
 * @param challenger The hero who started it. Acts first.
 * @param defender   The hero who was challenged. A FULL sheet, not a stat block.
 * @param encounterId Opaque id recorded on the log — the caller's `hero:<id>`.
 * @param seed       Integer seed for the in-package PRNG.
 */
export function simulateDuel(
  challenger: DerivedCombat,
  defender: DerivedCombat,
  encounterId: string,
  seed: number,
): BattleLog {
  const rng = createRng(seed);

  const heroMaxHp = toInt(challenger.hp);
  const enemyMaxHp = toInt(defender.hp);

  const events: BattleEvent[] = [];
  let heroHp = heroMaxHp;
  let enemyHp = enemyMaxHp;
  let turn = 0;

  /**
   * `heroHp`/`enemyHp` keep their names from `simulate` even though both sides
   * are heroes here, because `BattleEvent` carries those two fields and the
   * renderer reads them. HERO is the challenger; ENEMY is the defender.
   */
  const emit = (actor: BattleActor, type: BattleEventType, amount: number): void => {
    events.push({ turn, actor, type, amount, heroHp, enemyHp });
  };

  /**
   * One blow, in either direction.
   *
   * IDENTICAL TO `simulate`'s strike, and that is load-bearing: two draws per
   * blow, variance then crit, both drawn unconditionally. Skipping the crit
   * roll when `critPct` is 0 would make the stream position depend on a stat,
   * so a defender with no AGI would desynchronise the whole remaining log.
   */
  const strike = (
    attacker: BattleActor,
    attack: number,
    defence: number,
    critPct: number,
  ): void => {
    const variance = 1 + (rng() * 2 - 1) * DAMAGE_VARIANCE;
    const crit = rng() * 100 < critPct;

    const swing = Math.max(
      MIN_DAMAGE,
      Math.round(attack * variance * (crit ? CRIT_MULTIPLIER : 1)),
    );
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

    strike('HERO', toInt(challenger.attack), toInt(defender.defence), challenger.critPct);
    if (enemyHp === 0) {
      emit('ENEMY', 'FAINT', 0);
      emit('HERO', 'VICTORY', 0);
      outcome = 'WIN';
      resolved = true;
      break;
    }

    // The defender crits on their OWN AGI. This is the whole point of the file.
    strike('ENEMY', toInt(defender.attack), toInt(challenger.defence), defender.critPct);
    if (heroHp === 0) {
      emit('HERO', 'FAINT', 0);
      emit('HERO', 'DEFEAT', 0);
      outcome = 'LOSS';
      resolved = true;
      break;
    }

    /*
     * BOTH regenerate, at the END of the turn, each capped at their own max.
     * Challenger first, for the same reason they strike first: one fixed order,
     * so the log is reproducible. Ordering matters only for which REGEN event
     * appears first, since the two heal independently.
     */
    const heroHealed = Math.min(toInt(challenger.regen), heroMaxHp - heroHp);
    if (heroHealed > 0) {
      heroHp += heroHealed;
      emit('HERO', 'REGEN', heroHealed);
    }

    const enemyHealed = Math.min(toInt(defender.regen), enemyMaxHp - enemyHp);
    if (enemyHealed > 0) {
      enemyHp += enemyHealed;
      emit('ENEMY', 'REGEN', enemyHealed);
    }
  }

  if (!resolved) {
    outcome = 'LOSS';
    emit('HERO', 'DEFEAT', 0);
  }

  return { encounterId, seed, simVersion: SIM_VERSION, events, outcome, turns: turn };
}
