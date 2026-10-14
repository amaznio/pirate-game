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
All of slices A to F are in (survive N turns, a salvage race, AI that plays to them, the merchant and the ambush). Reinforcements are ships with no hull and an arrival turn, so the controller needed no change. Along the way the token economy was raised and rebuilt: tokens are made to fit the hold's mix per class and swap at the cap instead of being refused; the class ladder was rebalanced through ammo and reload (hulls stayed 4, 5, 6); the easy AI was weakened; see ROADMAP.md phase 1 "Token economy revisited". Play feedback from the user: too much ammo speeds games up, and a ship with 3 cannonballs per shot regaining 1 a turn feels bad late in a match, but it was kept for now. The cargo race (salvage) mostly ends by sinking; the user said to leave that for later.

### UI redesign: the Harbour theme on shadcn (a later session; commits `62da054`, `f8aa4b6`)
The user adopted a Claude Design bundle (14 boards: Harbour dark skin, Logbook parchment skin, a components board and a recommendation board). It now lives, untracked, in `.scratch/` (gitignored; it is a nested HTML bundle, unpack its manifest and templates to read it). Decisions: build **Harbour** only; use **shadcn** (Radix, Tailwind 4) for generic primitives on every screen, including the HUD; keep game widgets custom; one token source in `apps/client/src/index.css` (the design's palette, radii and the shadcn role variables mapped onto it); never use raw hex colours or one-off button classes in screens.

- **Setup:** `components.json`, an `@/` alias (`tsconfig.json`, `vite.config.ts`), `src/lib/utils.ts` (`cn`), `src/components/ui/*` (button, badge, card, collapsible, dialog, popover, radio-group, select, switch, toggle, toggle-group, tooltip, restyled to the design), Alegreya SC via `@fontsource`. The shadcn CLI writes `from "cn"` imports; change them to `@/lib/utils`. The Select default position is `popper`, so the list opens below the trigger.
- **`src/kit/`:** `ScreenFrame`, `Tile`, `Segmented` (ToggleGroup with a check on the chosen item; `compact`), `ChoiceRow` and `ChoiceGroup` (radio plus an info popover for the rule), `Field`, `Stepper`, `Notice`, `Banner`, and `KitBoard`. **`/?kit` (dev only) shows the components**; it does not yet include the HUD widgets or Dialog, Select or Popover.
- **Menu flow:** Home (title, Play, language dropdown) to Choose a mode (Quick battle, Play with friends, Voyage "coming soon") to the mode's settings (`QuickBattleScreen`, `FriendsScreen`). `MainMenu` holds the step. The player's name is asked for only on the friends screen (a stored name is still used for offline matches). A `?room=` link opens the friends screen. Quick battle shows the "Your battle" summary first on a phone and in the right column on desktop; each objective's rule is behind an info popover. `LobbyScreen` is two columns with a footer bar. Game over and "sunk, keep watching" are shadcn Dialogs in `ui/EndDialogs.tsx`.
- **Battle HUD:** `TurnTimer` (icon, digits, bar, and a "Hurry" chip when low), hull pips (solid or hollow), `FleetList` with words for sunk, escaped or arriving, `Banner` for the objective and status messages, a pinned Clear and Pass or Lock In row, and a `SeaGuideButton` (phone only) that opens the wind, whirlpool and loot legend. The phone sheet is custom and **non-modal on purpose** (a modal sheet would block the board). Its header row holds "Battle Plan", the Auto token switch and the cannonball chip; with Auto off a captioned row of arrow buttons ("Next turn you get:") appears (`ui/NextTokenControl.tsx`). The sheet is about 36 per cent of the screen.
- **Kept on purpose:** the user preferred the **old** token buttons, plan slots and round cannonball toggles over the redesign (`MoveTokenTray`, `PlannedMoves`, `CannonGroup`, `CannonToggle` are as before). Do not re-do them in the design's L/R counter style unless asked.
- **Guard and board:** `src/kit/__tests__/noRawColours.test.ts` fails when `ui/`, `kit/`, `app/` or `components/` contain a hex colour, `rgb()` or `hsl()` (a line can end with `raw-colour-ok` to allow one; the Phaser code is not scanned). `/?kit` now also shows Select, Dialog, Banner, Tile, hull pips, token chips and the cannon toggle (not the store-driven widgets: token tray, plan slots, `TurnTimer`).
- **Voyage:** the Voyage tile on Choose a mode opens the real solo voyage (`ui/voyage/`, see section 7a). It first existed as a placeholder preview screen with made-up data; that screen is gone. `kit/MapNode` (cleared, current, available, locked; shape, icon and words, not colour alone, and pressable when it is a stop in reach) draws the map. Strings are under `voyage.*` (Spanish and Polish machine-drafted).
- **Not done:** the design's bottom tab bar (waits for a live Voyage); the design's collapsed phone strip is taller than the mockup (full token chips).
- **Not seen in a browser:** the Lobby, the game-over and sunk dialogs, the objective banner and "Hurry" chip at phone width, the Friends screen with a real server, the Spanish and Polish layouts (new strings are machine-drafted), and any screenshot of an open dropdown.

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

On `main`, tracking `origin/main`. Everything is pushed, including the UI
commits (`62da054`, `f8aa4b6`, `526c2ab` for the `.scratch/` ignore, `6cf65f3`
for this file) and the phase 3 art commits (`cc93317`, `dc8389b`, `c63477e`, `e149fc1`, `a3a3a7b`, `a46f575`,
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
- For UI work they send screenshots with short verdicts ("looks crappy", "needs
  to be more compact") and often prefer the **previous** version of a section;
  restore it from git rather than defending the new one. They ask "suggest"
  when they want options first, and answer "Go with A" or "Do all 3".

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
- `.claude/launch.json` is committed. It is the config the preview tool uses to
  start the client dev server (`pnpm --filter @pirate/client dev`, port 5173),
  so keep it. If `preview_start` refuses because a leftover server holds the
  port, navigate to it instead, or stop that server.
- **The in-app browser did render the WebGL board in the UI session** (a match
  at `/?ais=3&seed=3` drew the sea and ships), so try it before the Canvas
  switch above. The hidden-pane animation stall still applies (a turn can stay
  on "Resolving").
- **Screenshots at an emulated viewport are often cropped or zoomed**, and a
  screenshot taken right after an action can time out or show the previous
  state. Retry, take the pane at its natural size, or read the DOM
  (`find`, `get_page_text`, element geometry through `javascript_tool`). Reset
  the viewport with the `desktop` preset afterwards. The panel is about 800 px
  wide, so it shows the narrow layout; set 1280 to see the desktop layout.
- Open Radix popups (Select, Popover) are hard to screenshot here; check their
  position by geometry and their content by text.

## 7. Next steps (in this order)

1. **Optional leftovers:** the grey wreck set (wait until wrecks are real board
   objects), a sea section in the art lab (left out on purpose), spray (off).
2. **Phase 6** (battle objectives; all done, see ROADMAP.md) and onward: a client-only solo run (`run-core`), Postgres, monsters. First
   have the user look at Loot in play and tune `PICKUP_EFFECTS`, `PICKUP_COUNT`
   and the sprites.
3. Known loose ends: the token tray's held/cap figure was not seen; Hard AI
   barely beats Easy on generated boards. (Fixed since: the ship choice is
   remembered and applied in an online lobby, `ui/menu/useStoredShip.ts`; the
   board canvas is drawn in device pixels, `phaser/pixelRatio.ts`, with ship
   avatars and edge arrows scaled to match and zoom steps counted in device
   pixels; a smaller zoom step, 1/6, lets a small or short window show the whole
   board; reloading mid-battle in a voyage counts as a loss.)
   Not seen on a real sharp screen: the pane's pixel ratio could only be faked
   (`Object.defineProperty(window, 'devicePixelRatio', ...)` before the match
   starts); canvas size, drag and zoom behaved as expected. The smallest zoom
   step ignores the HUD and planning sheet when working out whether the board
   fits, so on a very short window a strip of its edge can sit behind the sheet.
4. **i18n follow-ups:** the Spanish and Polish catalogs are machine-drafted and
   want a speaker's review; more languages are a `locales/<code>.json` plus a
   `LANGUAGES` entry (see the i18n note above); only the menu and one offline
   battle were checked in a browser (the WebGL board cannot run in the in-app
   browser).

## 7a. Roadmap phase 7, the solo run (in progress; slices A to D done)

Planned in ROADMAP.md phase 7 (read it: it holds the decisions). New package
`packages/run-core` (pure, depends on `game-core` for types and for building
matches; `game-core` knows nothing of runs). Done so far:
- **A:** `graph/` generates one area of the route as a seeded layered graph
  (`generateArea`, `generateAreas`), `config/areas.ts` holds the five area specs
  (10 to 18 layers, calm to stormy).
- **B:** `run/engine.ts` (`startRun`, `applyAction`: travel, chooseUpgrade,
  finishBattle, abandon), `run/rules.ts` (every number), `run/upgrades.ts`,
  `run/battle.ts` (`buildBattle` makes a `MatchConfig` from the node and the
  hero's state) and `run/save.ts` (`serializeRun`, `parseRun`).
- **C:** `game-core` carry-over takes `maxHull` and `cannonsPerSide`, so a run's
  hull level and cannon upgrades take effect in battle.
- **D:** the client. `apps/client/src/run/runStore.ts` (zustand over `run-core`,
  saved in `localStorage` key `pirate:run:v1`), `ui/voyage/` (intro, map, port,
  battle briefing, end screens), and `App.tsx` / `GameScreen` run a voyage battle
  and hand its `MatchResult` back (`GameScreen`'s `runBattle` prop). You play a
  voyage from Play, then the Voyage tile ("New voyage" or "Continue voyage").
- **E (harness built, tuning not done):** `pnpm harness:run` (see the header of
  `packages/run-core/scripts/harness.ts` for the options; `--scripted` measures
  the economy and length, `--playon` measures every battle). The first numbers
  are in ROADMAP.md slice E: the voyage is about 46 battles, supplies never bind,
  the ship maxes out by area 2, and a matched AI pilot wins 50 per cent of fights
  in area 1 falling to 17 per cent in area 5. Tuning needs the user's targets.
Next: tune with the user (slice E), then **F** (docs). Not yet seen in a browser: a
voyage battle played to a real win or loss, and the voyage screens at phone width.
Known open issues for E: a scripted always-win run is about 65 legs and 45 to 49
battles and never runs short of supplies, so supplies add no tension and the run
may be too long.

## 7b. UI next steps

1. The user has looked at the screens listed under "Not seen in a browser"
   (the lobby, game-over dialogs and phone layouts) on their own device. The
   voyage screens have been seen in the browser pane at desktop width only.
2. Add the store-driven HUD widgets to `?kit` only if there is a way to feed
   them state without a match (not done).
3. Leave the old token, plan and cannon section as it is unless the user asks.
4. The voyage UI is built (phase 7 slice D); what is left for it is the balance
   work in slice E and looking at it on a phone.

## 8. Rules from the roadmap that always apply

Every new field is optional and its absence changes nothing; golden snapshots
(`golden.test.ts`) stay green unless a rule is deliberately changed (then
refresh in the same commit); socket protocol changes are additive; rules stay
in `game-core` and deterministic; the database stays optional; each phase is
playable from the menu or a default-off setting.
