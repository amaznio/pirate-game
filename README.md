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
| Config | `src/game/config/` | `gameRules`, `shipTypes`, `weaponTypes` |
| Events | `src/game/events/EventBus.ts` | Typed pub/sub |
| Phaser | `src/phaser/` | Scenes, views, animations, camera |
| React UI | `src/ui/`, `src/app/`, `src/store/` | HUD, planning sheet, screen |

### Core rules

- Board is `20 x 20`; each entity occupies one cell. Obstacles block movement.
- Movement tokens: `FORWARD`, `TURN_LEFT`, `TURN_RIGHT`. A turn rotates the
  heading 90° **then** advances one cell in the new heading (not rotation in
  place).
- Each ship has **two independent queues** aligned per phase: a movement queue
  (4 slots) and a cannon queue (4 slots). In each phase a ship moves, then
  fires. A cannon slot fires the left broadside, the right broadside, or both.
- Both ships resolve in four phases, with events grouped per phase so they can
  animate together.
- Each planning turn is timed (**30s**, `TURN_DURATION_SECONDS`). When the
  countdown reaches zero the turn is locked in automatically with whatever is
  queued — an empty queue is a valid **pass** (the Pass button does the same).
  The countdown is flow state owned by `GameController`, not the simulation.
- Cannon shots come from a single shared cannonball pool per side (used by
  either broadside); firing one side costs one cannonball, "both" costs two.
  Ammo is deducted by the simulation when a shot resolves; the controller only
  prevents queueing more shots than you hold. Reload is config-driven (`+1` per
  completed turn by default via `CANNON_*` in `config/gameRules.ts`); the pool
  has no upper cap and keeps growing until spent. A shot ray-casts along the
  broadside and the first blocking entity is hit — the simulation decides
  everything, Phaser only visualises.
- A ship that sinks ends the match, but the game-over dialog only appears after
  that turn's animation finishes (the controller stays in `animating` until the
  presentation reports completion).
- Movement tokens are spent when queued and returned when removed. One token is
  produced for each side at the start of every new turn (the player's from the
  deterministic auto rotation or the token you request; the enemy's on a fixed
  rotation). The enemy plans only moves its own pool can afford, so it shares
  the same movement economy as you. Tapping an empty movement slot selects it,
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
