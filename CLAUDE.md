# Battle Navigation

A grid-based pirate naval tactics game. Players plan four moves a turn in secret and all ships resolve
simultaneously in four phases (move, the sea acts, fire, damage). A pnpm monorepo:

- `packages/game-core`: the pure TypeScript simulation, AI, host controller, views and protocol. No DOM.
- `packages/run-core`: the solo voyage (route maps, upgrades, plunder, save), built on game-core.
- `apps/client`: React HUD and a Phaser board, Vite. Single-player runs in the page against AI.
- `apps/server`: Node and Socket.IO rooms for online play, deployed to Railway (`docs/DEPLOY.md`).

Work state lives in **Linear** (team Pirate Game), design decisions and phases in `docs/ROADMAP.md`. There is
no handoff file: read the open issues, `docs/ROADMAP.md` for the area you touch, and `git log`.

Commands: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm dev` (client 5173, server 3001; set
`CLIENT_ORIGIN='*'` for two origins), `pnpm harness` (AI duels; `--monsters`, `--classes`, `--loot`),
`pnpm harness:run` (whole solo voyages; options in `packages/run-core/scripts/harness.ts`),
`pnpm smoke --server URL [--client URL]`. URL switches for looking at things: `?art=kenney`, `?sea=lines`,
`?bands=on`, `?water=pack`, `?lab=art`, `?seed=N&map=calm|normal|stormy|open`, `?ais=N`, `?ship=`, `?enemy=`,
`?ships=atlantean`, `?loot=on`, `?hunt=on` (`&warn=on`), `?lang=`.

## How to work with this user

- **Plan first.** For anything sizeable give a concrete plan with defaults and open questions, make no
  changes, then wait for "start". They answer with "defaults", numbered choices or "Go with A".
- **Every plan and every change needs a Linear issue** (the right project: Sea monster hunting, Phase 7: Solo
  voyage, Phase 8: Accounts and Postgres). Create it when the plan is made, before building, and create one after
  the fact for any change that has none. Mark it Done with the commit hash once it lands, and say plainly in it
  what was not seen or measured.
- **Commit only when asked**, never push unasked, split commits by concern (one per issue when asked), and test
  the staged state alone (`git stash push --keep-index`, run, `git stash pop`). End commit messages with the
  Co-Authored-By trailer the session gives.
- **Judge visuals by eye.** They send short verdicts ("too busy", "looks like bubbles") and often prefer the
  previous version: restore it from git rather than defending the new one. Say plainly what you could and could not
  see (WebGL is the usual gap) and name the constants to tune. Offer a switch to compare instead of replacing.
- **A bot cannot judge feel.** The harnesses show direction only; the user's play-through decides balance.
- Keep UI wording and names consistent: it is "plunder" now, not "supplies".

## Rules that always apply

- Every new field is optional and its absence changes nothing; the golden snapshots (`golden.test.ts`) stay
  green unless a rule is deliberately changed, and then they are refreshed in the same commit.
- Socket protocol changes are additive. Rules stay in `game-core`, deterministic. The database stays optional.
  Each feature is playable from the menu or a default-off setting.
- `carryOver` on a match is set only by code that builds a match (a voyage). It is never reachable from a URL,
  the lobby or the socket, so it cannot be cheated. Keep it that way.
- The AI never reads a monster's hidden plan. A departed ship's hull is 0 and `hullOnExit` holds what it left with.
- `createGame()` with no config and the controller default are a duel on open water. Tests must not depend on a
  generated board.
- The voyage save version bumps whenever the saved shape or the generated maps change (it is 5 now); an old save
  is refused, not misread.
- UI: shadcn primitives (`apps/client/src/components/ui`), custom widgets in `src/kit`, one token source in
  `src/index.css`. No raw hex, `rgb()` or `hsl()` in `ui/`, `kit/`, `app/`, `components/` (a test fails; a line
  ending `raw-colour-ok` is allowed). The shadcn CLI writes `from "cn"`: change it to `@/lib/utils`.
- Text: `i18n/locales/en.json` is the source of truth and the keys are typed. Spanish and Polish are
  machine-drafted and need a native speaker (PIR-68). Polish has four plural forms.
- Keep the old token buttons, plan slots and cannon toggles as they are unless asked.

## Art taste

Crisp, flat, banded pixel art in the ship-sheet style: no gradients or speckle, drawn from code (`tools/art/`
scripts sharing `pixel.py`; run one script at a time from the repo root, they write into
`apps/client/public/assets/`). Icons with a purpose; assets over plain text in dialogs.

The sea (default `scallywag` art): depth worked out from the board and kept still, small ripples that grow and fade
in place, foam round rocks, a slow tide. Rejected, do not bring back as defaults: a tiled water picture ("bubbles"),
long contour lines scrolled across the sea, soft moving swell bands (kept behind `?bands=on`). Spray off rocks is
built but off (`spray: 0` in `seaLook.ts`). Rocks are single stones, clumps up to 2x3 and thin ridges, never big
boxes. Depth must not move; no clashing wave directions; a wake trails the stern; wind pushes one cell a phase.
Tiles stay 64 px and ships native size; the pixel camera moves in whole steps.

## Tooling gotchas (this machine)

- **Bash heredocs break on apostrophes**, in comments and test names too. Write files with the Write tool, or write a
  Python script file with it and run that (`PYTHONUTF8=1`, `python -I`).
- **Line endings:** `core.autocrlf` is true. The repo stores LF, the working tree CRLF. Edit files in bytes mode from
  Python so lines do not all change. A file can show as modified with no real change; `git add` clears it.
- **The in-app browser** may not run WebGL (it drew the board once at `/?ais=3&seed=3`: try it first). If not,
  temporarily switch `Phaser.AUTO` to `Phaser.CANVAS` in `phaser/PhaserGame.ts` and `lab/mountArtLab.ts`, mark it
  `// TEMP-VERIFY`, revert it and `grep -rn TEMP-VERIFY apps packages`. A hidden pane stops animation frames. Emulated
  viewport screenshots are often cropped or stale: read the DOM instead, and reset to the desktop preset.
- A leftover dev server can hold port 5173; navigate to it instead of `preview_start`. Stop servers you start.
  `.claude/launch.json` is committed; keep it.
- Sprites cut from one sheet bleed on fractional pixels or rotation: use padded copies and whole-pixel steps.
- A few slow tests (a run-core battle test, the client sea-depth test) can time out on a loaded machine and pass alone.
