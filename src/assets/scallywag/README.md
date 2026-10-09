# Scallywag assets

The game currently renders **programmatic placeholder textures** generated in
`src/phaser/scenes/BootScene.ts`, so it runs from a clean checkout with no
external art.

When the Scallywag asset packs are available, drop the files in this folder
(for example `ship_player.png`, `ship_enemy.png`, `rock.png`, `island.png`,
`cannonball.png`) and update only:

1. `src/phaser/assets/AssetKeys.ts` — the central key registry.
2. `src/phaser/scenes/BootScene.ts` — replace the `create*` placeholder
   generators with `this.load.image(...)` / `this.load.atlas(...)` calls, or
   move them to a `preload()` method.

No simulation or React code references texture filenames, so no game rules
change when swapping in real art.

## Placeholder orientation

The generated ship textures point **east** at rotation `0`. Keep new ship art
in the same orientation, or adjust `HEADING_ANGLE` in
`src/phaser/views/ShipView.ts`.
