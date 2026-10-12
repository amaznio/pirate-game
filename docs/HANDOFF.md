# Handoff: where the project stands and how to carry on

Written at the end of a long working session (2026-10-12) so a fresh session can
continue without the old conversation. `docs/ROADMAP.md` is the plan and its
checkboxes are the source of truth for phases; this file adds what the roadmap
does not hold: what was built and why, how the user likes to work, what to
avoid, and what to do next.

## 1. The project in a paragraph

Battle Navigation is a grid-based pirate naval tactics game. A pnpm monorepo:
`packages/game-core` (pure TypeScript simulation, AI, protocol, no DOM),
`apps/client` (React HUD plus a Phaser board, Vite), `apps/server` (Node,
Socket.IO rooms, deployed to Railway). Players plan four moves a turn in
secret; all ships resolve simultaneously, in four phases (move, then the sea
acts, then fire, then damage). Single-player runs in the page against AI;
online play uses rooms on the server. The long-term goal (see the roadmap) is a
solo roguelite voyage built on the same battle engine.

Commands: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm dev` (client on
5173, server on 3001; set `CLIENT_ORIGIN='*'` to use two origins), `pnpm
harness` (AI balance), `pnpm smoke --server URL [--client URL]` (checks a
deployment). All three test suites and both builds were green at the end:
game-core 356, client 189, server 174.

## 2. What was built, in order, and why

### Before the roadmap (all committed and pushed earlier)
- UI: a collapsible planning panel on mobile, a desktop right-hand column,
  map bounds, ghost-path plan preview (setting, saved in localStorage).
- Movement rules: a turn token is a diagonal step ("up + left"), a blocked turn
  still rotates toward the turn side, and the AI uses the same rules as
  everyone (one resolver, `resolveMovementPhase`).
- Multiplayer architecture: teams, simultaneous resolution, redacted per-player
  views, a host/client split with a transport (`LocalTransport`,
  `SocketTransport`), avatars above ships and off-screen indicators.
- A Node game server: rooms, lobby, reconnect with secret seat tokens, an AI
  that takes over for an absent player, flood and origin checks, `/health`.
- Railway deployment: shared monorepo, one replica only, `VITE_SERVER_URL`
  baked in at build time, `docs/DEPLOY.md`, a smoke test.
- AI rewrite: whole-turn planning (up to 256 plans), a breadth-first
  "steps to a firing position" heuristic, Easy/Normal/Hard profiles, seeded RNG.
- Public/private rooms: private rooms are joined by an 8-letter key (the short
  5-letter code never opens them, because it is guessable), public rooms are
  listed by `GET /rooms` and joined by code, failed joins are throttled.

### The sea and board (this session, committed, 6 phases)
The user asked for generated boards with rocks (no islands), wind that pushes a
ship, and whirlpools that spin it. Decisions they made: no island tiles;
whirlpools are 2x2 vortices that carry a ship round the ring and turn it a
quarter; wind pushes **one cell per phase** (it does not chain in one phase; a
ship still on wind is pushed again next phase); boards are random, not
symmetric; a Calm/Normal/Stormy "Seas" setting; every match gets a random seed.
- Phase 1 (rules): terrain in `GameState`, `SHIP_PUSHED`/`SHIP_SPUN` events,
  one resolver, preview and AI inherit it.
- Phase 2 (generator, `board/generateBoard.ts`): rocks as single stones, clumps
  up to 2x3 and thin winding ridges, separate from each other, never cutting
  the water, spawns kept clear; wind lanes; whirlpools.
- Phase 3 (wiring): seeds, `sea` option, lobby and menu setting, `?seed=`,
  `?map=`.
- Phase 4 (rendering), Phase 5 (AI aware of terrain, rocks indexed by cell
  which cut planning from 55 ms to 13 ms), Phase 6 (docs, smoke test, a leak
  fix: rooms whose players all left are swept at once).
- Lessons kept: `createGame()` with no config and the controller default are a
  duel on **open water** (old tests had silently depended on a generated board);
  Hard AI beats Normal on generated boards but only barely beats Easy (an open
  AI-tuning question, not fixed).

### Roadmap phases 0 to 2 (done in a parallel session; see ROADMAP.md)
Safety net (golden snapshots, match runner, harness, CI), ship classes with
their own token economy, multi-cannon broadsides (all cannons fire from the
ship's own cell, the player picks how many).

### Roadmap phase 3, the Scallywag art swap (this session; mostly done)
Now the default art (`?art=kenney` brings the old Kenney art back). All pure logic is
tested; all look-and-feel was judged by eye. Done: ships (padded sheet so no
neighbouring frame shows), stones for rocks (3x, 2x for the smallest, never
rotated), pixel wind and whirlpools (animated by swapping frames), cannon
fire, impacts and a wake (flipped so the flare trails behind the stern), a
whole-step pixel camera (free dragging, 40 tiles of sea), the sea (below), and
in the latest stretch: a sinking explosion, plan-preview ghosts in pixel style,
a faint footprint under every ship (the large hull is two cells long and drawn
at native size, so the footprint shows which cell it holds), yards and sail
emblems (your ship wears the skull), and the Calm/Normal/Stormy look.

Cell size question, settled: tiles stay 64 px and ships stay at native size;
scaling the tiles up to the largest ship would double the board on screen and
need every other sprite redone, and fractional ship scales blur pixel art.

### Localisation (i18n) — a later session; new phase 3b in ROADMAP.md
The client can show English, Spanish or Polish (the last two are machine-drafted
stubs). `i18next` plus `react-i18next` live in `apps/client/src/i18n/`; nothing
in `game-core`, the server rules or the golden snapshots changed. `locales/en.json`
is the source of truth, `i18next.d.ts` types the keys (a typo or missing key
fails `pnpm typecheck`), and a test checks every locale has the English keys with
plural forms matched. Polish has four plural forms (`_one`/`_few`/`_many`/`_other`),
which the parity test normalises. The language is chosen from `?lang=`, then the
remembered choice (`pirate:lang`), then `navigator.language`, then English;
`<html lang>` and the page title follow, and a switcher sits in the menu. All
menu, lobby, in-battle HUD and planning text is extracted (aria labels and titles
too); ship names/descriptions come from the catalog by id with the game-core
config as fallback. Server and plan messages are translated by their stable code
(`ErrorCode`, `PlanRejection`, and an optional `code` on the `room:closed` event)
with the server's English text as the fallback; the socket protocol gained only
that optional field. To add a language: copy `en.json`, translate it, and add the
code and label to `LANGUAGES` in `i18n/languages.ts`.

### Roadmap phase 4, pickups (a later session)
Barrels, crates and planks behind a default-off Loot option (menu and lobby
toggle, `?loot=on`). Rules, generator, AI, wiring, art and docs are in; see
ROADMAP.md phase 4 for the detail. In short: a ship collects a pickup by
**ending a phase** on its cell; barrel +3 ammo, crate +2 tokens, plank +1 hull;
no respawn; the opponent sees them. It was only glanced at in a browser
(Canvas), so the pop, the "+n" and the bob want an eye.

### Roadmap phase 5, match result and carry-over (a later session)
A finished match now yields a `MatchResult` (outcome, turns, each ship's hull, ammo, tokens and pickups taken), sent on the view only at `game_over` and shown as a small summary on the game-over screen. A match can start ships with a carried hull, ammo and a cannon-damage modifier through an optional `carryOver` on `MatchConfig`. By the user's decision it is **not reachable from a URL, the lobby or the socket**, so it cannot be cheated: keep it that way. See ROADMAP.md phase 5.

### Roadmap phase 6, battle objectives and a token rework (a later session)
Slices A to D are in (survive N turns, a salvage race, AI that plays to them, and the merchant); slice E (ambush) is open. Along the way the token economy was raised and rebuilt: tokens are made to fit the hold's mix per class and swap at the cap instead of being refused; the class ladder was rebalanced through ammo and reload (hulls stayed 4, 5, 6); the easy AI was weakened; see ROADMAP.md phase 1 "Token economy revisited". Play feedback from the user: too much ammo speeds games up, and a ship with 3 cannonballs per shot regaining 1 a turn feels bad late in a match, but it was kept for now. The cargo race (salvage) mostly ends by sinking; the user said to leave that for later.

## 3. The sea, and why it ended up this way

Three versions were rejected by the user, which is why the final design is what
it is. Keep that history; do not reintroduce them as defaults.
1. Tiled 32x32 water (dashes, then wave lines): "repeated texture", "bubbles".
   One small tile repeated every cell.
2. Noise-contour lines scrolled across the sea: "a static line moving in one
   direction", busy, and swell and chop clashed.
3. Soft moving swell bands: too close to the depth patches, depth got lost, and
   the user asked to turn them off.

Final (default): `SeaView` + `RippleField` + `SurfView`.
- **Depth** (`assets/seaDepth.ts`): non-repeating fractal noise bent by a warp
  field, shallower round every rock (a pale shelf), deeper round every
  whirlpool, open sea past the board edge, four levels with a light Bayer
  dither. Computed on a coarse grid in blocks (about 10 ms; the per-pixel first
  version took 0.9 s). Static: the user said depth must not move.
- **Ripples** (`assets/ripplePixels.ts`, `views/RippleField.ts`): 420 small
  marks (dash 9 px, arch 13, wide arch 17) that grow, hold, shrink and vanish
  in place, then reappear elsewhere; they lie across the swell direction.
- **Surf** (`assets/surfPixels.ts`, `surfTextures.ts`, `views/SurfView.ts`): a
  halo of shallows and four steps of foam traced from each stone's outline,
  arriving in the swell direction, a cell a second.
- The swell direction is one of **four straight** directions chosen from a hash
  of the board, so all players see the same sea.
- **The look follows the Seas setting.** The choice is an optional `sea` on the
  match config, the game state and the view (so online players get it too;
  absent means normal). `assets/seaLook.ts` turns it into a palette, ripple
  count and wait, white-caps (stormy only) and surf speed. Open water looks
  calm. Texture names carry a palette tag so a second match cannot reuse the
  first one colours.
- **A slow tide** (48 s) fades the shallows round rocks and drops the outer foam
  ring at low water.
- **Spray is built but off** (`spray: 0` in `seaLook.ts`): the user found it
  distracting and too busy, even with short hops. Do not turn it on unasked.

Switches: `?art=kenney` (old art), `?sea=lines` (older line sea), `?bands=on` (soft
swell stripes, off by default), `?water=pack` (the pack's own bright tiles),
`?lab=art` (art lab page), `?seed=N&map=calm|normal|stormy|open`, `?ais=N`,
`?ship=` and `?enemy=` (ship classes).

## 4. Git state at the end of the session

On `main`, tracking `origin/main`. Everything is pushed, including the phase 3
art commits (`cc93317`, `dc8389b`, `c63477e`, `e149fc1`, `a3a3a7b`, `a46f575`,
`2bdd578` docs) and the i18n work (phase 3b, the commit that carries this file).
Still ask before pushing new work.

`PhaserGame.ts` sometimes shows as modified with no real change; it is a
CRLF/timestamp artefact, `git add` clears it.

## 5. How the user likes to work (follow this)

- They ask for **planning first**, answer with numbered "defaults", then say
  "start". Give a concrete plan with defaults and open questions, then wait.
- Commit only when asked ("Commit and move on", "Commit and push"). Never
  push unasked. Use the Co-Authored-By trailer given in the session.
- They judge **visuals by eye** and iterate quickly with short complaints
  ("looks like bubbles", "too busy"). Make a change, say honestly what I could
  and could not see, and offer the named constants to tune. When unsure,
  provide a switch (`?sea=`, `?bands=`) to compare instead of replacing.
- When asked to commit part of the work, stage only that part and test the
  staged state alone (`git stash --keep-index`), then restore.
- State plainly what is unverified (anything about real WebGL rendering).

## 6. Gotchas for this machine and these tools

- **Bash heredocs break on apostrophes** (including in code comments and test
  names). Write files with the Write tool, or write a Python script file with
  the Write tool and run it. Use `PYTHONUTF8=1` for Python that writes files.
- **Windows line endings:** `core.autocrlf` is true; the repo stores LF, the
  working tree CRLF. When building index blobs with Python use **bytes**, not
  text mode, or every line changes.
- **The in-app browser cannot run WebGL.** To look at the game temporarily
  switch `Phaser.AUTO` to `Phaser.CANVAS` in `apps/client/src/phaser/PhaserGame.ts`
  and `lab/mountArtLab.ts` (mark it `// TEMP-VERIFY`), **revert it before
  finishing**, and `grep -rn TEMP-VERIFY apps packages`. The Canvas renderer
  draws the water paler than the real game.
- **A hidden browser pane stops animation frames.** To test animation, expose
  the game on `window` temporarily and call `game.step(time, 16)` in a loop,
  then take a screenshot.
- A stray dev server may hold port 5173; `preview_start` can refuse it. Just
  navigate to it. Stop servers you start (`netstat -ano | grep :5173`).
- Textures cut from one sheet bleed into each other when a sprite sits on a
  fractional pixel or is rotated: use padded copies (`buildPaddedShipSheet`,
  the rock texture) and whole-pixel camera steps.
- `.claude/launch.json` is created only to start a preview; delete it after.

## 7. Next steps (in this order)

1. **Optional leftovers:** the grey wreck set (wait until wrecks are real board
   objects), a sea section in the art lab (left out on purpose), spray (off).
2. **Phase 6** (battle objectives; slices A to D are done, start from slice E, the ambush, in ROADMAP.md) and onward: a client-only solo run (`run-core`), Postgres, monsters. First
   have the user look at Loot in play and tune `PICKUP_EFFECTS`, `PICKUP_COUNT`
   and the sprites.
3. Known loose ends: the menu's ship choice does not carry into an online lobby
   (it starts on Sloop); the token tray's held/cap figure was not seen; the
   canvas is not sized to the device pixel ratio (blur on sharp screens); the
   smallest zoom step on a small window may not show the whole board; Hard AI
   barely beats Easy on generated boards.
4. **i18n follow-ups:** the Spanish and Polish catalogs are machine-drafted and
   want a speaker's review; more languages are a `locales/<code>.json` plus a
   `LANGUAGES` entry (see the i18n note above); only the menu and one offline
   battle were checked in a browser (the WebGL board cannot run in the in-app
   browser).

## 8. Rules from the roadmap that always apply

Every new field is optional and its absence changes nothing; golden snapshots
(`golden.test.ts`) stay green unless a rule is deliberately changed (then
refresh in the same commit); socket protocol changes are additive; rules stay
in `game-core` and deterministic; the database stays optional; each phase is
playable from the menu or a default-off setting.
