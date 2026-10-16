"""Makes a ghost fleet: the Scallywag ship sheet recoloured to a spectral, Flying Dutchman look.

The ghost sheet has exactly the layout of apps/client/public/assets/scallywag/ships.png
(720 x 672), so every frame box in scallywag.ts works on it unchanged and the game
could load it in place of the living ships. Every frame is recoloured by brightness
through a sickly-green ramp (a different one per team so the five hull colours still
tell apart), the hulls and spars go translucent and frayed at the edges, the sails go
thin and tattered and the cannons and smoke go to ghost-fire green.

Run from the repo root:  python tools/art/ghost_ships.py
Writes docs/media/ghost-ships/ships-ghost.png and compare.png.
"""
import os

import numpy as np
from PIL import Image, ImageDraw

SRC = os.path.join('apps', 'client', 'public', 'assets', 'scallywag', 'ships.png')
OUT_DIR = os.path.join('docs', 'media', 'ghost-ships')
SEA = (0x1c, 0x85, 0xd9)

# brightness ramps, dark to bright: five stops each
RAMPS = {
    0: ((0x04, 0x12, 0x12), (0x10, 0x36, 0x30), (0x26, 0x6c, 0x58), (0x5c, 0xb0, 0x8c), (0xb8, 0xf4, 0xd0)),   # brown: spectral green
    1: ((0x08, 0x16, 0x10), (0x1c, 0x40, 0x30), (0x3c, 0x82, 0x58), (0x8c, 0xc8, 0x84), (0xdc, 0xfc, 0xb0)),   # tan: pale lime
    2: ((0x04, 0x14, 0x1c), (0x10, 0x38, 0x48), (0x24, 0x70, 0x80), (0x58, 0xb4, 0xc0), (0xb0, 0xf0, 0xf4)),   # red-orange: cold teal
    3: ((0x04, 0x10, 0x20), (0x10, 0x30, 0x4c), (0x28, 0x62, 0x80), (0x60, 0xa4, 0xc0), (0xc0, 0xe8, 0xf8)),   # navy: deep blue-green
    4: ((0x06, 0x1a, 0x16), (0x18, 0x4c, 0x3c), (0x34, 0x96, 0x70), (0x84, 0xe0, 0xa8), (0xf0, 0xff, 0xd8)),   # gold-trimmed: bright mint
    'grey': ((0x0c, 0x14, 0x14), (0x24, 0x38, 0x34), (0x44, 0x66, 0x5c), (0x74, 0x98, 0x8a), (0xb8, 0xd4, 0xc4)),
    'cannon': ((0x04, 0x0c, 0x0c), (0x10, 0x28, 0x24), (0x24, 0x52, 0x44), (0x4c, 0x90, 0x70), (0xa0, 0xe8, 0xb8)),
    'fire': ((0x06, 0x30, 0x20), (0x20, 0x90, 0x58), (0x60, 0xe0, 0x90), (0xb4, 0xff, 0xc8), (0xf4, 0xff, 0xf0)),
}
# the sails, by their six colours: grey, cream, green, yellow, blue, red
SAIL_RAMPS = [
    ((0x14, 0x24, 0x24), (0x40, 0x68, 0x60), (0x80, 0xac, 0x9c), (0xb8, 0xdc, 0xcc), (0xec, 0xff, 0xf4)),
    ((0x18, 0x2c, 0x24), (0x50, 0x7c, 0x68), (0x98, 0xc4, 0xa0), (0xcc, 0xec, 0xc4), (0xf4, 0xff, 0xe8)),
    ((0x08, 0x2c, 0x1c), (0x1c, 0x64, 0x40), (0x3c, 0xa8, 0x68), (0x84, 0xe4, 0x9c), (0xd0, 0xff, 0xd8)),
    ((0x1c, 0x2c, 0x0c), (0x48, 0x68, 0x1c), (0x88, 0xac, 0x34), (0xc4, 0xe0, 0x60), (0xf0, 0xff, 0xa8)),
    ((0x08, 0x20, 0x2c), (0x18, 0x50, 0x64), (0x34, 0x94, 0xa8), (0x78, 0xd0, 0xdc), (0xc8, 0xf8, 0xfc)),
    ((0x1c, 0x14, 0x28), (0x44, 0x3c, 0x5c), (0x7c, 0x78, 0x90), (0xb0, 0xb8, 0xac), (0xe0, 0xf0, 0xd8)),
]
YARD_RAMP = ((0x08, 0x14, 0x10), (0x28, 0x3c, 0x34), (0x50, 0x70, 0x60), (0x84, 0xa8, 0x94), (0xc0, 0xdc, 0xc8))

# the living hulls differ a lot in brightness (navy dark, red and gold light): even them out
HULL_GAIN = {0: 1.15, 1: 1.0, 2: 0.95, 3: 1.45, 4: 0.58, 'grey': 1.2}
HULL_ALPHA = 218
SAIL_ALPHA = 168
YARD_ALPHA = 225


def noise(x, y, salt=0):
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65536.0


def ramp_colour(ramp, lum):
    """Linear blend between the five stops for a brightness in [0, 1]."""
    pos = min(0.9999, max(0.0, lum)) * (len(ramp) - 1)
    i = int(pos)
    t = pos - i
    return tuple(int(round(ramp[i][c] * (1 - t) + ramp[i + 1][c] * t)) for c in range(3))


def luminance(rgb):
    r, g, b = (int(v) for v in rgb)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0


def hull_ramp_key(x, y):
    """Which team ramp a pixel of the hull part of the sheet takes, from where it sits."""
    if x >= 400:
        return 'grey' if y >= 384 else min(4, (x - 400) // 48)
    if x >= 160:
        return 'grey' if y >= 240 else min(4, (x - 160) // 48)
    return 'grey' if y >= 192 else min(4, x // 32)


def region_of(x, y):
    if x >= 400 and y < 512:
        return 'hull'
    if x < 400 and y < 320:
        return 'hull'
    if x < 400 and 320 <= y < 480:
        return 'sail'
    if x < 192 and 480 <= y < 600:
        return 'yard'
    if x < 400 and 480 <= y < 600:
        return 'keep'  # the sail emblems stay as they are
    if x < 300 and y >= 600:
        return 'hull'
    if 440 <= x < 560 and 560 <= y < 608:
        return 'cannon'
    if 440 <= x < 520 and 608 <= y < 650:
        return 'fire'
    return 'keep'


def is_gold(rgb):
    r, g, b = (int(v) for v in rgb)
    return r > 150 and g > 0.62 * r and g > b + 60


def ghostify(sheet):
    h, w = sheet.shape[:2]
    out = sheet.copy()
    opaque = sheet[..., 3] > 0
    for y in range(h):
        for x in range(w):
            if not opaque[y, x]:
                continue
            region = region_of(x, y)
            rgb = sheet[y, x, :3]
            lum = luminance(rgb)
            if region == 'hull':
                key = hull_ramp_key(x, y)
                if key == 4 and is_gold(rgb):
                    col = (0xf4, 0xff, 0xc8)  # the gold trim burns pale
                else:
                    col = ramp_colour(RAMPS[key], min(1.0, (lum ** 0.7) * HULL_GAIN[key]))
                out[y, x] = (*col, HULL_ALPHA)
            elif region == 'sail':
                col_index = min(5, x // 64)
                out[y, x] = (*ramp_colour(SAIL_RAMPS[col_index], lum), SAIL_ALPHA)
            elif region == 'yard':
                out[y, x] = (*ramp_colour(YARD_RAMP, lum), YARD_ALPHA)
            elif region == 'cannon':
                out[y, x] = (*ramp_colour(RAMPS['cannon'], lum), 235)
            elif region == 'fire':
                out[y, x] = (*ramp_colour(RAMPS['fire'], max(lum, float(sheet[y, x, 3]) / 400.0)), sheet[y, x, 3])
    return fray(out, opaque)


def fray(sheet, opaque):
    """Eat the ragged edges: hull edges crumble a little, sails go to rags toward their lower edge."""
    h, w = sheet.shape[:2]
    out = sheet.copy()
    pad = np.pad(opaque, 1)
    edge = opaque & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    for y in range(h):
        for x in range(w):
            if not opaque[y, x]:
                continue
            region = region_of(x, y)
            if region == 'hull' and edge[y, x] and noise(x, y, 11) < 0.2:
                out[y, x, 3] = 0
            elif region == 'sail':
                # position inside the sail frame: sails sit in 32 px columns, in rows 5-10 px tall
                fy = (y - 328) % 35
                depth = min(1.0, fy / 10.0)
                if noise(x, y, 17) < 0.05 + 0.32 * depth * depth:
                    out[y, x, 3] = 0
                elif noise(x, y, 19) > 0.9:
                    out[y, x, 3] = max(0, out[y, x, 3] - 70)
    return out


# --------------------------------------------------------------------------- a comparison picture

HULLS = {
    'small': (0, 32, 32, 64, {'intact': 0, 'damaged': 64, 'split': 128}),
    'medium': (160, 48, 48, 80, {'intact': 0, 'damaged': 80, 'split': 160}),
    'large': (400, 48, 48, 128, {'intact': 0, 'damaged': 128, 'split': 256}),
}


def crop(img, x, y, w, h):
    return img.crop((x, y, x + w, y + h))


def assemble(sheet_img, size, colour, state='intact', sail=None, yard=None):
    """A ship from its parts, as a small picture: hull, a yard across the middle and a sail on it."""
    x0, pitch, w, h, rows = HULLS[size]
    ship = Image.new('RGBA', (w + 16, h + 4), (0, 0, 0, 0))
    ship.alpha_composite(crop(sheet_img, x0 + pitch * colour, rows[state], w, h), (8, 2))
    if state == 'intact' and sail is not None:
        sail_box = (2, 363, 28, 7) if size != 'small' else (6, 328, 20, 5)
        yard_box = (0, 551, 32, 15)
        yimg = crop(sheet_img, yard_box[0] + 32 * yard, yard_box[1], yard_box[2], yard_box[3])
        simg = crop(sheet_img, sail_box[0] + 64 * sail, sail_box[1], sail_box[2], sail_box[3])
        cx = (w + 16) // 2
        cy = h // 2 - 2
        ship.alpha_composite(yimg, (cx - 16, cy))
        ship.alpha_composite(simg, (cx - sail_box[2] // 2, cy + 2))
    return ship


def compare():
    living = Image.open(SRC).convert('RGBA')
    ghost = Image.open(os.path.join(OUT_DIR, 'ships-ghost.png')).convert('RGBA')
    scale = 3
    fleet = [
        ('small', 0, 'intact', 0, 1), ('medium', 1, 'intact', 1, 4), ('large', 2, 'intact', 2, 2),
        ('medium', 3, 'intact', 4, 3), ('large', 4, 'intact', 3, 5), ('medium', 0, 'damaged', None, None),
        ('large', 3, 'split', None, None),
    ]
    tiles = [(assemble(src, s, c, st, sa, ya)) for src in (living, ghost) for s, c, st, sa, ya in fleet]
    n = len(fleet)
    cell_w = max(t.width for t in tiles) * scale + 16
    cell_h = max(t.height for t in tiles) * scale + 16
    canvas = Image.new('RGBA', (cell_w * n + 16, cell_h * 2 + 16), (*SEA, 255))
    # a faint dark sea under the ghosts, so the glow reads
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, cell_h + 8, canvas.width, canvas.height], fill=(0x0e, 0x4a, 0x78, 255))
    for i, t in enumerate(tiles):
        row, col = divmod(i, n)
        big = t.resize((t.width * scale, t.height * scale), Image.NEAREST)
        canvas.alpha_composite(big, (16 + col * cell_w, 16 + row * cell_h + (cell_h - 16 - big.height) // 2))
    canvas.save(os.path.join(OUT_DIR, 'compare.png'))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    sheet = np.array(Image.open(SRC).convert('RGBA'))
    ghost = ghostify(sheet)
    Image.fromarray(ghost, 'RGBA').save(os.path.join(OUT_DIR, 'ships-ghost.png'))
    compare()
    print('wrote ships-ghost.png and compare.png to', OUT_DIR)


if __name__ == '__main__':
    main()
