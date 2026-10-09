# Battle Navigation

A browser-based naval tactics game inspired by Puzzle Pirates Battle
Navigation. Plan four grid moves per turn with the movement tokens you hold,
lock in, and watch the turn resolve — the goal is to out-manoeuvre and sink the
enemy sloop.

This is a small, extensible foundation: a deterministic pure-TypeScript
simulation, a Phaser presentation layer, and a mobile-first React HUD.

## Repo layout

This is a pnpm workspace (Node 22+; `corepack enable` or `npm i -g pnpm`).

| Path | What it is |
| --- | --- |
| `packages/game-core` | Rules, simulation, AI, host controller, views and client logic. No DOM, React or Phaser. Imported as `@pirate/game-core/...`. |
| `apps/client` | The browser app: React HUD + Phaser board (Vite). |
| `apps/server` | The game server: rooms, lobby and one authoritative match per room, over Socket.IO. |

## Quick start

```bash
pnpm install
pnpm dev           # client at http://localhost:5173
```

Scripts (run from the repo root):

```bash
pnpm dev             # client (:5173) and server (:3001) together
pnpm dev:client      # just the client
pnpm dev:server      # just the server (restarts on change)
pnpm build           # typecheck + production build of every package
pnpm test            # all unit tests (Vitest)
pnpm typecheck       # tsc --noEmit in every package
pnpm build:client    # build only the client  -> apps/client/dist
pnpm start:client    # serve that build on $PORT (default 4173)
pnpm build:server    # bundle the server -> apps/server/dist/index.js
pnpm start:server    # run that bundle on $PORT (default 3001)
```

`pnpm start:client` runs `apps/client/scripts/serve.mjs`, a tiny dependency-free
static server (single-page-app fallback, long caching for hashed files only).
It reads `PORT`, which is how Railway tells a service where to listen.

## The game server

`apps/server` runs matches for people on different machines. It speaks Socket.IO
and plays the **host** role from the diagram below: one `GameController` per
room, seeing every plan, while each player only ever receives their own redacted
view. The wire protocol (event names, payloads, limits) lives in
`packages/game-core/src/protocol/`, shared by server and client so they cannot
drift apart.

Flow of a match:

1. A player sends `room:create` and gets a 5-letter room code, a seat id and a
   **secret token** (keep it to rejoin the seat). Friends send `room:join`.
2. The host tunes the room with `room:configure` (AI count, free-for-all or
   teams, turn timer) and sends `room:start`. Everyone connected becomes a human
   player (`p1`, `p2`, ...); the AIs fill the rest.
3. During planning each client sends `game:draft` (work in progress) and
   `game:lockIn` (final plan). The server validates every message, then replies
   with `game:view` (that player's redacted view) after every change.
4. When the turn resolves everyone gets `game:turn` (the public events to
   animate) and answers `game:ack` when done; the next turn starts when all
   connected players have.
5. A dropped player keeps their seat. `room:rejoin` with the seat id and token
   restores their view, their draft and the turn being animated.

Nothing a client sends is trusted: payloads are shape-checked
(`protocol/validate.ts`), plans are checked against what the player really holds
(`simulation/plans.ts`), and a connection that floods the server is dropped.

Matches live in memory, so run **one instance** of the server; a restart ends
running matches. Empty rooms are swept after a while, finished ones right away.

Configuration (environment variables, see `apps/server/.env.example`):

| Variable | Meaning | Default |
| --- | --- | --- |
| `PORT` | Port to listen on (Railway sets it) | `3001` |
| `CLIENT_ORIGIN` | Allowed browser origin(s), comma separated | `http://localhost:5173` |
| `MAX_ROOMS` | Most rooms alive at once | `100` |
| `IDLE_ROOM_MINUTES` | How long an empty room is kept | `10` |

`GET /health` returns `{"status":"ok","rooms":N,...}` (use it as the Railway
health check). The server stops cleanly on `SIGTERM`.

## Playing

Open the client and pick a mode on the menu:

- **Play against the computer** (1 to 7 AI opponents) runs the whole match in
  your browser; no server needed. Developer shortcuts still work: `?ais=3`,
  `?ais=3&teams=teams`, `?ais=5&w=30&h=30` start such a match straight away.
- **Play with friends** needs the game server. *Create a room* and share the
  5-letter code, or the **Copy link** button (the link `?room=CODE` fills in the
  code for whoever opens it). The host sets the AI count, free-for-all or teams
  and the planning timer, then starts the match. Your seat is remembered, so a
  refresh (or a dropped connection) puts you back in the match.

To try online play on one machine run `pnpm dev`, then open the client in two
different browsers (or `localhost` in one and `127.0.0.1` in the other; each
origin is its own player, because the seat is saved per origin). For a second
origin set `CLIENT_ORIGIN` on the server, e.g. `CLIENT_ORIGIN=* pnpm dev`.

The client finds the server through `VITE_SERVER_URL` (see
`apps/client/.env.example`). In development it defaults to port 3001 on the
page's own host; a production build with no `VITE_SERVER_URL` simply has online
play switched off.

How the client plays online (`apps/client/src/online/`): `OnlineSession` owns
the connection, the lobby and the remembered seat, and rejoins automatically
after a drop; `SocketTransport` is the transport the match runs on. It shares
your draft shortly after you stop editing, holds back a lock-in it could not
send until the seat is restored, and never plays a turn twice when the server
replays it after a reconnect.

## How it works

```
 HOST (authoritative; later a Node server)          CLIENT (one per player)
 ┌──────────────────────────────────────┐           ┌──────────────────────────┐
 │ GameController ─▶ Simulation          │  redacted │ GameClient               │
 │  • timer, AIs, lock-in, validation   │  view  ─▶ │  • local draft plan      │
 │  • sees every plan                   │ ◀─ plans  │  • view + events         │
 └──────────────▲───────────────────────┘           └───────┬──────────────────┘
                │         GameTransport                     │
                └──── LocalTransport (in page) / socket ────┘   React UI + Phaser
```

The **simulation is the single source of truth**, and it runs on the host. A
player never gets the host's state, only a **view** of it:

- `packages/game-core/src/view/redact.ts` builds a `GameView` per player. The board is public
  (ships, hulls, obstacles) but other players' plans, tokens, cannonballs and
  settings are dropped. All a player learns about someone else's plan is an
  `activity` number (0 to 1) saying how busy it looks, weighted in
  `config/gameRules.ts`. The turn timer is sent as seconds remaining, not a
  timestamp, so clocks do not need to agree.
- `packages/game-core/src/client/GameClient.ts` owns the **draft plan**. Editing it (queueing
  tokens, toggling cannons) is instant and local; the host is sent the draft
  (so it survives a reconnect and drives the activity bar) and, on lock-in, the
  final plan, which it **validates against what the player really holds**.
  Movement tokens are only spent when the turn resolves.
- `packages/game-core/src/client/GameTransport.ts` is everything a client needs from a host.
  `LocalTransport` runs the host in the same page and behaves like a network
  connection (views out, whole plans in). A socket transport replaces it later;
  React and Phaser would not change.
- React holds a read-only projection (`apps/client/src/store/useGameUIStore.ts`) of the
  client. Phaser holds only view objects in a `Map<EntityId, GameObject>`
  (`apps/client/src/phaser/views/EntityViewRegistry.ts`) and animates events.

`packages/game-core/src/**` contains **no** React, Phaser or DOM.

### What you see

- **Teams look different.** `apps/client/src/presentation/teamStyle.ts` gives every team a
  colour and ship sails (your team is always blue). Players have a `name` (from
  the `MatchConfig`); avatars show its initials.
- **Avatars** float above each ship: a team-coloured badge, hull pips, an
  activity bar (how busy another player's plan looks, never what it holds) and a
  tick once they lock in. They keep a constant on-screen size at any zoom, and
  hull pips follow the damage as it animates.
- **Off-screen indicators** sit on the edge of the view for ships you cannot see:
  the badge, an arrow and the distance in tiles. Click one to pan to that ship.
  They stay clear of the HUD and the planning sheet.
- **Spectating:** once your ship sinks you keep watching. You no longer hold up
  the turn, and if every human is out the remaining ships play on without
  waiting for the timer.

## Where things live

| Area | Path | Owns |
| --- | --- | --- |
| Domain | `packages/game-core/src/domain/` | `GameState`, entities, events, positions, directions |
| Simulation | `packages/game-core/src/simulation/` | `createGame`, `resolveTurn` (4 phases), movement, collision, combat, damage, tokens |
| Controller | `packages/game-core/src/controller/GameController.ts` | Flow orchestration only (no rules) |
| AI | `packages/game-core/src/ai/` | `AIController` interface + `simpleAI` |
| Config | `packages/game-core/src/config/` | `matchConfig` (who plays, where, rules), `gameRules`, `shipTypes`, `weaponTypes` |
| Events | `packages/game-core/src/events/EventBus.ts` | Typed pub/sub |
| Phaser | `apps/client/src/phaser/` | Scenes, views, animations, camera |
| React UI | `apps/client/src/ui/`, `apps/client/src/app/`, `apps/client/src/store/` | HUD, planning sheet, screen |

### Matches, players and teams

A match is data: a `MatchConfig` (`packages/game-core/src/config/matchConfig.ts`) lists the
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
  (see `apps/client/src/app/matchFromUrl.ts`).

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
  resolves with whatever each player has stored. AI players plan at resolution.
  The host stores a human's plan through `submitDraft` (work in progress) and
  `submitPlayerPlan` (final, locks in), both validated by
  `simulation/plans.ts`. `aiByPlayer` assigns a different AI to individual
  players. The next turn begins once every connected client has finished
  animating the last one (`acknowledgeTurn`).
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
- Queueing a movement token only reserves it in your draft; tokens are spent when
  the turn resolves. One token is
  produced for each player at the start of every new turn, from that player's
  own settings (the deterministic auto rotation, or the token they request).
  AI players plan only moves their own pool can afford, so everyone shares the
  same movement economy. Tapping an empty movement slot selects it,
  so you can leave earlier phases empty (e.g. move, empty, move, move).

## Extending

- **Add an event**: add a variant to `GameEvent` in `packages/game-core/src/domain/GameEvent.ts`,
  emit it from a simulation step, and handle it in
  `apps/client/src/phaser/animation/EventAnimator.ts`.
- **Add a ship type**: add an entry to `packages/game-core/src/config/shipTypes.ts`.
- **Add a weapon**: add an entry to `packages/game-core/src/config/weaponTypes.ts` and mount it
  via a ship type's `broadsides`.
- **Tune cannonball economy**: edit `CANNON_*` in `packages/game-core/src/config/gameRules.ts`
  (start, reload amount/interval), or replace `reloadedAmmo` in
  `packages/game-core/src/simulation/tokens.ts`. Cannonballs have no upper cap.
- **Change the art**: assets are the Kenney "Pirate Pack" (CC0) in
  `apps/client/public/assets/kenney/`. Texture keys and frame ids are centralised in
  `apps/client/src/phaser/assets/AssetKeys.ts` and loaded in `BootScene.ts`; no simulation
  code references filenames. See `apps/client/src/assets/scallywag/README.md`.

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

`packages/game-core/src/**/__tests__` cover forward/turn movement, edge and obstacle blocking,
token consumption and refund, cannon queueing and the shared cannonball pool
(spend, out-of-ammo block, reload cadence), four-phase ordering, cannon range,
first-blocking entity, misses, damage, destruction, and determinism. Phaser
pixels are intentionally not tested.
