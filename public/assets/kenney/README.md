# Kenney Pirate Pack (runtime assets)

Source: https://kenney.nl/assets/pirate-pack — CC0 (public domain), see `License.txt`.

These are the only files the game loads at runtime. The full downloaded pack
(individual PNGs, retina, vector) does not need to live in the repo; keep it
wherever you downloaded it and copy new files here as needed.

## Files

- `tiles_sheet.png` — terrain tilesheet. **1024x384, 64x64 tiles, no margin**
  (16 columns x 6 rows = 96 tiles): sand/beach, grass, boulders, foliage,
  crates/barrels, stone/masonry, one water tile.
- `shipsMiscellaneous_sheet.png` + `.xml` — Sparrow/Starling atlas
  (1024x512). Contains 24 complete ships (`ship (1)`..`ship (24)`, 66x113,
  pointing north) plus hulls, sails, cannons, flags, crew, `cannonBall`
  (10x10), `explosion1/2/3`, `fire1/2`, `nest`, `pole`, `wood`.

## Loading (Phaser)

```ts
this.load.spritesheet('tiles', 'assets/kenney/tiles_sheet.png', {
  frameWidth: 64,
  frameHeight: 64,
});
this.load.atlasXML(
  'ships',
  'assets/kenney/shipsMiscellaneous_sheet.png',
  'assets/kenney/shipsMiscellaneous_sheet.xml',
);
```

Keys are centralised in `src/phaser/assets/AssetKeys.ts`; the placeholder
generators in `BootScene.ts` are replaced by the loads above.
