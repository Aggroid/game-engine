# ASCEND — PVE World Design

**Date:** 2026-09-12
**Status:** Approved, not yet implemented
**Spans:** `game-engine`, `game-backend`, `game-mobile-app`

---

## 1. Problem

ASCEND currently has nothing for a player to do on a rest day. Training feeds the hero;
the hero then sits idle. This spec adds PVE: a world of zones, dungeons, mobs, rares and
bosses that a player engages with **while not training**.

## 2. The constraint that shapes every decision

The north star is *"World of Warcraft, but the grind is your real training."*

The moment couch-PVE grants stats, that sentence stops being true and ASCEND becomes an
ordinary mobile RPG that happens to read a watch — competing on content volume against
teams of 200, having discarded its only structural advantage.

**Therefore the governing rule of this entire subsystem:**

> **Training is the only tap. PVE is the sink.**

PVE may pay gold, gear rolls, crafting materials, consumables, keys, sigils, cosmetics,
titles and map progress. PVE may **never** pay EP or any of the six stats. A player's
power ceiling is set by real training; PVE is where that power is expressed and spent.

The product consequence is the point: *"I can't beat this boss"* must always resolve to
**go train**.

### 2.1 Secondary constraints inherited from the project brief

- **No farming is possible.** Physiology caps effort at ~5–10 h/week, tightened further by
  `DAILY_SOFT` / `WEEKLY_HARD`. Any design whose loop is "run it twenty times for the drop"
  is dead on arrival.
- **Gear is never obsoleted** (§4.11 of the brief). Bosses cannot drop strictly-better gear
  each tier. They drop *sideways* gear: set pieces whose value is `modalityConversionBonus`,
  not raw power.
- **Authored content is ruinously expensive** for a solo developer. Volume must come from
  generation; authoring is reserved for set pieces.
- **Server simulates, client renders.** The client must never simulate. One mob per HTTP
  round trip is therefore too expensive — encounters are returned in batches.

## 3. Decisions locked in brainstorming (2026-09-12)

1. **Free trash, gated prizes.** Unlimited low-stakes fighting; dungeons, rares and bosses
   are gated by training-earned currencies and wall-clock timers.
2. **Auto-resolved fights, decisions between them.** `simulate()` is reused unchanged. The
   game lives in the run structure — path choice, push-vs-extract, consumables.
3. **Authored zones, procedural dungeons.** ~5 hand-made zones carry identity; dungeon
   interiors are generated from templates plus rotating affixes.

## 4. Structure

    World          "The Known World" — one in v1; seasons may add more later
      └ Zone       authored place: level band, art, tone, trash table, rares, one boss
          └ Site   the four enterable things in a zone
              └ Run  one session inside a site — the new state machine

**Zone is the authoring unit.** Each zone costs: a trash table (~6 mobs), 2–3 named rares,
one authored boss, one dungeon theme. Five zones is a complete v1 world.

### 4.1 The four site types

| Site | Gate | Pays | Job |
|---|---|---|---|
| **Wilds** | none | gold, crafting mats | The app is never empty. Day-one users have something to do before they have trained once. |
| **Dungeon** | Key | gear rolls, sigils, mats | The real loop. Procedural, endlessly replayable. |
| **Rare** | wall-clock timer | set pieces | The unprompted-open hook. Drives push notifications. |
| **Boss** | Sigil | zone set piece, unlocks next zone | The wall that means *go train*. |

Wilds are **batched**: one request resolves a sweep of 6–8 encounters and returns
`BattleLog[]`. This preserves server authority without a round trip per kill.

Bosses are **authored and multi-phase**. A phase is expressed as data — a stat profile
plus a trigger threshold — and resolved as a chain of `simulate()` calls, not as new
simulator logic.

### 4.2 Gating currencies

- **Key** — drops stochastically from training sessions. 1 key = 1 dungeon run.
- **Sigil** — rarer. Drops from dungeon completion and training milestones. 1 sigil = 1 boss attempt.
- **Timer** — rares cost no currency, only attention.

Trash is never gated.

These three currencies are the *entire* coupling between training and PVE, and each is
independently tunable.

## 5. Engine contract change

`RewardKind` (`src/contracts/types.ts`) gains two members alongside `ITEM_DROP`:

    'KEY_DROP' | 'SIGIL_DROP'

Both must be added to the `REWARD_KINDS` runtime list, the zod enum in `schemas.ts`, and
covered by the existing exhaustiveness assertions. `ENGINE_VERSION` bumps; the version is
never reused.

Ledger amounts stay integers. A key or sigil grant is a normal append-only ledger row, so
the fold stays shuffle-invariant and the balance is re-derivable forever.

## 6. New engine module: `src/world/`

Pure, in keeping with every repo invariant — zod only, zero I/O, no clock, no
`Math.random()`, seeds are arguments, tuning lives in one constants file.

    src/world/catalogue.ts    Zone, mob, rare, boss and affix definitions — DATA, like gear/catalogue.ts
    src/world/generate.ts     generateDungeon(zoneId, tier, affixes, seed) -> DungeonPlan
    src/world/encounter.ts    rollEncounter(spec, depth, affixes, seed) -> Encounter
    src/world/constants.ts    THE tuning surface — depth curves, drop odds, affix magnitudes
    src/world/index.ts        public exports

`Encounter` is already flat data (`contracts/types.ts`), so `rollEncounter` only scales
`hp`, `attack` and `defence` by depth and affix. **The simulator is not modified.**

### 6.1 Generation shape

`generateDungeon` returns a plan, never a live run:

    DungeonPlan {
      zoneId, tier, affixes: AffixId[],
      floors: FloorPlan[]          // length from constants, by tier
    }
    FloorPlan {
      depth: number,
      nodes: NodePlan[]            // 2-3 forks presented to the player
    }
    NodePlan {
      id, kind: 'PACK' | 'ELITE' | 'REST' | 'CACHE' | 'STALKER',
      encounterSpecs: EncounterSpec[]
    }

The plan is a pure function of `(zoneId, tier, affixes, seed)`. Given a stored seed the
entire dungeon re-derives identically, forever — same guarantee as quests and drops.

## 7. Affixes

Weekly rotating dungeon modifiers, one line of data each:

- **Drowned** — enemies regenerate 5% max HP per turn
- **Brittle** — all critical hits deal double damage, both sides
- **Starving** — no `REST` nodes are generated
- **Hunted** — a `STALKER` elite appears on one random floor

Ten affixes across five zones with procedural floors produce a world that does not repeat,
for roughly two evenings of work. This is the highest-leverage item in the spec and the
mechanism by which a solo developer out-produces a content team on perceived volume.

Affix selection for a week is a pure function of `(weekKey, zoneId)` — no live-ops action
required to rotate them.

## 8. Run state machine (backend)

Owned by `game-backend`. The only genuinely new system.

    Run {
      id, heroId, siteId, siteKind,
      seed,                        // stored; the run re-derives from it
      floor, heroHp,               // HP carries across encounters
      bag: Consumable[],
      pendingLoot: Loot[],         // NOT banked until extract
      affixes: AffixId[],
      status: ACTIVE | EXTRACTED | WIPED
    }

Three player actions:

- `choosePath(runId, nodeId)` — server rolls that node's encounters from the seed, calls
  `simulate()` once per encounter carrying HP forward, returns `BattleLog[]` plus the next fork
- `useConsumable(runId, itemId)`
- `extract(runId)` — banks `pendingLoot`, closes the run

**Loot is pending until extraction.** Push one more floor, or bank what you have — that
tension is the whole game.

### 8.1 Wipe penalty — PROVISIONAL

On a wipe: **the player keeps 25% of pending loot, and the key is still consumed.**

Rationale: in an ordinary RPG a total loss is fine because the player can grind it back.
Here they cannot — their power came from real training and there is no way to farm out of
a bad night, so a total loss lands disproportionately hard. 25% is a starting value in
`src/world/constants.ts`, to be moved on playtest evidence.

### 8.2 Rare spawn timers — DECIDED

Rare spawns are **per-player windows**, not global server-wide spawns.

*"Gloomstag is roaming your Verdant Wastes for the next 3 hours."*

Global spawns create stronger FOMO but are unfair across timezones and hostile to a small
playerbase, where a single player may find every rare already dead. Per-player windows keep
the notification hook intact and stay fair. Revisit only if the playerbase grows large
enough for contested spawns to feel alive rather than punishing.

## 9. Data model additions (Prisma)

New models alongside the existing `Hero`, `OwnedItem`, `BattleLog`, `RewardEntry`:

- `RunRow` — the state machine above; `pendingLoot` and `bag` as JSON columns
- `HeroCurrency` — key and sigil balances (or derive by folding `RewardEntry`; folding is
  preferred for consistency with the ledger, with a cached balance if reads prove slow)
- `RareSpawn` — per-hero spawn windows: `heroId, zoneId, rareId, opensAt, closesAt, claimedAt`
- `ZoneProgress` — per-hero unlock state and boss-kill record

`BattleLog` rows produced inside a run carry the `runId`, so a whole run is replayable as
an ordered sequence.

## 10. API surface (`game-backend`, existing `app/api/` convention)

    GET  /api/world                      zones, unlock state, currency balances
    GET  /api/world/[zoneId]             sites in a zone, rare windows, gates
    POST /api/world/[zoneId]/sweep       Wilds — batched, returns BattleLog[]
    POST /api/runs                       start a run (spends key or sigil)
    GET  /api/runs/[runId]               current run state
    POST /api/runs/[runId]/path          choosePath -> BattleLog[] + next fork
    POST /api/runs/[runId]/consumable    useConsumable
    POST /api/runs/[runId]/extract       bank pending loot, close run

All request and response bodies validated with zod at the HTTP boundary, per the existing
`src/http/zod.ts` pattern.

## 11. Mobile surface (`game-mobile-app`)

- **World screen** — vertical list of zone cards with unlock state. Deliberately *not* a
  rendered map: cheap in React Native, reads well on a phone, no performance work.
- **Zone screen** — the four site types as cards, each showing its gate and current state
  (keys held, sigils held, rare window countdown).
- **Run screen** — floor indicator, HP bar that carries over, 2–3 path choices, bag, and a
  persistent EXTRACT button showing pending loot value.
- **Battle playback** — reuses the existing `BattleLog` renderer built for duels. No new
  rendering system.

## 12. Non-goals for v1

- No co-operative or party runs
- No real-time world state
- No changes to `simulate()` or `SIM_VERSION` semantics
- No rendered/pannable map
- The **world boss stays exactly as the project brief defines it** — asynchronous pooled
  damage with guild role composition. It is a different system with a different social job
  and must not be folded into this one.

## 13. Build order

Each phase is independently shippable and testable.

1. **`game-engine` — `src/world/`.** Catalogue, `generateDungeon`, `rollEncounter`,
   affixes, constants. Pure and fully unit-testable. Needs no backend and no cloud account.
2. **`game-engine` — contract.** `RewardKind` += `KEY_DROP`, `SIGIL_DROP`; schemas;
   exhaustiveness assertions; `ENGINE_VERSION` bump.
3. **`game-backend` — run state machine.** Prisma models, domain logic in `src/domain/`,
   repositories in `src/repo/`, routes in `app/api/`.
4. **`game-mobile-app` — screens.** World, Zone, Run, reusing the battle playback renderer.
5. **Content pass.** Author Verdant Wastes completely, then clone its shape four times.

## 14. Open items

- Exact depth-scaling curve for `rollEncounter` — belongs in the M0 economy spreadsheet
  alongside the other provisional tuning constants, not guessed in code.
- Whether key and sigil balances fold from `RewardEntry` or live in their own table. Folding
  is more consistent; measure before adding a cache.
