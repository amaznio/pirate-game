# Roadmap

> **Picking this up fresh? Read `docs/HANDOFF.md` first.** It records what was
> built and why, the user's way of working, tool gotchas on this machine, the
> git state (commits after `9da7b0f` are not pushed) and the ordered next
> steps.

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
- **Art: the Scallywag packs by Foozle (CC0)**: Ships, Water and Islands, Fort,
  Pirates. They replace the Kenney pack. See "Art" below.
- Ships are assembled from Scallywag parts: hull size is the class, sail colour
  is the team.
- Floating **pickups** (barrels, crates) influence routing.
- Sea monsters with telegraphed attacks.
- **Solo first.** Postgres on Railway for persistence.

## Art

The Scallywag packs (Pixel Carvel, distributed by Foozle, CC0) live in
`C:\Users\adria\Desktop\Scallywag Assets` (outside the repo). All four readmes
say CC0, free to modify, no attribution needed.

| Pack | Native | Use |
| --- | --- | --- |
| Ships (`Ships tiles.png`, 720x672) | hulls 30x64, 44x80, 46x128 | 3 hull sizes x 5 colours (+ grey), 3 states (whole, cracked, broken in pieces); 6 sail colours; masts; 5 cannon types (16x16, 3 fire frames); wake 64x64 (6 frames); 2 explosions 32x32 |
| Water and Islands (384x144) | 16x16 tiles | islands, shallow ring, animated water and shore, stones, palms, rowboat, planks, chests |
| Fort (432x256) | 16x16 tiles | walls, docks, flags (6 colours), 2 fort cannons, barrels, coins, gems, potions |
| Pirates (304x336) | 16x16 | crew: idle, walk, sword, shovel, shot, 6 colours |

Ships point **down** (bow at the bottom, bowsprit on the large hull).

**How much room a ship takes** (hull, native pixels; a ship is one cell in the
rules):

| Class | Hull | Length in cells at 64 px | at 80 px | at 96 px | Width at 64 px |
| --- | --- | --- | --- | --- | --- |
| Sloop (small) | 30x64 | 1.00 | 0.80 | 0.67 | 0.47 |
| Brigantine (medium) | 44x80 | 1.25 | 1.00 | 0.83 | 0.69 |
| Galleon (large) | 46x128 (112 body + bowsprit) | 2.00 | 1.60 | 1.33 | 0.72 |

At the current 64 px cell the galleon reaches half a cell past its own cell at
each end, the brigantine an eighth, the sloop none. Width is never a problem.
Recommendation: **keep the 64 px cell** (the engine already uses it and a phone
at about 1 CSS px per art pixel shows 5 to 8 cells across), draw ships above
terrain, and mark the logical cell under your own ship. Decision pending.

**Gaps** (addressed later, by deriving from these sheets or generating in their
style): sea monsters, wind and whirlpool art (code-drawn for now), HUD icons.

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

### 2. Multi-cannon broadsides: `done` (reworked)
Rules only; the cannon sprites arrive with phase 3. **Every cannon fires from the
ship's own cell along the same line, one after the other** (first built with
fore and aft lanes, then changed because shots starting in neighbouring cells
made it unclear which cell a ship occupies).

| Class | Cannons per side | Start ammo | Reload per turn |
| --- | --- | --- | --- |
| Sloop | 1 | 3 | +1 (unchanged) |
| Brigantine | 2 | 5 | +2 |
| Galleon | 3 | 7 | +2 |

- [x] `ShipType.cannons` (`count`, `ammo`, `reload`); `createShip` builds one
      mount per cannon on each side
- [x] **The player chooses how many cannons to fire.** A cannon move is now
      `{ left: n, right: n }`, the number of cannons to fire from each side (0 to
      the side's cannons). The planning screen shows one toggle per cannon on each
      side (three for a galleon); tapping one fires up to it, tapping a lit one
      lowers the side. Each cannon fired costs a cannonball, a toggle is out of
      reach when there are not enough, and Q/E still fire a whole side or none.
      Older clients sending true/false still work (true is one cannon); a plan
      asking for more cannons than a side has is rejected as malformed.
- [x] `combat.ts`: a side fires the first n cannons in order, each costing one
      cannonball and dealing the weapon's damage to the first thing on the line,
      so damage stacks; when the pool runs short the first cannons fire and the
      rest report `out_of_ammo`. Events of a side with several cannons carry
      `cannon` (0, 1, 2); a lone cannon's events are unchanged.
- [x] A ship that is already sunk takes no further damage or `SHIP_DESTROYED`
      (several shots can now reach it in one phase)
- [x] Plan validation and the client draft price a side at its cannon count; a
      side can only be queued when every cannon on it is affordable
- [x] AI: a firing position is any from which the line hits the target; it fires
      as many cannons as it has cannonballs for and no more than it takes to sink
      the ship in the way (no overkill); the kill bonus goes to the cannon that
      finishes the ship; each enemy cannon is a threat
- [x] UI: the toggle shows the cannon count; the ammo chip uses the real cost;
      the animator fires a side's cannons 150 ms apart (ships and sides together),
      matching each launch to its impact by ship, side and cannon number; the
      plan preview draws one line per side
- [x] Tests: `multiCannon.test.ts` (33), plus draft and protocol tests. The 9 original golden snapshots are
      unchanged; the 3 class scenarios were refreshed on purpose.
- Behaviour changes: firing a side with no cannon costs nothing; a destroyed ship
  is not damaged or destroyed again.

Class harness (`pnpm harness --classes --seeds 40`):

| pairing | A wins | B wins | draws | avg turns | ms/turn |
| --- | --- | --- | --- | --- | --- |
| sloop v sloop | 26 | 26 | 28 | 5.3 | 21.4 |
| sloop v brigantine | 5 | 73 | 2 | 3.6 | 27.8 |
| sloop v galleon | 4 | 70 | 6 | 4.4 | 27.6 |
| brigantine v brigantine | 25 | 25 | 30 | 5.5 | 28.0 |
| brigantine v galleon | 25 | 43 | 12 | 5.2 | 28.0 |
| galleon v galleon | 28 | 28 | 24 | 6.1 | 27.9 |

Findings: stacking makes big ships much stronger (a brigantine beats a sloop 73 to 5;
a galleon beats a brigantine about 63 per cent of the time). Mirror matches stay even
and the sloop mirror is identical to the phase 0 baseline. If the tiers need softening,
tune hull and ammunition (a galleon volley is 3 damage a side).

### 3. Scallywag art swap: `done` (a few extras left, see below)
Replaces the Kenney art, behind a switch (`?art=kenney` stays available) until
approved. Needs the cell-size decision under "Art".
- [x] Art lab (`?lab=art`, `src/phaser/lab/`): the three classes assembled from
      parts beside the Kenney ship, the 64 px cell, every hull state, the four
      headings, hull colours, and the terrain sheet. A screenshot is in
      `docs/art-lab.png`.
- [x] The needed sheets copied to `apps/client/public/assets/scallywag/`
      (`ships.png`, `water-islands.png`, with a README crediting the pack)
- [x] Frames measured and cut (`phaser/assets/scallywag.ts`, pure data, tested):
      hulls (frame 32x64 small, 48x80 medium, 48x128 large; states whole,
      cracked, broken), 4 sail shapes in 6 colours, 5 cannon types
- [x] `createScallywagShip`: hull + sails in the team colour + a cannon sprite per
      cannon on each side, spread along the deck; bow points down at rotation 0 (the old art already did,
      so `headingToAngle` is unchanged)
- [x] Cell size decided: keep 64 px. Cannon sprites are drawn on the deck at a
      visual spacing (24 px); shots still start from the rule lanes.
- [x] The game's ship views use the new ships with `?art=scallywag` (Kenney stays
      the default): sail colour from the team, hull colour for teams beyond the
      sixth, faint corner marks around your own ship's cell, the damage step from hull
      points, hit flash, the broken hull when sunk, ghost ships in the plan
      preview, and the avatar lifted clear of long hulls. Checked in headless
      Chrome (desktop and phone widths); the sinking tween itself has only been
      exercised in the lab.
- [x] Cannon fire and the wake (`?art=scallywag`): a puff of smoke and a brief
      flash at the muzzle on the firing side, a small iron ball in flight, an
      explosion where a shot hits and a pale splash where it misses, all from
      the sheet's frames (four 16x16 puffs and explosions, 16 px apart). The
      wake is six 32x64 frames (measured, not 64x64), flipped so the flare trails
      behind the stern, mirrored to both sides of
      the hull and played under a ship while it moves, is pushed or spins. The
      art lab (`?lab=art`) shows the frames and a permanent wake on each class.
      Not yet seen in a normal browser: only the lab and a played turn in the
      Canvas renderer, where the pale water hides the thin wake.
- [x] Rocks from the sheet's twelve stones (`?art=scallywag`): one per cell
      chosen by position, never rotated, 3x (2x for the smallest) so a stone is
      about a ship's beam wide (ships are drawn at native size; first tried 4x
      and 5x, which was too big), nudged by whole art pixels. Not sand islets: the sea has no islands,
      only stones, singles, clumps and ridges. Frames measured from the pixels
      (`STONE_BOXES`) and tested.
- [x] The sea (`?art=scallywag`), fourth version. The tiled 32x32 water was
      rejected twice (a tile repeated every cell), and the noise-contour lines of
      the third version looked like a static line sliding across the water, busy,
      and clashed when swell and chop ran different ways. Now nothing is a line
      and nothing slides (`SeaView`, `RippleField`, `assets/seaPixels.ts`,
      `ripplePixels.ts`, tested): water in three shades of blue in broad patches
      that stay still. In the default sea they are worked out from the board
      (`assets/seaDepth.ts`, tested), not tiled: non-repeating fractal noise bent
      by a second field so the patches curve, made shallower round every rock
      (a pale shelf), deeper round every whirlpool, and open sea past the edge of
      the board, cut into four levels with a light dither at the edges; one
      picture of the board and 8 cells round it, made in about 10 ms from a
      coarse grid filled in by blocks (a first version that sampled every pixel
      took 0.9 s). Plain open-sea colour fills the rest. The older tiled layer
      (`depthLayer`) is kept for `?sea=lines`; a passing swell as fine, soft stripes of slightly
      lighter and darker water, four to a layer (about four cells apart), bent by
      noise, drifting about a cell every seven seconds (`bandLayer`, mostly
      see-through; first tried broad, which looked like the depth patches and
      hid them); and the surface as 420 ripples (a dash 9 px wide, an arch 13 and
      a wide arch 17, up to 3 px high, so 18 to 34 px on screen) that grow,
      hold, shrink and vanish in place over about 1.4 s, then reappear somewhere
      else after a random 0.8 to 6.5 s, lying across the swell (about a quarter
      are visible at once), with 30 glints. Each layer is seamless
      (`PeriodicNoise` repeats exactly every 512 px) and moves in whole art
      pixels. The board decides the seed (so every player sees the same sea) and
      which of four straight directions the swell travels. The grid is fainter
      with this art. The swell stripes are switched off for now, to see the sea
      without them (`?bands=on` brings them back). `?sea=lines` brings back the third version (long swell and
      chop lines) to compare; `?water=pack` the pack's own tiles.
- [x] Surf on the rocks (`assets/surfPixels.ts`, `surfTextures.ts`,
      `views/SurfView.ts`, tested): each stone's outline is traced from the sheet
      and gives a halo of pale shallows and four steps of foam washing out from
      the stone and fading, every 6 s. The wave arrives at each rock in the
      swell's direction, a cell a second, so one wave rolls over the rocks in turn.
      Added later (see the Calm/Normal/Stormy item below): the tide, and spray
      (built, switched off).
      (palette, swell speed, whitecaps), which needs the sea style to reach the
      client (it is not in the view yet).
- [x] (first try) Animated deep water: the sheet's six 16x16 water tiles
      (3x2 at x 224, y 0; each tiles seamlessly) as a tiled sea at 2x, so a tile
      is half a cell and the grid lines fall on tile edges, changing to the next
      tile every 260 ms. The shallow ring and shore foam are for island edges and
      are not used: the sea has no islands. The water is a much brighter blue
      than the Kenney water; worth judging by eye against the ships and hazards.
- [x] Wind lanes and whirlpools redrawn at the same pixel density
      (`phaser/assets/pixelTerrain.ts`, tested): the whirlpool is 32x32 art pixels
      in 8 frames that turn by swapping frames (rotating smears pixel art), the
      wind chevrons are 16x16 and step a whole art pixel at a time
- [x] Pixel-art camera (`?art=scallywag`): zoom moves in whole steps (1/4, 1/3,
      1/2, 1, 2 and 3 screen pixels per world pixel, divided by the pixel ratio),
      never smaller than the board needs to fill the screen; a wheel notch or a
      burst of trackpad movement is one step, a pinch follows the fingers and
      shows the nearest step, and the camera rounds to whole pixels
      (`camera/zoomSteps.ts`, `BattleCameraController`; pure part tested).
      Limit: the game canvas is not sized to the device's pixel ratio, so on a
      sharper screen the browser still scales it; a separate job.
      Side effect: on a small screen the board may no longer fit, because the
      smallest step that fills the screen can be bigger than the old smooth fit.
- [x] Cannon explosions and splashes in the new style (see above)
- [x] The sinking explosion: a destroyed ship goes up in a big explosion and two
      smaller blasts (`animation/animateDestroyed.ts`), then sinks; pixel art only
- [x] Plan preview ghosts in the new style (`views/PlanPreviewView.ts`): dotted
      paths on a 4 px grid, ghosts tinted pale blue (red when blocked), a
      monospace step number, square shot markers
- [x] **`scallywag` is the default art** (`presentation/artStyle.ts`);
      `?art=kenney` brings the old art back
- [x] A faint footprint under every ship (a tint over its 64 px cell plus corner
      marks, `showCell` in `scallywagShip.ts`), because the galleon hull is two
      cells long and its cell was hard to read. Ships are drawn at native size,
      not scaled (a small hull is 32x64, medium 48x80, large 48x128)
- [x] Yards and sail emblems (`assets/scallywag.ts`, `views/scallywagShip.ts`,
      `emblemFor` in `ShipView.ts`): each sail hangs from a yard in a colour
      that stands out from the hull (`YARD_FOR_HULL`); the big billowing sail
      carries an emblem, dark on pale sails and light on dark ones. The
      viewer ship wears the skull, others one picked from their id. The
      sheet flag symbols are used as sail emblems. Seen on the galleon only.
- [ ] Grey wreck set: the frames are cut (`grey` hull colour) but not used. A
      wreck left on the board would look like an obstacle, so wait until
      wrecks exist as real objects (phase 4 loot)
- [x] The Calm/Normal/Stormy look: the sea choice of the match is now an optional
      `sea` on `MatchConfig`, `GameState` and `GameView` (absent changes
      nothing, golden snapshots unchanged; `SeaChoice` lives in
      `board/generateBoard.ts`). `assets/seaLook.ts` maps it to a palette, ripple
      count and wait, white-caps (stormy only, `views/WhitecapField.ts`), and
      surf period and speed. Open water looks calm. Water textures are keyed by
      palette (`paletteTag`) so a later match cannot reuse another look.
- [x] A slow tide (48 s): the shallows round each rock fade between 70% and full,
      and the outer foam ring is lost at low water (`tideAt`, `haloAlphaAt`,
      `foamStepShows` in `surfPixels.ts`)
- [x] Spray where a wave breaks on a rock is built (`SurfView`,
      `sprayVelocities`) but **off** (`spray: 0` in `seaLook.ts`): it looked
      distracting and busy, even after shortening its flight and cutting the
      count. Raise `spray` to bring it back
- [ ] A sea section in the art lab (left out on purpose for now)

Findings from the lab: hull states are three (whole, cracked, broken into 2 to 3
pieces), not four, so hull points map to them by fraction (more than half = whole,
half or less = cracked, zero = broken). The sloop is about the size of the current
Kenney ship; the galleon spills half a cell past each end of its 64 px cell. Cannon
sprites at the deck edge read as clamps when large: types 1 and 2 look right.

### 3b. Localisation (i18n): `done` (English plus Spanish and Polish stubs; more languages are a file each)
The interface can be shown in another language. `i18next` and `react-i18next` are
wired into the **client only**; `game-core`, the server and the rules are
untouched, no game-core field changed and the golden snapshots are green.

- [x] `apps/client/src/i18n/`: init, typed catalogs (`locales/en.json`,
      `locales/es.json`, `locales/pl.json`) and `i18next.d.ts`, so a typo or a
      missing key fails `pnpm typecheck`
- [x] Detection and persistence: `?lang=` first, then the remembered choice
      (`pirate:lang`), then `navigator.language`, then English; `<html lang>` and
      the page title follow the language. Left-to-right only for now
- [x] A language switcher in the menu; the choice updates live
- [x] All menu, lobby, in-battle HUD and planning text extracted (aria labels and
      titles included); `ACTIONS_PER_TURN` replaces a hardcoded `4`
- [x] Ship names and descriptions come from the catalog by id, falling back to
      the game-core config
- [x] Server and plan messages translated by their stable code (`ErrorCode`,
      `PlanRejection`, and an optional `code` on the `room:closed` event), with
      the server's English text as the fallback; the protocol change is additive
- [x] Tests: catalog parity (every locale has the English keys, plural forms
      matched), `t`/plural/interpolation, and code to message mapping. Polish
      exercises four plural forms (`_one`/`_few`/`_many`/`_other`)
- [x] Spanish (`es`) and Polish (`pl`) catalogs: machine-drafted, **not yet
      reviewed** by a speaker
- [ ] Only partly seen in a real browser (menu, an offline battle and the lobby
      paths); the WebGL board is unaffected
- [ ] More languages: add `<code>.json` and a `LANGUAGES` entry; nothing else
      changes

Rules honoured: English stays the default, so nothing changes without a choice;
`room:closed` only gained an optional field.

### 4. Pickups: `done` (not yet watched on a real WebGL board)
Barrels, crates and planks behind a default-off "Loot" option.

- [x] Rules (`simulation/pickups.ts`): a pickup goes to the one ship that **ends a
      phase** on its cell, after movement and the sea's push or spin, before fire.
      Barrel +3 cannonballs, crate +2 tokens (made like turn income, never past
      the cap), plank +1 hull (never past max); a full ship still uses it up.
      Two ships on one cell: lost, nobody gets it. No respawn. Numbers in
      `PICKUP_EFFECTS` (`config/gameRules.ts`). Events `PICKUP_COLLECTED` and
      `PICKUP_LOST`.
- [x] Optional `pickups` on the match config, state and view (public to every
      player); absent changes nothing. The 9 golden snapshots did not move.
- [x] Generator (`board/generatePickups.ts`): 4 to 8 on a 20x20 board (scaled with
      the area, not with the Seas setting), one of each kind first, on open
      water, clear of spawns, spaced out, likelier towards the middle. Own random
      stream, so Loot never changes a seed's rocks, wind or whirlpools.
- [x] Wiring: `loot` on the duel and skirmish configs, an optional `loot` in
      `RoomOptions` (additive), a menu and lobby toggle, `?loot=on`, i18n in
      en/es/pl, `pnpm harness --loot`.
- [x] AI: landing on a pickup scores its value (`lootWeight` per profile: 10, 20,
      25), scaled by need (a full hull wants no plank), and the nearest one pulls
      a little from up to 10 cells. With no pickups the plans are identical.
      Harness: sides stay even and a match lasts about a turn longer.
- [x] Art: barrel from the Fort sheet (`fort.png` copied in), chest and plank from
      the Water and Islands sheet, drawn 3x, bobbing one art pixel over a shadow
      (`views/PickupField.ts`); a pop and a floating "+n" when taken; a legend line.
- [ ] Only seen once in a browser (Canvas, one barrel). The pop, the "+n" and the
      bob were not watched, and the sprite choices came from a contact sheet. The
      chest's open animation and the extra planks are not used.

### 5. Match result and carry-over: `done`
`MatchResult`, optional starting hull, ammo and modifiers. Tokens reset each
battle.

- [x] `MatchResult` (`domain/MatchResult.ts`, built by the pure
      `simulation/matchResult.ts` from the final state): the outcome, turns
      played, and per ship its hull, ammo, tokens left and pickups taken. The
      pickup tally is an optional `pickupsTaken` on the state, written when a
      pickup is collected (absent until someone takes one).
- [x] It reaches players as an optional `result` on the view, **only once the
      match is `game_over`**, so ammo is not shown early.
- [x] Carry-over (`domain/CarryOver.ts`): an optional `carryOver` per player id on
      `MatchConfig` with `hull` (kept between 1 and the class max), `ammo` (not
      below 0) and `modifiers`. One modifier kind exists so far, `cannonDamage`,
      stored as an optional `bonusDamage` on the ship and added to every shot
      (combat and the AI's expectations). Tokens are never carried.
- [x] **Not cheatable:** nothing reads carry-over from a URL, a lobby option or a
      socket message. Tests check `parseRoomOptions` and `?hull=&ammo=` ignore it.
      Only code that builds a match (tests, and the solo run later) can set it.
- [x] A small summary in the game-over screen (`ui/ResultSummary.tsx`): turns,
      your hull, cannonballs left, loot taken, and the other ships' hulls. Text in
      en/es/pl.
- [ ] The summary was seen once in a browser with made-up data; a real match
      ending was not played through. The first reader of a real result will be
      phase 7 (`run-core`).

### 6. Battle objectives: `todo`
Merchant interception, survive N turns, salvage race, ambush.

### 7. Solo run, client only: `todo`
Map art: islands, shallow water, docks for ports, fort pieces for fortress nodes.
New pure `packages/run-core`: seeded node graph, supplies, ports, 1-of-3
upgrades, boss, starvation at zero. Progress kept in `localStorage`.

### 8. Postgres persistence: `todo`
Profile, run history, unlocks, hub shop. Anonymous accounts with a secret token.

### 9. Sea monsters: `todo`
Non-ship entities, telegraphed attack patterns, Kraken boss, hunt node.

### 10. Content: `todo`
Pirates sprites for crew and port screens.
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

- 2026-10-12: phase 3b (i18n): `i18next` + `react-i18next` in the client, typed
  catalogs, a language switcher, `?lang=`/`pirate:lang`/`navigator.language`
  detection, all menu/lobby/HUD text extracted, server messages translated by
  code (an optional `code` on `room:closed`), and machine-drafted Spanish and
  Polish stubs. Tests: game-core 356, client 196, server 174.

- 2026-10-12: phase 3 finished apart from the extras: sinking explosion, plan preview ghosts, `scallywag` the default art (`c63477e`), ship footprints, yards and emblems, and the Calm/Normal/Stormy look with a slow tide (spray built but off). Commits `cc93317`, `dc8389b`, `c63477e`, `e149fc1`, `a3a3a7b`, `a46f575`, not pushed. Tests: game-core 356, client 189, server 174.

- 2026-10-12: phase 3: the sea's depth is worked out from the board (shelves round
  rocks, deeper by whirlpools, open sea past the edge, four levels, about 10 ms), ripples
  and rock surf are the default sea; swell bands are off (`?bands=on`); committed as
  `49c9fa4`. Tests: game-core 354, client 181, server 174. Everything pushed.
  `docs/HANDOFF.md` written for a fresh session.

- 2026-10-12: phase 3: the sea as drifting noise layers instead of a tile, and surf on the rocks; tests: client 152.

- 2026-10-12: phase 3: animated pixel-art sea; tests: client 118.

- 2026-10-12: phase 3: whole-step zoom for the pixel art; tests: client 117.

- 2026-10-12: stray horizontal lines under a ship's bow: the hull frames touch on the sheet, so a sprite on a fractional pixel shows a sliver of the frame below. The game now copies every ship frame onto its own sheet with a 2 px margin (`buildPaddedShipSheet`, `packFrames`). Not confirmed in WebGL.

- 2026-10-12: phase 3: cannon fire, impacts and the wake in the new art; tests: client 107.

- 2026-10-12: phase 3: rocks drawn as stones and wind and whirlpools redrawn in pixel art behind `?art=scallywag`; phase 1 menu and lobby checked in a browser (a galleon and a brigantine in one online room: hulls, tokens, cannonballs and what each player sees all right). tests: client 105.

- 2026-10-10: the number of cannons fired per move is now chosen by the player (one toggle per cannon); 625 tests (game-core 354, client 97, server 174).
- 2026-10-10: phase 2 reworked: all cannons fire from the ship's own cell along one line, in sequence; 611 tests (game-core 341, client 97, server 174).
- 2026-10-10: phase 3: `?art=scallywag` draws the ships with the new art; tests 612 (game-core 341, client 97, server 174).
- 2026-10-10: phase 3 started: art lab, frame data and ship builder; tests 605 (game-core 341, client 90, server 174).
- 2026-10-10: phase 2 done, 599 tests (game-core 341, client 84, server 174).
- 2026-10-10: art switched to the Scallywag packs; phase 3 is now the art swap; ship space measured (see Art).
- 2026-10-10: a match now ends (outcome `eliminated`, shown as a loss) once the last human is sunk, and a player sunk while other humans fight on gets a "Keep watching / Leave" popup. 576 tests.
- 2026-10-10: phase 1 done, 571 tests (game-core 313, client 84, server 174).
- 2026-10-10: phase 0 done: 295 game-core tests (11 new), baseline above.
- 2026-10-10: plan agreed. Baseline at `e65366d`: 529 tests green (game-core
  284, client 77, server 168).
