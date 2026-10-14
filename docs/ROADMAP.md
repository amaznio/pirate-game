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
| Sloop | 4 | 8 (4F 2L 2R) | 2 | 10 | +2 | F L F R | 1 | 8 |
| Brigantine | 5 | 10 (5F 3L 2R) | 3 | 12 | +1 | F L F R | 2 | 12 |
| Galleon | 6 | 12 (8F 2L 2R) | 4 | 14 | 0 | F F F L F F F R | 3 | 18 |

Identities: the sloop is the patient ship (smallest hold, the biggest rest
bonus); the brigantine the all-rounder; the galleon covers ground fast (four a
turn, three forward to each turn token) but swings round slowly.

*(Economy raised in a later change, see "Token economy revisited" below; the
first numbers were sloop 6 start, +1, no cap, no rest bonus; brigantine 8, +2,
cap 10; galleon 10, +2, cap 12.)*

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

**Token economy revisited (after phase 6 slices A to C).** One token a turn
against four phases a turn meant a sloop could move in about one phase in four
once its six starting tokens were spent, which felt far too tight for longer
matches (objectives, and later the solo voyage). The economy was raised in one
step: the sloop and the default are now 8 start, +2 a turn, cap 10, +2 for a
turn with no move (`INITIAL_TOKEN_POOL`, `TOKENS_PER_TURN`, `DEFAULT_TOKEN_CAP`,
`DEFAULT_REST_BONUS` in `config/gameRules.ts`); the brigantine and galleon moved
up with it (table above); a crate pickup gives 3 tokens instead of 2.
- Before (harness, sloop mirror): 1.35 moves per ship per turn. After: about
  1.5 to 1.8. The AI is thrifty with tokens and stops to shoot, so the harness
  cannot show how it feels for a person planning four moves a turn: **the
  numbers want a hands-on pass** (they are all constants).
- Tests that pinned the old numbers were updated; all golden snapshots were
  refreshed on purpose.
- The AI ladder test (hard beats normal beats easy) now runs on generated boards
  with 16 seeds: on the old open benchmark board with six rocks the duel ends in
  mutual destruction 98 per cent of the time under the new economy, so it said
  nothing about skill. On generated seas the ladder holds (hard 31 v normal 19,
  hard 51 v easy 23, normal 40 v easy 33, over 80 duels each).
- **Different identities per class (second step).** With everyone's tokens
  plentiful the classes had stopped feeling different, so they were separated
  again: the sloop is the patient ship (8 start, +2, cap 10, **+2 for resting**),
  the brigantine the all-rounder (10, +3, cap 12, +1), the galleon covers ground
  fast (12, **+4**, cap 14, no rest bonus, token order F F F L F F F R: three
  forward to each turn token, so it swings round slowly).
- **Token production rewritten (balanced, and never refused at the cap).**
  `produceTokens` in `simulation/tokens.ts` replaces the fixed token order.
  Auto mode makes the type the hold is most short of, measured against the
  class's own mix (the share of each type in its token order: a sloop is 2 parts
  forward to 1 left to 1 right, a galleon 6:1:1), the order breaking ties. At the
  cap a new token swaps for the type held in the biggest surplus, so nobody has
  to spend tokens to make room; in auto it stops once the swap would overshoot
  (a balanced hold is left alone), with auto off the token you chose always
  replaces your biggest surplus. Crates use the same function. (Found when a
  galleon sat at 11 forward, 3 left and 0 right with the hold full, so no new
  rights could be made.)
- **Cannons rebalanced (the real lever).** With tokens plentiful, the classes
  were separated by guns: a sloop lost to a brigantine 55 to 2 whatever the
  hull, because the brigantine fires two cannons a volley and reloaded twice as
  fast. Sustained fire is now the same for all three (reload 1 a turn); the
  bigger ships keep a bigger burst. Brigantine: 2 cannons a side, start ammo 4,
  reload 1 (was 5 and 2); galleon: 3 cannons a side, start ammo 5, reload 1 (was
  7 and 2). A galleon can fire a whole side and two cannons of the other, but
  not both sides in full. Hulls stay 4, 5, 6: raising them only added mutual
  destruction (42 of 60 brigantine mirror duels ended in a draw at hull 7) and
  did nothing for the ladder.
- **Class harness now** (normal sea, 30 seeds, 60 duels each; A is the first
  named class): sloop v sloop 16-16 (28 draws, 9.6 turns); sloop v brigantine
  14-32; sloop v galleon 13-28; brigantine v brigantine 13-13; **brigantine v
  galleon 24-30** (the galleon's edge is slim, about 56 per cent); galleon v
  galleon 12-12. A bigger class now wins about 65 to 70 per cent against the
  next one down, and duels last about 10 turns (they were about 5). Starved is
  0 per cent. The galleon over the brigantine could still use a little more.
- **Objectives under the new numbers** (sloop mirror, 30 seeds): salvage to 2
  decided by the cargo 20 per cent of the time (was 3), hero 37 per cent; survive
  8 turns decided by the clock 73 per cent, AI hero 77 per cent. The cargo race
  is still mostly settled by sinking; a design change is open (see phase 6).
- **AI skill ladder.** Easy had been held back by token scarcity, so it was
  nearly as good as normal; it now fires 40 per cent of the time it could (was
  60) and slips 60 per cent of the time (was 50). Harness (80 duels each, normal
  sea): hard v easy 57-21, normal v easy 53-25, hard v normal 39-22. The ladder
  test now runs on generated boards with 16 seeds (the old open benchmark board
  ends in mutual destruction under the new economy).

### 2. Multi-cannon broadsides: `done` (reworked)
Rules only; the cannon sprites arrive with phase 3. **Every cannon fires from the
ship's own cell along the same line, one after the other** (first built with
fore and aft lanes, then changed because shots starting in neighbouring cells
made it unclear which cell a ship occupies).

| Class | Cannons per side | Start ammo | Reload per turn |
| --- | --- | --- | --- |
| Sloop | 1 | 3 | +1 (unchanged) |
| Brigantine | 2 | 4 | +1 (was 5 and +2) |
| Galleon | 3 | 5 | +1 (was 7 and +2) |

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

### 6. Battle objectives: `done`
Merchant interception, survive N turns, salvage race, ambush. An objective is a
way for a battle to end other than "last team standing", and in phase 7 it is
what makes a node on the voyage map a particular kind of battle.

**Rules that always apply (decided).**
- An objective is optional on the match config, state and view; absent changes
  nothing and the golden snapshots stay green.
- Order of building: survive N, salvage race, merchant, ambush (easiest first).
- A merchant can only be **sunk**, not boarded (boarding is a new mechanic).
- Objectives are not a head start, so there is an **offline menu choice**
  ("Objective": Standard by default), but no URL switch and no online lobby
  option for now. Carry-over stays code-only (phase 5 rule, unchanged).

**Design.**
- `Objective` (`domain/Objective.ts`), a typed union: `survive { turns }`,
  `salvage { target }`, `merchant { ... }`, `ambush { arrivals }`. Objectives are
  written from the side of the **hero team** (the humans' team); everyone else is
  the opposition. The evaluator is a pure function in `simulation/objectives.ts`
  that `evaluateOutcome` (`resolveTurn.ts`) calls when a match has one.
- `Outcome` gains an optional `reason` (`objective_met`, `objective_failed`,
  `survived`, `escaped`) on the existing win/draw variants, so the game-over
  screen can say why. A failed objective is a win for the opposing team.
- `MatchResult` gets an optional `objective` (its kind and whether it was met),
  which is what `run-core` will read.
- The view carries the objective and its live progress (turns left, pickups
  taken, merchant distance to the exit) so the HUD can show it. Public to all.

**Slices.**
- [x] A. Core and the two simple objectives: the type, evaluator, outcome
      reasons, **survive N** (win by being afloat after turn N; a loss if the
      hero team is sunk) and **salvage race** (a target count of pickups taken
      first, built on the phase 4 loot; ties are a draw). Tests, a golden
      scenario each, harness support.
      Built: `domain/Objective.ts` (`survive { turns }`, `salvage { target }`,
      `DEFAULT_OBJECTIVES` survive 8 turns and salvage 2 (first changed from 3 in slice C), `OutcomeReason`),
      `simulation/objectives.ts` (`heroTeams`, `evaluateObjective`), called first
      by `evaluateOutcome(state, endOfTurn)`. The hero team is the humans' team,
      or the first player's with no human. Survive: hero sunk is a win for the
      first living opponent (`objective_failed`), turn N done is a win
      (`survived`), the usual last-ship rule still applies. Salvage: the match
      ends when a team has the target or no pickup is afloat; the most wins
      (`salvaged`), a tie or nothing taken is a draw. A salvage board floats
      `2 * target - 1` pickups, with or without Loot. Optional `objective` on
      `MatchConfig`, state and view, and the view also carries `pickupsTaken`
      (the scores); `MatchResult.objective` says whether the hero team met it.
      Harness: `--objective survive|salvage`. Two golden scenarios were added
      (the existing ones did not move). The AI does not play to an objective
      yet, so the salvage golden ends by sinking: slice C changes that.
      Not yet reachable from the menu or the screens (slice B).
- [x] B. HUD and screens: an objective banner ("Turn 4 of 10", "Salvage 3/5"),
      the reason on the game-over dialog, an offline menu selector, en/es/pl text.
      Built: `presentation/objectiveProgress.ts` (progress from the viewer's
      side, and which end note to show), `ui/ObjectiveBanner.tsx` in the mobile
      HUD and the desktop sidebar ("Survive: turn 3 of 8", "Cargo: you 1 ·
      rivals 0 · first to 3"), a note under the game-over title (survived, sunk
      before time, took the most cargo, a rival took it, a draw), an Objective
      row (Met or Missed) in the result summary, and an Objective selector in
      the offline menu (Standard by default; survive 8 turns, salvage 2). Not
      in the online lobby, and no URL switch. The survive banner and the menu
      were seen in a browser; the game-over notes were only unit-tested.
- [x] C. AI awareness: hunters value what the objective asks (salvage raises the
      AI's loot weight, survive keeps them closing in); a harness check that the
      objectives are winnable and not trivial on every sea.
      Built: in a **salvage** race every pickup is worth a profile's
      `salvageWeight` (40, 70, 90 for easy, normal, hard) whatever it holds and
      whatever the ship's hull, and the nearest pickup afloat pulls at 0.12 of
      that per cell (about as hard as the ship heads for its target). In a
      **survive** match the hero team's AI stops closing in, keeps out of lines
      of fire and off the edge (`forObjective`); the hunters play as before.
      Salvage boards now put one pickup 3 to 4 cells from each ship's start
      (`fair` in `generatePickups`), the rest anywhere, and the default target
      is 2 of 3. A salvage tie is a draw with reason `salvaged`. The harness has
      `--objective`, with A always the hero seat, and prints hero wins and the
      share of matches the objective itself decided ("by goal").
      **What the harness showed (30 seeds, normal AI)**: survive 8 turns, hero
      wins about 77-87% when the hero is as strong as the hunters, 37-43% when
      the hero is easy against hard or normal ones (so it spans from fair to
      hard by skill). Salvage to 2: hero 30-43% on every sea, **but the race
      itself decides only about 3-17% of matches**: fights end in 2 to 6 turns,
      and ships start with about six movement tokens so they cannot reach
      far cargo first. A stronger pull made it worse (ships sailed into fire),
      and a "keep playing after one side is sunk" rule left a lone AI idle.
      **Open design point for the user:** is that mix right (cargo is one of two
      ways to win), or should the race decide more (closer or more cargo, a
      target of 1, or no last-ship shortcut with an AI that keeps collecting)?
      Two golden scenarios were refreshed on purpose; the others did not move.
- [x] D. **Merchant interception:** a neutral `merchant` team and an unarmed
      ship class, a scripted route planner (its own AI profile, not the fighting
      AI), an exit cell or edge, a `SHIP_ESCAPED` event, win by sinking it
      before it escapes, loss if it gets away or the hero team sinks. New art
      choice for the merchant (grey or white hull from the Scallywag sheet).
      Built:
      - **Objective** `merchant { turns }` (default 12); `shipId` and `exit` (the
        edge it is making for, east) are filled in when the match is built
        (`withMerchant` in `config/matchConfig.ts`, for both duels and
        skirmishes). The merchant (`merchant` / `merchant-ship`, class
        `merchantman`) starts mid west edge, kept clear of rocks and hazards, and
        **sails for the opposition**: every AI ship and the merchant share the
        team `escort`, so escorts and merchant never shoot each other (and the
        hero is the only hostile). Teams: the human's team against `escort`.
      - **Merchantman** (`config/shipTypes.ts`): hull 3, no guns, slow on purpose
        (6 tokens to start, +1 a turn, token order forward-heavy), `playable:
        false`, so it never appears in a ship choice, `?ship=`, `?enemy=` or a
        lobby message (`isPlayableShipType`, `playableShipTypeIds`).
      - **Escape and rules:** after movement each phase (before fire) the merchant
        on the exit edge leaves: `SHIP_ESCAPED`, hull 0, `escaped: true` on the
        ship. Evaluator order: escaped (escort wins, `escaped`), sunk (hero wins,
        `intercepted`; draw if the hero went down too), hero sunk
        (`objective_failed`), then the clock (escapes at the end of turn N).
        Sinking only the escorts does not settle it.
      - **AI:** the merchant plans with the fighting AI's search and a goal of
        reaching the exit edge (a bonus of 200 for any phase it ends there, danger
        weight 20, never mistakes, never fires). A hero-team AI hunts the merchant
        (hits on it are worth three times as much).
      - **Client:** an Objective choice "Merchant" in the offline menu (your
        opponents become the escorts), a banner "Merchant: 18 cells from
        escaping, turn 1 of 12", end notes (sank it, it got away, your ship
        went down), the merchant listed as "Away" once escaped, a gold strip with
        arrows along the exit edge, the escape drawn as the ship sailing off and
        fading, a flat-sailed medium hull for the art. English, Spanish, Polish.
      - **Tuning** (harness, 20 duels a sea, a hero AI that hunts the merchant):
        a merchant that used every token every turn (8 start, +2) escaped in
        about 5 turns and the hero won 0 to 10 per cent; at 6 start and +1 the
        hero wins 45 to 65 per cent, loses to the escort's guns 30 to 40 per
        cent and the merchant escapes about 10 per cent of the time. A human is
        likely to do differently: the numbers are constants (`merchantman`).
      - Tests: `merchant.test.ts` (19), client tests for progress, notes, menu
        and URL, and two golden scenarios (a duel and a skirmish).
      - Seen once in a browser: the menu choice, the banner, the fleet list and
        the whole board with the exit strip. The escape animation and the
        end-of-match notes were not watched.
- [x] E. **Ambush:** scheduled arrivals (`SHIP_ARRIVED`), ships and their AI
      added mid-match, which touches the controller's player handling (the
      riskiest slice, so last). A big enemy wave versus a hero that starts
      hemmed in.
      Built, **without changing the controller**: reinforcements are ordinary
      participants that exist from the start as ships with `hp: 0` and an
      `arrivesOnTurn`, so every rule that looks at `hp > 0` (living ships,
      blocking, shots, collection, planning) already ignores them, and no player
      has to be added mid-match. `bringInArrivals` (in `beginNextTurn`, so the
      ship appears when planning opens and the player can see it) gives a due
      ship its full hull; if a rock or a ship is on its cell it tries again next
      turn. A ship that has not arrived earns no tokens. There is no
      `SHIP_ARRIVED` event: the state changes at the turn boundary.
      - **Objective** `ambush { turns }` (default 14). Hero wins when every
        raider is sunk **and none are still to come** (`ambush_broken`); loses if
        sunk (`objective_failed`) or if raiders are afloat or still due when turn
        N ends (`overrun`). The last-ship rule is switched off for this match, so
        killing the first wave never ends it early.
      - **Layout** (`ambushLayout`, pure): the AI ships are the first wave, five
        cells round the hero facing it (hemming it in); at least two more raiders
        (as many as the first wave if more) arrive from the corners, one every
        two turns from turn 3. The terrain generator keeps all those cells clear.
        `withAmbush` builds it for duels and skirmishes; every AI ship sails for
        the team `raiders`.
      - **Raiders** are a new unplayable class, `raider`: a sloop with hull 2.
        They sail one skill level below the match (hard becomes normal, anything
        else easy). The hero gets a veteran captain's guns: +1 damage a cannon
        (`AMBUSH_HERO_DAMAGE_BONUS`, through the code-only carry-over, so one hit
        sinks a raider).
      - **Tuning** (harness, a hero AI that does not play to this, 20 duels a
        sea): with equal sloops and no bonus the hero was sunk every time within
        5 turns, even against easy hull-2 raiders, because each duel cost it
        about two hull; with the bonus and hull-2 raiders it wins 20 to 50 per
        cent (broke the ambush 8, 4 and 10 of 20 on calm, normal and stormy;
        sunk 10 to 13). A person should do better than the AI. Constants.
      - **Client:** an Ambush choice in the offline menu, a banner ("Raiders: 1
        afloat, 2 on the way, turn 1 of 14"), the fleet list showing "Turn 3" for
        a raider still due, end notes (broke it, time ran out, went down), "Did
        not arrive" in the result summary, a raider look, and a gold ring with a
        fade-in where a ship arrives. English, Spanish, Polish.
      - Tests: `ambush.test.ts` (22) and client tests for progress, notes and
        the menu; a golden duel. Seen in a browser (text only, the pane would not
        draw): the menu blurb, the banner and the fleet list. The board with the
        hemmed-in start and the arrival effect were not seen.
- [x] F. Docs and handoff.

**Open (decide while building):** exact numbers (turn counts, salvage targets,
merchant speed and route length); whether a salvage target should scale with the
number of players; how the merchant picks its route on a board with rocks.

### 7. Solo run, client only: `todo` (planned, agreed with the user)
A solo run: a seeded route map where every battle node is an existing skirmish
with a phase 6 objective. Hull, cannonballs and upgrades carry from fight to
fight, ports repair and offer upgrades, and supplies limit how far you can
sail. It lives in a new pure package, `packages/run-core`; the client saves a run
in `localStorage`. No server. `game-core` never learns about runs.

Map art: islands, shallow water, docks for ports, fort pieces for fortress nodes.

**Decided with the user.**
- **Losing a battle ends the run** (roguelite). A draw (mutual destruction)
  counts as a loss.
- **Every run starts in a Sloop**, so there is no ship pick screen. The ship
  grows through the run by upgrades (see "How the ship grows" below).
- **A long run made of 5 areas** (to start). Each area is its own route graph
  that ends in a boss; beating the boss opens a **new, bigger area graph** with
  more nodes and its own boss at the end. Beating the fifth boss wins the run.
  There are **plenty of ports and extra nodes**, enough to give the player
  enough upgrades over the run (not necessarily a new ship class before each
  boss). See "Areas" below. Exact sizes are tuned by the harness
  (slice E), not fixed here.
- **The hull thresholds and the starting formula under "How the ship grows" are
  accepted as the starting point**: the user will see how they play out and
  adjust later.
- **The upgrade list below is accepted**, with the changes under "How the ship
  grows". The pool is bigger than one run uses, and a port offers 1 of 3 drawn
  from it.
- Entry: the Voyage tile on Choose a mode opens "New voyage" or "Continue
  voyage" (slice D: `ui/voyage/VoyageFlow.tsx`). Starting a run goes straight to
  the first landfall, which offers an upgrade.


**How the ship grows (decided with the user).** The run starts with the Sloop's
hull and **hull upgrades step the ship up through the classes**, so the Sloop
becomes a Brigantine and then a Galleon until you sail a fully upgraded ship.
**Cannons come from upgrades**, not from the class.
- **Hull level.** `run-core` keeps a hull level, 0 at the start. Each "reinforce
  hull" upgrade adds one: +1 maximum hull and +1 hull now. The level picks the
  ship class (its sprite, token economy, supply use and cargo cap): Sloop until a
  first threshold, Brigantine until a second, then Galleon. Starting thresholds,
  to be tuned by the harness: Brigantine at level 2, Galleon at level 4, the
  ladder capped at level 6. The player gets a clear "your Sloop is refitted as a
  Brigantine" moment at each step. The three classes are the three hull sprites
  we have.
- **Carried hull.** The maximum hull is an absolute value set by the run
  (`4 + level` as a starting guess), not the class's own `maxHp`, so growth is
  gradual inside a class and the step in class does not make hull jump.
- **Cannons.** A ship in a run starts with one cannon on each broadside whatever
  its class, and "add a cannon" upgrades raise that count (cap 3, the Galleon's
  number). The class's own cannon count is ignored for the hero in a run; ammo and
  reload still follow the class.
- **A real tradeoff.** A bigger class costs more supplies per leg (Sloop 1,
  Brigantine 2, Galleon 3) but holds more (8, 12, 18), so growing makes the
  voyage hungrier. Slice E must make the supply economy work for that.
- **Game-core changes this needs** (slice C, optional fields only, so defaults and
  golden snapshots do not change): carry-over gains an absolute `maxHull` and a
  `cannonsPerSide`, read where the ship and its weapons are built
  (`createGame.ts`), and carried through the view so the HUD draws the right
  number of cannon toggles. The client also needs the new class sprite when the
  `shipTypeId` changes between battles.
- **Boss.** It is built from the same pieces (a class plus carry-over hull and
  cannons for the AI ship), so it can out-class a fully upgraded hero.

**Areas (decided with the user: 5 graphs to start).**
- A run is an ordered list of areas. Each area is a seeded layered graph (derived
  from the run seed and the area number) that starts at a landfall and ends at its
  boss. The ship, its upgrades, hull, ammo and supplies all carry on from one
  area to the next.
- Each area is **bigger than the one before**: starting guess of 10, 12, 14, 16
  and 18 layers, one to three nodes per layer. The number of areas, the layer
  counts and the mix of node kinds are configuration, not code, so a playtest
  can run one or two areas.
- **Ports are frequent and placed on purpose**: the first node of an area is a
  landfall port (free repair and a supply restock after the last boss), a port
  sits one layer before the boss so the ship can always be repaired and upgraded
  before that fight, and more ports are spread through the middle. Slice E sets
  the counts so a run offers enough upgrades overall; reaching a new ship class
  before a given boss is not required.
- **Difficulty and look rise by area:** the sea style steps from calm toward
  stormy, wind and whirlpools appear later, and enemy class, count and AI level
  rise within and across areas.
- **Bosses:** one per area. In v1 each is a Galleon flagship with escorts under
  the ambush rules, stronger each time (carry-over hull and cannons for the AI
  ship); the Kraken and other monsters replace or join them in phase 9.
- **Length:** five areas is a long run (dozens of battles). The save must work
  across sessions (a run is resumed, not restarted), and slice E measures how long
  a run takes so the layer counts can be cut if it is too long.

**Design.**
- **Map:** a layered graph, per area:, one or two nodes per layer, and the player picks a
  path. `run-core` models it as a generic graph (nodes with coordinates, edges
  with a cost, region tags) so bigger maps, nested graphs or a grid sea can feed
  it later. Generation is seeded and pure; every node can be reached from the
  start and every path ends at the area's boss.
- **Supplies:** one number. A route edge costs the ship class's `supplyUse`
  (sloop 1, brigantine 2, galleon 3); the hold holds at most `cargoCap` (8, 12,
  18). A run starts full. At zero, each leg costs 1 hull instead of ending the
  run. No gold in this phase: ports restock supplies directly, and gold waits for
  the phase 8 hub shop.
- **Node types:** start; battle (standard, merchant, salvage, survive, ambush);
  port (including each area's landfall); boss. Fortress and hunt nodes arrive
  with the fort art and phase 9.
- **Battle node:** `run-core` builds the `MatchConfig` from the node (objective,
  sea, enemy class and count, AI level) plus the hero's `carryOver` (hull, ammo,
  modifiers), then reads the `MatchResult` afterwards. AI level and enemy class
  rise with depth, easy to hard.
- **Rewards:** winning pays supplies by objective, a merchant kill the most.
  Upgrades come only from ports.
- **Port:** repair some hull, restock some supplies, and pick 1 of 3 upgrades. A
  landfall port gives a larger repair and restock.
- **Upgrade pool (v1):** reinforce hull (the ship grows, see below), add a cannon
  to each broadside, cannon damage +1 (stacks; the `cannonDamage` modifier
  exists), +3 cannonballs, repair 2 hull, +4 supplies. More kinds can join the
  pool in slice B or C without changing the shape: a bigger cargo cap, extra
  tokens.
- **Saving:** one active run, in a versioned `localStorage` key; resume or
  abandon. The run seed is stored (so a shareable or daily seed can come later).
- **Rules that always apply:** carry-over is only set by `run-core` (no URL,
  lobby option or socket can set it, as in phase 5), and the run engine is pure
  and deterministic for a given seed.

**Slices, in order (none started).**
- [x] A. `run-core` skeleton: package setup, the seeded graph generator for an area
      (size, port placement, boss at the end), the list of areas, and tests for
      determinism, reachability from start to boss, a port before every boss, and
      growing size. Done: `packages/run-core` (`graph/generateArea.ts`,
      `graph/query.ts`, `graph/types.ts`, `config/areas.ts`, `rng.ts`). Starting
      numbers in `AREAS`: 10, 12, 14, 16 and 18 layers, one to three nodes a layer,
      a port every 3rd layer in the middle, plus the landfall and the port before
      the boss; the sea goes calm, normal, normal, stormy, stormy. One route is
      about 6 to 12 battles per area, so a whole run is on the order of 45
      battles: slice E must measure whether that is too long.
- [x] B. Run state and rules: pure reducers for start, travel (supplies and
      starvation), building a node's battle config, applying a result, port
      actions, the move from one area to the next, win or lose, and serialising
      the state for the save. Done, in `packages/run-core/src/run/`: `rules.ts`
      (every number in one place), `types.ts`, `upgrades.ts`, `battle.ts`
      (`buildBattle`), `engine.ts` (`startRun`, `applyAction`, `availableMoves`,
      `legCost`) and `save.ts` (`serializeRun`, `parseRun`, version 1). The run
      opens at the first landfall with an upgrade to pick. Actions: `travel`,
      `chooseUpgrade`, `finishBattle` (takes a `MatchResult`) and `abandon`.
      - **Hull level and cannon count** are kept in the run state and reach real
        battles through slice C (below).
      - **First numbers, all in `rules.ts` and `battle.ts`:** supply rewards 2 to 4
        a won battle; ports repair 2 and restock 3 (a landfall repairs 4 and fills
        the hold); the enemy fleet grows from one Sloop (easy) to three Galleons
        (hard) over the run. A scripted always-win run is about 65 legs, 45 to 49
        battles and 21 to 25 upgrades, and reaches the fully upgraded ship, but
        **supplies never ran low** (the lowest hold was 6), so supplies add no
        tension yet and the run is very long: slice E has to settle both.
- [x] C. Small `game-core` additions, optional fields only: carry-over `maxHull`
      and `cannonsPerSide` (read in `createGame.ts` and shown in the view and
      HUD), and a boss config helper. Done: `CarryOver` gains `maxHull` (1 to 20)
      and `cannonsPerSide` (1 to 4), held to those limits by `carriedMaxHull` and
      `carriedCannons`; `createShip` takes optional overrides and `createGame`
      reads them from the carry-over, and the carried hull is still held between 1
      and the ship's own maximum. Absent fields change nothing (the golden
      snapshots are unchanged). The view, the plan checks, the AI, the HUD and the
      ship art already read cannon counts from each ship's mounts and hull from
      `maxHp`, so nothing else needed changing. `run-core`'s `buildBattle` now
      passes the hero's `maxHull` (`4 + hull level`) and `cannonsPerSide`.
      - **No game-core boss helper:** the boss strength lives in `run-core`
        (`bossLoadout(areaIndex)` in `run/rules.ts`: flagship hull `6 + 2 * area`,
        3 cannons a side, 4 from area 4) and is passed as the flagship's
        carry-over, since a carry-over works for any ship, not only the hero's.
      - **Not seen:** how the art looks with three cannons on a Sloop or four on
        the flagship (the art spaces cannons 24 px apart along the hull, so it
        should fit); a real match with a grown ship was not played in a browser.
- [x] D. Client: a run store, the real Voyage screen (one area at a time, with
      the area number) replacing the preview's illustrative data, a node card, the
      Port screen, an area-cleared screen, and a hook in
      `GameScreen` so a run's game-over shows Continue (or Abandon after a loss)
      instead of Sail again. Done:
      - `apps/client/src/run/runStore.ts`: a zustand store over `run-core`, saved
        in `localStorage` (`pirate:run:v1`) after every step and read back through
        `parseRun`; a save it cannot read is ignored. A finished voyage stays
        saved until the player starts a new one or goes to the main menu.
      - `ui/voyage/`: `VoyageFlow` picks the screen for the voyage's phase:
        an intro (no voyage), `VoyageMapScreen` (the whole area as rows of
        `MapNode`s, the stops in reach pressable, a card with the leg's supply
        cost and a warning when the hold cannot pay), `PortScreen` (what the port
        did, then 1 of 3 upgrades with their effects shown), `BattleBriefingScreen`
        (the objective, your class and cannons, the enemy fleet, skill and sea) and
        `VoyageEndScreen` (victory or defeat, with the numbers). Banners tell the
        player what the last step did (supplies, starvation, a refit, an area
        cleared). Abandoning asks first.
      - A voyage battle runs through `App.tsx`: `startRunBattle` starts the match
        from `buildBattle`, and `GameScreen` takes a `runBattle` prop so its
        game-over dialog offers only Continue (or See the result after a loss) and
        hands the `MatchResult` back; leaving after being sunk loses the voyage
        (a new `loseBattle` action). The menu then opens on the voyage again.
      - Small `run-core` additions: `path` (the stops visited in the area, so the
        map can show cleared ones; saved), `loseBattle`, and a `briefing` on
        `BattleSetup`.
      - **Not seen:** a battle played through to a real win or loss inside a
        voyage (the in-app browser needs rendered frames to advance a turn, so I
        checked the game-over, Continue, map, refresh and abandon paths by setting
        the game's store to a finished state), the screens at phone width, and the
        Spanish and Polish texts (machine-drafted).
      - **Known:** refreshing the page during a battle, before pressing Continue,
        replays the battle (the voyage is only changed when the result is
        handed in), so a lost fight can be retried by reloading.
- [ ] E. Balance harness: the AI plays whole runs offline, to tune supply costs,
      rewards, upgrade strength, port counts, area sizes and difficulty by
      completion rate, and measures how long a run takes, before the user plays it.
      **The harness is built; the tuning is not done** (it needs the user's
      targets, see "What the harness found" below).
      - `pnpm harness:run [--runs N] [--areas K] [--skill easy|normal|hard|matched]
        [--scripted] [--playon] [--route smart|first|random] [--seed0 N]
        [--json file] [--quiet]` (`packages/run-core/scripts/harness.ts`, with the
        bot in `src/sim/`: `botPlayer.ts`, `policies.ts`, `summary.ts`). A bot plays
        whole voyages on the real maps. Battles are real AI-versus-AI matches
        (`runMatch`), with the hero piloted by the AI at a fixed level or `matched`
        (as good as the enemy it faces, the default). `--scripted` skips fighting
        (every battle won at a hull cost that grows with depth) to measure the
        economy and the length on their own. `--playon` records a lost battle and
        carries on, so every battle is measured and not only the ones the bot
        survives to reach. The bot is a yardstick, not a person: an AI pilot is
        worse than a person, and a draw counts as a loss, so read the numbers as
        better or worse than before, over the same seeds.
      - **What the harness found (the first numbers, before any tuning; 6 voyages
        of 5 areas, seeds 1 to 6):**
        - **Length:** 65 legs and 46 battles a run (about 300 turns of fighting).
          That is a very long voyage: at half a minute a turn it is several hours.
        - **Supplies never bind:** the hold averaged 14.5 as a leg began and never
          fell below 8; no leg ever starved. Rewards and port restocks outrun the
          cost of the legs, so supplies add no tension yet.
        - **Upgrades max out early:** 24 picks a run (one per port), but a fully
          grown ship needs only 12 (hull level 6, 3 cannons, +3 damage). Every run
          met the area 2 boss to the area 5 boss as a Galleon, so the later areas
          bring nothing new to the ship; the other picks are filler.
        - **Fights get harder than the upgrades can answer:** with a pilot as good
          as the enemy (draws are rare, 0 to 8 per cent), the win rate was 50 per
          cent in area 1 and fell to 46, 25, 28 and 17 per cent over the next four
          areas (boss 13 per cent, ambush 19, salvage 12). Easing the enemy (at most
          two ships, bigger ships later, a softer AI) only moved it to 50, 40, 29,
          38 and 26 per cent, so it is not only the enemy fleet. Upgrades hardly tilt
          an even fight for the bot (area 1 stays near 50 per cent). The bot may not
          make use of cannons and damage the way a person would, and ammo (3 to 5
          cannonballs, 1 reloaded a turn) may be the real limit on a ship with
          three cannons a side.
        - **A lost battle ends the run, over about 46 battles.** With that rule a
          run is only completed if nearly every fight is won: at 95 per cent a
          battle, 46 battles give a completion rate of about 9 per cent. Most
          ordinary fights have to be close to safe for a good player, and the real
          danger has to sit in the bosses and ambushes.
      - **To decide with the user before tuning:** how often a good player should
        complete a run (and so how safe an ordinary fight should be); whether the
        voyage should be shorter than 46 battles; whether supplies should bind (a
        harsher starvation, or smaller rewards and restocks); whether the upgrade
        ladder should stretch over five areas (a higher hull cap, more cannon and
        damage levels, or a pool that offers fewer filler picks); and a play test
        by the user, since the bot cannot say how the fights feel.
- [ ] F. Docs: this file and the handoff.

**Open questions.**
- **How many upgrades a run gives** is now settled by ports and nodes rather than
  by picks per port (the user chose more ports and more nodes, one pick each).
  Slice E checks that this gives enough upgrades over the whole run, and that five
  areas do not give so many that the ship is maxed out far too early. A new class
  before each boss is not a goal.
- Whether the run's hull thresholds and ladder cap (starting values accepted)
  leave room for growth across five areas, or whether the later areas need more
  hull levels or a class above the Galleon.
- Exactly how much each objective pays and how much a port restocks (slice E
  answers this with numbers).
- Whether a run can be abandoned from the map at any time without penalty (the
  default assumed here).

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
