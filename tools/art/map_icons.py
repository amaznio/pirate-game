"""Draws the pixel-art pictures for the voyage map: one icon for each kind of stop, and our ship.

The icons are 32 x 32 and drawn in the ship-sheet style (see pixel.py): a crisp outline,
flat banded tones and a rim light on the top left. The ship markers are put together from
the Scallywag ship sheet itself (a hull, a yard and a sail), so the map shows the very ship
the player sails: a sloop, a brigantine or a galleon.

Run from the repo root:  python tools/art/map_icons.py
Writes apps/client/public/assets/map/stop-<kind>.png and ship-<class>.png, and a
contact sheet in .scratch/map/.
"""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from pixel import blank, ell, erode, interior, line_px, paste, poly, put, render, stroke  # noqa: E402

N = 32
OUT = os.path.join('apps', 'client', 'public', 'assets', 'map')
SHEET = os.path.join('apps', 'client', 'public', 'assets', 'scallywag', 'ships.png')

STEEL = ((0x1a, 0x22, 0x34), (0x4a, 0x5a, 0x78), (0x80, 0x92, 0xb0), (0xb8, 0xc8, 0xdc), (0xf2, 0xf8, 0xff))
WOOD = ((0x2c, 0x16, 0x0c), (0x6a, 0x3c, 0x1c), (0x9a, 0x5e, 0x30), (0xc8, 0x88, 0x4a), (0xf0, 0xb8, 0x78))
GOLD = ((0x44, 0x2a, 0x08), (0x92, 0x62, 0x1c), (0xcc, 0x98, 0x38), (0xf0, 0xcc, 0x6a), (0xff, 0xf4, 0xb0))
BONE = ((0x4a, 0x38, 0x28), (0xa8, 0x90, 0x68), (0xdc, 0xca, 0xa0), (0xf4, 0xea, 0xd0), (0xff, 0xfc, 0xee))
GLASS = ((0x1c, 0x3c, 0x5c), (0x4c, 0x84, 0xb4), (0x8c, 0xc4, 0xe8), (0xc8, 0xec, 0xfc), (255, 255, 255))
FLAG = ((0x06, 0x08, 0x10), (0x14, 0x18, 0x28), (0x24, 0x2a, 0x40), (0x3c, 0x44, 0x62), (0x60, 0x6c, 0x90))
ANCHOR = ((0x2a, 0x34, 0x4c), (0x78, 0x8c, 0xb0), (0xb4, 0xc6, 0xe0), (0xe0, 0xec, 0xfa), (255, 255, 255))
SAND = ((0x6a, 0x50, 0x30), (0xb8, 0x98, 0x60), (0xe4, 0xcc, 0x90), (0xf4, 0xe4, 0xb4), (0xfc, 0xf4, 0xd8))
GRASS = ((0x10, 0x40, 0x18), (0x20, 0x78, 0x2c), (0x34, 0xa8, 0x40), (0x5c, 0xd0, 0x5c), (0xa0, 0xf0, 0x90))
RED = ((0x3a, 0x12, 0x18), (0x8c, 0x2c, 0x2e), (0xc6, 0x4e, 0x3a), (0xee, 0x82, 0x58), (0xff, 0xc8, 0x98))
SUCKER = (0xf8, 0xe4, 0xc0)
FOAM = (0xe4, 0xf6, 0xff)


def add(layer, mask, pal, **kw):
    paste(layer, render(mask, pal, **kw))


def waves(layer, y, x0=3, x1=29):
    """A little line of sea under an icon: pale crests."""
    for x in range(x0, x1):
        if (x // 3) % 2 == 0:
            put(layer, x, y, FOAM)
        elif (x // 3) % 2 == 1 and x % 3 == 1:
            put(layer, x, y + 1, (0x9c, 0xd4, 0xf0))


def sabre(layer, flip):
    """One cutlass from the top left to the bottom right (mirrored when flip): blade, guard, grip, pommel."""
    def p(x, y):
        return (N - 1 - x if flip else x, y)
    blade = poly(N, N, [p(5, 4), p(7, 3), p(22, 17), p(20, 20), p(18, 19), p(5, 6)])
    add(layer, blade, STEEL)
    guard = stroke(N, N, [p(18, 23), p(25, 16)], 3)
    add(layer, guard, GOLD)
    grip = stroke(N, N, [p(22, 21), p(26, 25)], 3)
    add(layer, grip, WOOD)
    add(layer, ell(N, N, *p(28, 27), 2.6, 2.6), GOLD)


def icon_standard():
    layer = blank(N, N)
    sabre(layer, False)
    sabre(layer, True)
    return layer


def icon_survive():
    layer = blank(N, N)
    for x in (8.5, 23.5):  # the posts
        add(layer, stroke(N, N, [(x, 7), (x, 25)], 2), WOOD)
    add(layer, poly(N, N, [(9, 7), (23, 7), (17, 16), (15, 16)]), GLASS)
    add(layer, poly(N, N, [(15, 16), (17, 16), (23, 25), (9, 25)]), GLASS)
    sand_top = poly(N, N, [(11, 9), (21, 9), (16.5, 14)])
    paste(layer, render(sand_top, GOLD, rim=False))
    add(layer, poly(N, N, [(11, 24), (21, 24), (16, 19)]), GOLD, rim=False)
    for y in range(15, 20):
        put(layer, 16, y, GOLD[3])
    add(layer, poly(N, N, [(5, 3), (27, 3), (27, 7), (5, 7)]), WOOD)
    add(layer, poly(N, N, [(5, 25), (27, 25), (27, 29), (5, 29)]), WOOD)
    return layer


def icon_salvage():
    layer = blank(N, N)
    crate = poly(N, N, [(17, 15), (29, 15), (29, 27), (17, 27)])
    cl = render(crate, WOOD)
    ins = interior(crate)
    line_px(cl, (18, 16), (28, 26), WOOD[1], within=ins)
    line_px(cl, (28, 16), (18, 26), WOOD[1], within=ins)
    paste(layer, cl)
    barrel = poly(N, N, [(5, 8), (15, 8), (17, 14), (17, 22), (15, 28), (5, 28), (3, 22), (3, 14)])
    bl = render(barrel, WOOD)
    ins = interior(barrel)
    for y in (12, 23):  # iron hoops
        for x in range(3, 18):
            if ins[y, x]:
                bl[y, x] = (*STEEL[2], 255)
                if ins[y + 1, x]:
                    bl[y + 1, x] = (*STEEL[1], 255)
    for x in (7, 10, 13):  # staves
        for y in range(9, 28):
            if ins[y, x] and y not in (12, 13, 23, 24):
                bl[y, x] = (*WOOD[1], 255) if y % 2 else bl[y, x]
    paste(layer, bl)
    waves(layer, 29)
    return layer


def coin(layer, cx, cy):
    body = poly(N, N, [(cx - 6, cy), (cx + 6, cy), (cx + 6, cy + 3), (cx - 6, cy + 3)]) | ell(N, N, cx, cy + 3, 6, 3)
    top = ell(N, N, cx, cy, 6, 3)
    paste(layer, render(body | top, GOLD))
    ring = erode(top, 1)
    for y, x in zip(*np.nonzero(ring & ~erode(top, 2))):
        layer[y, x] = (*GOLD[3], 255)
    put(layer, cx - 2, cy, GOLD[4])


def icon_merchant():
    layer = blank(N, N)
    for k in range(4):
        coin(layer, 11, 22 - 4 * k)
    for k in range(2):
        coin(layer, 23, 24 - 4 * k)
    standing = ell(N, N, 24, 11, 5, 5)
    add(layer, standing, GOLD)
    for dx, dy in ((0, -2), (0, -1), (0, 0), (0, 1), (-1, -2), (1, 0)):
        put(layer, 24 + dx, 11 + dy, GOLD[0])
    return layer


def icon_ambush():
    layer = blank(N, N)
    add(layer, stroke(N, N, [(6, 3), (6, 29)], 3), WOOD)
    flag = poly(N, N, [(8, 4), (18, 3), (28, 6), (25, 11), (28, 17), (18, 19), (8, 18)])
    fl = render(flag, FLAG)
    skull = ell(N, N, 17, 10, 4.2, 3.8)
    paste(fl, render(skull, BONE))
    for dx in (-2, 2):
        put(fl, 17 + dx, 10, FLAG[0])
        put(fl, 17 + dx, 9, FLAG[0])
    put(fl, 17, 12, FLAG[0])
    for x in (15, 16, 17, 18, 19):
        put(fl, x, 14, BONE[2] if x % 2 else BONE[1])
    line_px(fl, (11, 15), (23, 18), BONE[2], within=interior(flag))
    line_px(fl, (11, 18), (23, 15), BONE[2], within=interior(flag))
    paste(layer, fl)
    return layer


def icon_hunt():
    layer = blank(N, N)
    # the tentacle behind: a curl rising from the water, with suckers
    path = [(26, 31), (29, 24), (23, 16), (26, 8), (21, 4)]
    pts = []
    for i in range(len(path) - 1):
        for k in range(10):
            t = k / 10
            pts.append((path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t))
    pts.append(path[-1])
    from PIL import Image as _I, ImageDraw as _D
    img = _I.new('L', (N, N), 0)
    d = _D.Draw(img)
    for i, (x, y) in enumerate(pts):
        r = 3.6 - 2.4 * i / (len(pts) - 1)
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    mask = np.array(img) > 0
    add(layer, mask, RED)
    inner = erode(mask, 1)
    for i, (x, y) in enumerate(pts):
        if i % 8 == 4 and i < len(pts) - 6:
            px, py = int(round(x - 1)), int(round(y))
            if inner[py, px]:
                put(layer, px, py, SUCKER)
    # the chest in front
    body = poly(N, N, [(2, 17), (20, 17), (20, 29), (2, 29)])
    bl = render(body, WOOD)
    for y in range(18, 29):
        for x in (6, 16):
            if interior(body)[y, x]:
                bl[y, x] = (*GOLD[2], 255)
    paste(layer, bl)
    lid = poly(N, N, [(2, 17), (4, 12), (18, 12), (20, 17)])
    ll = render(lid, WOOD)
    for x in (6, 16):
        for y in range(13, 17):
            if interior(lid)[y, x]:
                ll[y, x] = (*GOLD[2], 255)
    paste(layer, ll)
    add(layer, poly(N, N, [(9, 17), (13, 17), (13, 22), (9, 22)]), GOLD)
    put(layer, 11, 19, GOLD[0])
    put(layer, 11, 20, GOLD[0])
    return layer


def icon_port():
    layer = blank(N, N)
    ring = ell(N, N, 16, 5, 3.4, 3.4) & ~ell(N, N, 16, 5, 1.6, 1.6)
    add(layer, ring, ANCHOR)
    add(layer, stroke(N, N, [(16, 8), (16, 25)], 3), ANCHOR)
    add(layer, stroke(N, N, [(10, 11), (22, 11)], 3), ANCHOR)
    arms = ell(N, N, 16, 20, 11, 8) & ~ell(N, N, 16, 20, 7.5, 5)
    arms &= np.arange(N)[:, None] >= 20
    add(layer, arms, ANCHOR)
    add(layer, poly(N, N, [(3, 17), (8, 20), (5, 24)]), ANCHOR, rim=False)
    add(layer, poly(N, N, [(29, 17), (24, 20), (27, 24)]), ANCHOR, rim=False)
    waves(layer, 29)
    return layer


def icon_boss():
    layer = blank(N, N)
    head = ell(N, N, 16, 16, 10, 9)
    jaw = poly(N, N, [(10, 21), (22, 21), (21, 28), (11, 28)])
    sk = render(head | jaw, BONE)
    ins = interior(head | jaw)
    for x in (13, 15, 17, 19):  # teeth
        for y in range(24, 28):
            if ins[y, x]:
                sk[y, x] = (*BONE[1], 255)
    for x in range(12, 21):
        if ins[24, x]:
            sk[24, x] = (*BONE[0], 255)
    paste(layer, sk)
    for cx in (12, 20):
        add(layer, ell(N, N, cx, 16, 3.2, 3.8), FLAG, rim=False)
        put(layer, cx, 16, (0xff, 0x40, 0x30))
        put(layer, cx, 17, (0xc8, 0x20, 0x20))
    add(layer, poly(N, N, [(15, 19), (17, 19), (16, 21)]), FLAG, rim=False)
    crown = poly(N, N, [(7, 9), (7, 2), (11, 6), (16, 1), (21, 6), (25, 2), (25, 9)])
    add(layer, crown, GOLD)
    for x, y in ((9, 6), (16, 5), (23, 6)):
        put(layer, x, y, (0xff, 0x40, 0x50))
    return layer


def icon_start():
    layer = blank(N, N)
    add(layer, ell(N, N, 16, 25, 14, 5), SAND)
    add(layer, ell(N, N, 16, 23, 10, 3.2), GRASS)
    trunk = stroke(N, N, [(14, 24), (15, 17), (18, 10)], 3)
    add(layer, trunk, WOOD)
    fronds = [
        [(18, 10), (10, 8), (5, 12), (10, 10)],
        [(18, 10), (13, 3), (7, 3), (13, 6)],
        [(18, 10), (20, 2), (26, 2), (22, 6)],
        [(18, 10), (26, 7), (29, 12), (24, 9)],
        [(18, 10), (14, 12), (13, 16), (16, 13)],
    ]
    for pts in fronds:
        paste(layer, render(poly(N, N, pts), GRASS, rim=False))
    add(layer, ell(N, N, 18, 11, 2, 2), WOOD, rim=False)
    waves(layer, 30)
    return layer


ICONS = {
    'standard': icon_standard, 'survive': icon_survive, 'salvage': icon_salvage, 'merchant': icon_merchant,
    'ambush': icon_ambush, 'hunt': icon_hunt, 'port': icon_port, 'boss': icon_boss, 'start': icon_start,
}


# --------------------------------------------------------------------------- our ship

HULLS = {'sloop': (0, 32, 32, 64), 'brigantine': (160, 48, 48, 80), 'galleon': (400, 48, 48, 128)}
HULL_COLOUR = 3  # navy, the colour the player's team has
SAIL_COLOUR = 1  # cream


def ship_marker(sheet, name):
    x0, pitch, w, h = HULLS[name]
    hull = sheet.crop((x0 + pitch * HULL_COLOUR, 0, x0 + pitch * HULL_COLOUR + w, h))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(hull)
    yard = sheet.crop((32 * 5, 551, 32 * 5 + 32, 551 + 15))
    sail = sheet.crop((2 + 64 * SAIL_COLOUR, 363, 2 + 64 * SAIL_COLOUR + 28, 363 + 7))
    cy = int(h * (0.5 if name != 'galleon' else 56 / 128)) - 4
    out.alpha_composite(yard, (w // 2 - 16, cy))
    out.alpha_composite(sail, (w // 2 - 14, cy + 2))
    if name == 'galleon':  # drawn at half size so it stays about as tall as the others
        out = out.resize((w // 2, h // 2), Image.NEAREST)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join('.scratch', 'map'), exist_ok=True)
    sheet = Image.open(SHEET).convert('RGBA')
    icons = {}
    for name, fn in ICONS.items():
        img = Image.fromarray(fn(), 'RGBA')
        img.save(os.path.join(OUT, f'stop-{name}.png'))
        icons[name] = img
    ships = {}
    for name in HULLS:
        img = ship_marker(sheet, name)
        img.save(os.path.join(OUT, f'ship-{name}.png'))
        ships[name] = img
    # a contact sheet on a dark card colour, 5x
    scale = 5
    pad = 8
    cols = len(ICONS) + len(ships)
    w = (N * scale + pad) * cols + pad
    h = 70 * scale + 2 * pad
    sheet_img = Image.new('RGBA', (w, h), (0x1c, 0x2c, 0x3a, 255))
    x = pad
    for img in list(icons.values()) + list(ships.values()):
        big = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
        sheet_img.alpha_composite(big, (x, pad))
        x += N * scale + pad
    sheet_img.save(os.path.join('.scratch', 'map', 'contact.png'))
    print('wrote', len(icons), 'icons and', len(ships), 'ships to', OUT)


if __name__ == '__main__':
    main()
