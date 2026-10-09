# Battle Navigation

A browser-based naval tactics game inspired by Puzzle Pirates Battle
Navigation. Plan four grid moves per turn with the movement tokens you hold,
lock in, and watch the turn resolve — the goal is to out-manoeuvre and sink the
enemy sloop.

This is a small, extensible foundation: a deterministic pure-TypeScript
simulation, a Phaser presentation layer, and a mobile-first React HUD.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # typecheck + production build
npm run test       # run simulation unit tests (Vitest)
npm run typecheck  # tsc --noEmit
```

## How it works

```
React UI (ui/, store/) ──commands──▶ GameController ──▶ Simulation ──▶ TurnResult
                                          │                                 │
                                          │                          domain events
                                          ▼                                 ▼
                                    (state projection)            Phaser animates events
```

The **simulation is the single source of truth**. React and Phaser never keep
their own authoritative copy of the game state:

- React holds a read-only **projection** (`src/store/useGameUIStore.ts`) updated
  by one controller subscription.
- Phaser holds only view objects in a `Map<EntityId, GameObject>`
  (`src/phaser/views/EntityViewRegistry.ts`) and animates simulation events.

`src/game/**` contains **no** React, Phaser, DOM or timers.

## Where things live

| Area | Path | Owns |
| --- | --- | --- |
| Domain | `src/game/domain/` | `GameState`, entities, events, positions, directions |
| Simulation | `src/game/simulation/` | `createGame`, `resolveTurn` (4 phases), movement, collision, combat, damage, tokens |
| Controller | `src/game/controller/GameController.ts` | Flow orchestration only (no rules) |
| AI | `src/game/ai/` | `AIController` interface + `simpleAI` |
| Config | `src/game/config/` | `matchConfig` (who plays, where, rules), `gameRules`, `shipTypes`, `weaponTypes` |
| Events | `src/game/events/EventBus.ts` | Typed pub/sub |
| Phaser | `src/phaser/` | Scenes, views, animations, camera |
| React UI | `src/ui/`, `src/app/`, `src/store/` | HUD, planning sheet, screen |

### Matches, players and teams

A match is data: a `MatchConfig` (`src/game/config/matchConfig.ts`) lists the
participants (player id, team, ship type, spawn, `human` or `ai`), the board
size, obstacles, starting resources and the `rules` (turn timer, friendly
fire). `createGame(config)` turns it into a `GameState`. There is no special
"player" or "enemy": each participant has a `PlayerState` (tokens, cannonballs,
queues, token-generation settings) in `state.players`, commands exactly one
ship, and belongs to a team. A team wins when it is the last with a ship afloat;
if the last ships sink together the match is a draw. Free-for-all is every
player on their own team.

- `createDuelConfig()` is the classic 1v1 (and the default).
- `createSkirmishConfig({ humans, ais, teamMode, width, height })` builds any
  number of ships (spawns are spread around a ring facing the centre).
- Try one from the URL: `?ais=3`, `?ais=3&teams=teams`, `?ais=5&w=30&h=30`
  (see `src/app/matchFromUrl.ts`).

### Core rules

- The default board is `20 x 20` (configurable per match); each entity
  occupies one cell. Obstacles block movement.
- Movement tokens: `FORWARD`, `TURN_LEFT`, `TURN_RIGHT`. A turn is a
  diagonal step: the ship advances one cell forward **and** one cell toward the
  turn side, ending with its heading rotated 90° that way (not rotation in
  place). A turn moves forward first, then sideways, and stops at the first
  blocked cell: a blocked turn still advances as far as it can and always rotates
  toward the turn side, even if it cannot move at all. A blocked `FORWARD` does
  neither.
- Each player has **two independent queues** aligned per phase: a movement
  queue (4 slots) and a cannon queue (4 slots). A cannon slot fires the left
  broadside, the right broadside, or both.
- Turns resolve in four phases, with events grouped per phase so they can
  animate together. **Everything in a phase is simultaneous and no ship has
  priority:** first all ships move, then all ships fire, then all damage lands.
  - Movement conflicts: ships trying to enter the same cell, swapping cells, or
    entering a cell where another ship stays are all stopped (a ship may follow
    one that is leaving its cell; a stopped ship can stop the one behind it).
    The result never depends on the order players are listed in.
  - Fire is cast against the positions after the phase's movement and before any
    of its damage, so ships can sink each other in the same phase (a draw if it
    leaves no one).
  - `friendlyFire` (default off): a shot that reaches a teammate is stopped
    without damage.
- Locking in: a human can lock in their plan, after which it can no longer be
  edited. With `rules.endTurnWhenAllLocked` (default on) the turn resolves the
  moment every human has locked in; otherwise (or when the timer expires) it
  resolves with whatever each player has queued. AI players plan at resolution.
  A plan for another human arrives whole through
  `GameController.submitPlayerPlan(playerId, plan)`, which validates it against
  what that player holds (`simulation/plans.ts`) before locking them in; this
  is the seam a network transport will use. `aiByPlayer` assigns a different AI
  to individual players.
- Each planning turn is timed (**30s** by default, `rules.turnDurationSeconds`,
  `null` disables it). When the
  countdown reaches zero the turn is locked in automatically with whatever is
  queued — an empty queue is a valid **pass** (the Pass button does the same).
  The countdown is flow state owned by `GameController`, not the simulation.
- Cannon shots come from a single shared cannonball pool per player (used by
  either broadside); firing one side costs one cannonball, "both" costs two.
  Ammo is deducted by the simulation when a shot resolves; the controller only
  prevents queueing more shots than you hold. Reload is config-driven (`+1` per
  completed turn by default via `CANNON_*` in `config/gameRules.ts`); the pool
  has no upper cap and keeps growing until spent. A shot ray-casts along the
  broadside and the first blocking entity is hit — the simulation decides
  everything, Phaser only visualises.
- When the match ends, the game-over dialog only appears after that turn's
  animation finishes (the controller stays in `animating` until the
  presentation reports completion).
- Movement tokens are spent when queued and returned when removed. One token is
  produced for each player at the start of every new turn, from that player's
  own settings (the deterministic auto rotation, or the token they request).
  AI players plan only moves their own pool can afford, so everyone shares the
  same movement economy. Tapping an empty movement slot selects it,
  so you can leave earlier phases empty (e.g. move, empty, move, move).

## Extending

- **Add an event**: add a variant to `GameEvent` in `src/game/domain/GameEvent.ts`,
  emit it from a simulation step, and handle it in
  `src/phaser/animation/EventAnimator.ts`.
- **Add a ship type**: add an entry to `src/game/config/shipTypes.ts`.
- **Add a weapon**: add an entry to `src/game/config/weaponTypes.ts` and mount it
  via a ship type's `broadsides`.
- **Tune cannonball economy**: edit `CANNON_*` in `src/game/config/gameRules.ts`
  (start, reload amount/interval), or replace `reloadedAmmo` in
  `src/game/simulation/tokens.ts`. Cannonballs have no upper cap.
- **Change the art**: assets are the Kenney "Pirate Pack" (CC0) in
  `public/assets/kenney/`. Texture keys and frame ids are centralised in
  `src/phaser/assets/AssetKeys.ts` and loaded in `BootScene.ts`; no simulation
  code references filenames. See `src/assets/scallywag/README.md`.

## Controls

- **Pan**: drag (mouse or one finger).
- **Zoom**: mouse wheel or pinch.
- **Recenter**: the ◎ button centres the camera on your ship.
- **Plan preview**: the eye button (or **P**) toggles ghost ships and cannon
  lines for your queued plan. The preview is a dry run of the real simulation
  with the enemy standing still; the setting is saved in `localStorage`.

The board is 20x20 but is drawn inside a decorative ocean margin, and the
minimum zoom always keeps the view filled with water (no empty space).

### Layouts

- **Mobile / narrow** (< 1024px): a bottom sheet. Collapsed, it is a read-only
  strip of your tokens and cannonballs; moves can only be planned in the
  expanded sheet, where the plan is visible.
- **Desktop** (>= 1024px): a fixed right-hand column with hulls, timer, the
  planning controls and a shortcut legend. Shortcuts: `1 2 3` queue
  Left/Forward/Right, `Q`/`E` fire left/right in the phase of your last queued
  move, `Backspace` removes the last move, `C` clears, `Enter` locks in.

## Tests

`src/game/**/__tests__` cover forward/turn movement, edge and obstacle blocking,
token consumption and refund, cannon queueing and the shared cannonball pool
(spend, out-of-ammo block, reload cadence), four-phase ordering, cannon range,
first-blocking entity, misses, damage, destruction, and determinism. Phaser
pixels are intentionally not tested.
