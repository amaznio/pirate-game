# Atlantean ships (runtime asset)

`ships.png` (720x672) is a drop-in for `../scallywag/ships.png`: the same layout, so every
frame box in `src/phaser/assets/scallywag.ts` works on it. The hulls, sails, cannons, smoke
and explosions are drawn in the regal Atlantean style; the yards, emblems, wreck row and
wake are copied from the Scallywag sheet (CC0, Pixel Carvel / Foozle).

It also holds a cannon in each of the five hull colours (a strip at x 460, y 642).

Regenerate with `python tools/art/atlantean_ships.py` (run from the repo root), then copy
`docs/media/atlantean-ships/ships-atlantean.png` here as `ships.png`.

Switch to it with `?ships=atlantean`.
