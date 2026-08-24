#!/usr/bin/env node
/**
 * A fake training week, pushed through the engine.
 *
 * No database, no accounts, no network — the whole point of building this repo
 * first. Run with: npm run demo
 */
import {
  normaliseModality, computeEffortPoints, applyRewards,
  foldLedger, levelFromXp, xpForLevel,
  deriveCombat, simulate, createStartingLedger,
  ENGINE_VERSION, SIM_VERSION,
} from '../dist/index.js';

const WEEK = [
  { day: 'Mon', activityType: 'traditionalStrengthTraining', durationSec: 55 * 60, avgHr: 132 },
  { day: 'Tue', activityType: 'running',                     durationSec: 38 * 60, avgHr: 158, distanceM: 7400 },
  { day: 'Wed', activityType: 'walking',                     durationSec: 42 * 60, activeKcal: 180 },
  { day: 'Thu', activityType: 'padel',                       durationSec: 75 * 60, avgHr: 149 },
  { day: 'Fri', activityType: 'functionalStrengthTraining',  durationSec: 50 * 60, avgHr: 128 },
  { day: 'Sat', activityType: 'swimming',                    durationSec: 34 * 60, avgHr: 141, distanceM: 1500 },
  { day: 'Sun', activityType: 'yoga',                        durationSec: 30 * 60 },
];

const hero = {
  id: 'demo', name: 'Ironsong', heroClass: 'WARRIOR',
  level: 1, xp: 0, gold: 0,
  stats: { str: 5, agi: 5, end: 5, vit: 5, foc: 5, spi: 5 },
};

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n  engine ${ENGINE_VERSION}   sim ${SIM_VERSION}`);
console.log(`  ${hero.name} — ${hero.heroClass}, level ${hero.level}\n`);
console.log(`  ${pad('day', 5)}${pad('modality', 16)}${pad('tier', 12)}${pad('EP', 6)}note`);
console.log('  ' + '─'.repeat(58));

// A hero IS a fold of its ledger — including the rows that gave it its starting stats.
const ledger = [...createStartingLedger()];
let epToday = 0, epThisWeek = 0;

for (const [i, s] of WEEK.entries()) {
  const startedAtMs = Date.UTC(2026, 7, 17 + i, 18, 0, 0);
  const activity = {
    activityType: s.activityType,
    durationSec: s.durationSec,
    startedAtMs,
    endedAtMs: startedAtMs + s.durationSec * 1000,
    trustTier: 'DEVICE_VERIFIED',
    ...(s.distanceM  !== undefined ? { distanceM:  s.distanceM }  : {}),
    ...(s.activeKcal !== undefined ? { activeKcal: s.activeKcal } : {}),
    ...(s.avgHr      !== undefined ? { avgHr:      s.avgHr }      : {}),
  };
  const ctx = {
    timezone: 'Europe/Sofia',
    localDate: `2026-08-${String(17 + i).padStart(2, '0')}`,
    epToday: 0,
    epThisWeek,
    maxHr: 187,
    restingHr: 54,
  };

  const effort = computeEffortPoints(activity, ctx);
  const rewards = applyRewards(hero, effort);
  ledger.push(...rewards);
  epThisWeek += effort.ep;

  const note = effort.capReason ? `capped (${effort.capReason})` : '';
  console.log(`  ${pad(s.day, 5)}${pad(effort.modality, 16)}${pad(effort.intensityTier, 12)}${pad(effort.ep, 6)}${note}`);
}

const state = foldLedger(ledger);
const grown = { ...hero, ...state };

console.log('\n  ── after one week ' + '─'.repeat(40));
console.log(`  level ${hero.level} → ${state.level}   xp ${state.xp}/${xpForLevel(state.level + 1)}   gold ${state.gold}`);
const before = hero.stats, after = state.stats;
console.log('  stats ' + Object.keys(after)
  .map((k) => `${k} ${before[k]}→${after[k]}`).join('   '));
console.log(`  ledger entries: ${ledger.length}   total EP: ${epThisWeek}`);

// Order-independence: the property the whole replay story rests on.
const shuffled = [...ledger].sort(() => 0.5 - 0.5);
const reversed = [...ledger].reverse();
const same = JSON.stringify(foldLedger(reversed)) === JSON.stringify(state);
console.log(`  ledger folds identically in reverse order: ${same ? 'yes' : 'NO — REPLAY IS BROKEN'}`);

const combat = deriveCombat(grown);
console.log('\n  ── derived combat ' + '─'.repeat(40));
console.log(`  hp ${combat.hp}   attack ${combat.attack}   defence ${combat.defence}   crit ${combat.critPct}%   regen ${combat.regen}`);

const encounter = { id: 'wolf', name: 'Ridge Wolf', hp: 120, attack: 14, defence: 4, level: 3 };
const log = simulate(grown, encounter, 20260824);

console.log('\n  ── the fight ' + '─'.repeat(45));
for (const e of log.events.slice(0, 8)) {
  console.log(`  t${pad(e.turn, 3)}${pad(e.actor, 7)}${pad(e.type, 9)}${pad(e.amount, 5)}  hero ${pad(e.heroHp, 5)}enemy ${e.enemyHp}`);
}
if (log.events.length > 8) console.log(`  … ${log.events.length - 8} more events`);
console.log(`\n  ${log.outcome} in ${log.turns} turns (seed ${log.seed}, sim ${log.simVersion})`);

const replay = simulate(grown, encounter, 20260824);
const identical = JSON.stringify(replay) === JSON.stringify(log);
console.log(`  same seed replays byte-identically: ${identical ? 'yes' : 'NO — AUDIT TRAIL IS BROKEN'}\n`);
