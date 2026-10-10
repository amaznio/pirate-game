# Roadmap

Where Battle Navigation is going: from the current tactical skirmish to a solo
roguelite voyage. This file is the source of truth for the plan; update the
checkboxes and the status line as work lands.

## Decisions

Settled:

- The overworld is **turn-based**. Intercepting a ship starts the existing
  skirmish, which stays the combat engine.
- **Roguelite**: generated routes and areas, plus a few fixed zones (hub port,
  boss lairs, special zones).
- The route map is a **node graph** first. `run-core` models it as a generic
  graph (nodes with coordinates, edges with a cost, region tags) so bigger maps,
  nested graphs or a grid sea can feed it later.
- **No movement tokens on the overworld.** Tokens are a battle resource only.
  The overworld is limited by **Supplies**.
- **Supplies** is one number: a stock with a cargo cap, a cost on every route
  edge, ports that sell more for gold, and ship classes that use different
  amounts. At zero, each leg costs hull instead of ending the run. It lives in
  `run-core`; `game-core` never sees it.
- Skirmish tokens keep the **fixed rotation** (no choose-your-token).
- Bigger ships have more hull, more start tokens, more income and a higher cap;
  small ships stay agile. A rest bonus rewards a turn without moves.
- Bigger ships fire **several cannons per side** through offset lanes (the ship
  stays one cell). Each cannon costs a cannonball.
- Ships can be assembled from the Kenney hull, sail, cannon and flag parts.
- Floating **pickups** (barrels, crates) influence routing.
- Sea monsters with telegraphed attacks.
- **Solo first.** Postgres on Railway for persistence.

## Rules for every phase

- Defaults reproduce today's game: every new field is optional and its absence
  changes nothing.
- The golden snapshots (`golden.test.ts`) must stay green unless a phase
  deliberately changes a rule, in which case the change is reviewed and the
  snapshot updated in the same commit.
- Socket protocol changes are additive only.
- Rules stay in `game-core` (no DOM, React or Phaser) and stay deterministic.
- The database is optional: with no `DATABASE_URL` the server runs as before.
- Each phase is playable from the menu or a default-off setting.

## Phases

Status: `todo`, `doing`, `done`.

### 0. Safety net: `done`
- [x] Roadmap
- [x] Reusable match runner (`packages/game-core/src/testing/matchRunner.ts`)
- [x] Golden event-stream snapshots (`golden.test.ts`, 9 whole-match scenarios)
- [x] Repeatable AI harness (`pnpm harness [--seeds N] [--sea S] [--a L --b L]`)
- [x] CI workflow (`.github/workflows/ci.yml`: typecheck, test, build)

Baseline (`pnpm harness --seeds 40`, normal sea, 80 duels per pairing):

| pairing | A wins | B wins | draws | avg turns | starved |
| --- | --- | --- | --- | --- | --- |
| easy v easy | 39 | 39 | 2 | 11.1 | 5.1% |
| easy v normal | 29 | 46 | 5 | 5.3 | 2.3% |
| easy v hard | 27 | 47 | 6 | 5.5 | 1.9% |
| normal v normal | 26 | 26 | 28 | 5.3 | 3.2% |
| normal v hard | 23 | 32 | 25 | 5.7 | 4.4% |
| hard v hard | 20 | 20 | 40 | 6.5 | 5.7% |

Planning takes about 22 ms per turn for a duel. Finding for phase 1: duels end
in about 5 turns, so the token economy barely bites yet (2 to 6 per cent of
phases are token-starved). The 15 to 25 per cent target only makes sense once
classes make matches longer or tokens scarcer, so re-check the target then.

### 1. Ship classes and token economy: `done`
Bigger ships are stronger overall (the point of upgrading) but keep an
identity: the sloop is light and cheap to run, the brigantine an all-rounder,
the galleon a heavy hull that turns less often.

| Class | Hull | Start tokens | Income | Cap | Rest bonus | Rotation | Supplies/leg | Cargo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sloop | 4 | 6 (3F 2L 1R) | 1 | none | 0 | F L F R | 1 | 8 |
| Brigantine | 5 | 8 (4F 2L 2R) | 2 | 10 | +1 | F L F R | 2 | 12 |
| Galleon | 6 | 10 (6F 2L 2R) | 2 | 12 | +1 | F F L F F R | 3 | 18 |

- [x] Optional token stats on `ShipType` (`tokens`, `supplyUse`, `cargoCap`);
      a missing stat falls back to today's rules, so the sloop is unchanged
      (the 9 original golden snapshots did not change).
- [x] `beginNextTurn` reads income, cap, rest bonus and rotation from the ship
      type; `resolveTurn` records `restedLastTurn`. Rules are derived from the
      ship type at run time and are not stored in `PlayerState`, so nothing
      extra reaches the clients.
- [x] Brigantine and Galleon (single cannon per side until phase 2)
- [x] Tests (`shipEconomy.test.ts`) and 3 new golden scenarios
- [x] Harness: `--classes`, `--ship-a`, `--ship-b`
- [x] Offline menu: "Your ship" and "Their ships"; `?ship=` and `?enemy=` in
      the URL; the token tray shows `held/cap`
- [x] Online lobby: every player picks their own ship (`room:ship`,
      `shipTypeId` on `SeatInfo`), the host picks what the AIs sail
      (`aiShipTypeId` in `RoomOptions`); both are validated on the server and
      cannot change once the match starts. Additive protocol change.
- [ ] Not yet looked at in a browser: the menu and lobby screens have only been
      typechecked, built and unit tested. Worth a quick manual pass.

Class harness (`pnpm harness --classes --seeds 40`, normal AI, 80 duels each):

| pairing | A wins | B wins | draws | avg turns | starved |
| --- | --- | --- | --- | --- | --- |
| sloop v sloop | 26 | 26 | 28 | 5.3 | 3.2% |
| sloop v brigantine | 12 | 63 | 5 | 4.8 | 0.9% |
| sloop v galleon | 7 | 70 | 3 | 5.1 | 1.9% |
| brigantine v brigantine | 22 | 22 | 36 | 7.1 | 0.0% |
| brigantine v galleon | 12 | 61 | 7 | 6.9 | 0.0% |
| galleon v galleon | 25 | 25 | 30 | 7.7 | 0.0% |

Findings: mirror matches are even; a bigger class beats the next one down about
80 per cent of the time (a hull of 9 gave 99 per cent, so hulls were trimmed to
5 and 6). Most of the edge comes from tokens, not hull. Big ships almost never
run out of tokens (starved about 0 per cent), so for them the cap matters more
than income. Phase 2 adds guns and will widen the gap: re-run this table then.
Matches against an equal class last longer (7 to 8 turns).

### 2. Multi-cannon broadsides: `todo`
Mounts with lane offsets, ammo per cannon, preview and AI updates.

### 3. Part-built ship art: `todo`
Cosmetic. Any time after phase 2.

### 4. Pickups: `todo`
Cannonball barrels, token crates, repair planks. "Loot" sea option, default off.

### 5. Match result and carry-over: `todo`
`MatchResult`, optional starting hull, ammo and modifiers. Tokens reset each
battle.

### 6. Battle objectives: `todo`
Merchant interception, survive N turns, salvage race, ambush.

### 7. Solo run, client only: `todo`
New pure `packages/run-core`: seeded node graph, supplies, ports, 1-of-3
upgrades, boss, starvation at zero. Progress kept in `localStorage`.

### 8. Postgres persistence: `todo`
Profile, run history, unlocks, hub shop. Anonymous accounts with a secret token.

### 9. Sea monsters: `todo`
Non-ship entities, telegraphed attack patterns, Kraken boss, hunt node.

### 10. Content: `todo`
More regions, events, relics, fixed zones. Optional grid sea.

### Backlog
Leaderboards (daily seed), co-op voyages, shared world, grid sea.

## Parallel work

Safe to run in separate worktrees: the pieces of phase 0; phase 3 art next to
phases 1 and 2; `run-core` against the phase 5 `MatchResult` shape; the
database layer against an agreed profile interface; monsters (phase 9) next to
runs and the server. Keep phases 1, 2, 4, 5 and 6 sequential: they all edit
`simpleAI.ts`, `GameEvent.ts`, `EventAnimator.ts`, `createGame.ts`,
`matchConfig.ts` and the protocol.

## Log

- 2026-10-10: phase 1 done, 571 tests (game-core 313, client 84, server 174).
- 2026-10-10: phase 0 done: 295 game-core tests (11 new), baseline above.
- 2026-10-10: plan agreed. Baseline at `e65366d`: 529 tests green (game-core
  284, client 77, server 168).
