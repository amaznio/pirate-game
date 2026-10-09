# Art assets

The game uses the **Kenney "Pirate Pack"** (CC0). The runtime files live in
`public/assets/kenney/` and are loaded in `src/phaser/scenes/BootScene.ts`:

- `tiles_sheet.png` — 64x64 terrain spritesheet (water, sand, grass, rocks).
- `shipsMiscellaneous_sheet.png` + `.xml` — ship/effect atlas.

Texture keys and frame ids are centralised in
`src/phaser/assets/AssetKeys.ts`. No simulation or React code references
filenames, so swapping art only touches `AssetKeys.ts` + `BootScene.ts`.

See `public/assets/kenney/README.md` for the sheet layout and how to add new
frames.

## Orientation

The Kenney ship art points **north** at rotation `0`; `HEADING_ANGLE` in
`src/phaser/views/ShipView.ts` maps headings accordingly. Keep new ship art in
the same orientation or update that map.
