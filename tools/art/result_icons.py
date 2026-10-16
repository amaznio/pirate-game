"""Draws the pixel-art pictures for the game over dialog: an emblem for each way a battle can end, the
icons for its numbers, and the hull pips of its hull bar.

Same style as the map icons (see map_icons.py and pixel.py): a crisp outline, flat banded tones, a rim
light on the top left. Emblems and icons are 32 x 32; the hull pips are 8 x 14.

Run from the repo root:  python tools/art/result_icons.py
Writes apps/client/public/assets/result/*.png, and a contact sheet in .scratch/result/.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from map_icons import BONE, FOAM, GOLD, RED, STEEL, SUCKER, WOOD, add, waves  # noqa: E402
from pixel import blank, ell, erode, interior, line_px, paste, poly, put, render, stroke  # noqa: E402

N = 32
OUT = os.path.join('apps', 'client', 'public', 'assets', 'result')
BALL = ((0x10, 0x14, 0x1c), (0x2c, 0x34, 0x44), (0x48, 0x54, 0x68), (0x78, 0x88, 0xa0), (0xc0, 0xd0, 0xe4))
FLAG = ((0x6a, 0x72, 0x80), (0xb4, 0xbc, 0xc8), (0xe4, 0xe8, 0xf0), (0xf8, 0xfa, 0xff), (255, 255, 255))
SAIL = ((0x5a, 0x4a, 0x38), (0xb0, 0x9c, 0x7c), (0xd8, 0xc8, 0xa8), (0xf0, 0xe6, 0xcc), (255, 252, 240))


def sparkle(layer, x, y, col=(255, 250, 200)):
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        put(layer, x + dx, y + dy, col)


def emblem_victory():
    layer = blank(N, N)
    add(layer, poly(N, N, [(9, 26), (23, 26), (24, 30), (8, 30)]), WOOD)
    add(layer, poly(N, N, [(14, 20), (18, 20), (19, 26), (13, 26)]), GOLD)
    for cx in (7, 25):  # the handles
        ring = ell(N, N, cx, 11, 4, 4.5) & ~ell(N, N, cx, 11, 2, 2.6)
        add(layer, ring, GOLD)
    add(layer, poly(N, N, [(8, 5), (24, 5), (23, 13), (20, 19), (12, 19), (9, 13)]), GOLD)
    for y in range(7, 17):  # a bright stripe down the left of the cup
        put(layer, 11, y, GOLD[4])
    star = [(16, 8), (16, 9), (15, 10), (16, 10), (17, 10), (16, 11), (16, 12)]
    for x, y in star:
        put(layer, x, y, (0xff, 0xf8, 0xd8))
    sparkle(layer, 3, 3)
    sparkle(layer, 29, 4)
    sparkle(layer, 28, 21, (0xff, 0xe8, 0x90))
    return layer


def emblem_defeat():
    layer = blank(N, N)
    # the mast, a torn sail, and a hull tipped over and going under
    add(layer, stroke(N, N, [(17, 2), (15, 14)], 2), WOOD)
    add(layer, poly(N, N, [(18, 3), (26, 5), (23, 8), (26, 11), (17, 12)]), SAIL, rim=False)
    hull = poly(N, N, [(4, 15), (21, 11), (27, 17), (25, 25), (7, 26)])
    hl = render(hull, WOOD)
    ins = interior(hull)
    for k in range(3):
        line_px(hl, (7, 17 + k * 3), (24, 15 + k * 3), WOOD[1], within=ins)
    paste(layer, hl)
    add(layer, poly(N, N, [(12, 12), (17, 11), (16, 16), (11, 17)]), WOOD, rim=False)  # a splintered gap
    # the sea closing over it
    for x in range(0, N):
        y = 21 + int(round(math.sin(x * 0.9) * 1.2))
        for yy in range(y, N):
            put(layer, x, yy, (0x1c, 0x6c, 0xb0))
        put(layer, x, y, FOAM)
    for x, y in ((6, 27), (11, 29), (22, 28), (27, 26)):
        put(layer, x, y, (0x7c, 0xc0, 0xe8))
    return layer


def emblem_draw():
    layer = blank(N, N)
    add(layer, stroke(N, N, [(8, 3), (8, 28)], 3), WOOD)
    flag = poly(N, N, [(10, 5), (21, 4), (28, 7), (25, 12), (28, 17), (21, 18), (10, 17)])
    add(layer, flag, FLAG)
    waves(layer, 29)
    return layer


def icon_cannonballs():
    layer = blank(N, N)
    for cx, cy in ((10, 23), (22, 23), (16, 12)):
        ball = ell(N, N, cx, cy, 6, 6)
        add(layer, ball, BALL)
        put(layer, cx - 2, cy - 2, BALL[4])
        put(layer, cx - 3, cy - 1, BALL[4])
    return layer


def icon_treasure():
    layer = blank(N, N)
    add(layer, poly(N, N, [(5, 15), (7, 5), (25, 5), (27, 15)]), WOOD)  # the lid, open behind
    body = poly(N, N, [(4, 16), (28, 16), (28, 28), (4, 28)])
    bl = render(body, WOOD)
    ins = interior(body)
    for x in (10, 22):
        for y in range(17, 28):
            if ins[y, x]:
                bl[y, x] = (*GOLD[2], 255)
    paste(layer, bl)
    heap = ell(N, N, 16, 16, 11, 5) & (np.arange(N)[:, None] <= 17)
    add(layer, heap, GOLD)
    for x, y in ((11, 13), (16, 12), (21, 14), (14, 15)):
        put(layer, x, y, GOLD[4])
    put(layer, 17, 14, (0xff, 0x50, 0x60))
    add(layer, poly(N, N, [(14, 20), (18, 20), (18, 25), (14, 25)]), GOLD)
    return layer


def icon_monster():
    layer = blank(N, N)
    path = [(16, 31), (22, 26), (12, 19), (21, 12), (14, 6), (20, 2)]
    pts = []
    for i in range(len(path) - 1):
        for k in range(10):
            t = k / 10
            pts.append((path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t))
    pts.append(path[-1])
    img = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(img)
    for i, (x, y) in enumerate(pts):
        r = 4.2 - 3.0 * i / (len(pts) - 1)
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    mask = np.array(img) > 0
    add(layer, mask, RED)
    inner = erode(mask, 1)
    for i, (x, y) in enumerate(pts):
        if i % 7 == 3 and i < len(pts) - 8:
            px, py = int(round(x + 1)), int(round(y))
            if inner[py, px]:
                put(layer, px, py, SUCKER)
    waves(layer, 30, 4, 28)
    return layer


def pip(full):
    """A little hull seen from above, bow down: solid timber for hull left, an empty outline for hull lost."""
    w, h = 8, 14
    layer = blank(w, h)
    shape = poly(w, h, [(1, 0), (6.99, 0), (7.99, 4), (7.99, 9), (5, 13.99), (3, 13.99), (0, 9), (0, 4)])
    if full:
        hl = render(shape, WOOD)
        ins = interior(shape)
        for y in (4, 8):
            for x in range(0, w):
                if ins[y, x]:
                    hl[y, x] = (*WOOD[1], 255)
        paste(layer, hl)
    else:
        outline = shape & ~erode(shape, 1)
        layer[outline] = (0x5c, 0x68, 0x78, 255)
    return layer


ICONS = {
    'emblem-victory': emblem_victory,
    'emblem-defeat': emblem_defeat,
    'emblem-draw': emblem_draw,
    'icon-cannonballs': icon_cannonballs,
    'icon-treasure': icon_treasure,
    'icon-monster': icon_monster,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join('.scratch', 'result'), exist_ok=True)
    images = []
    for name, fn in ICONS.items():
        img = Image.fromarray(fn(), 'RGBA')
        img.save(os.path.join(OUT, f'{name}.png'))
        images.append(img)
    for name, full in (('hull-full', True), ('hull-empty', False)):
        img = Image.fromarray(pip(full), 'RGBA')
        img.save(os.path.join(OUT, f'{name}.png'))
        images.append(img)
    scale = 5
    pad = 8
    w = sum(i.width * scale + pad for i in images) + pad
    sheet = Image.new('RGBA', (w, N * scale + 2 * pad), (0x1c, 0x2c, 0x3a, 255))
    x = pad
    for img in images:
        sheet.alpha_composite(img.resize((img.width * scale, img.height * scale), Image.NEAREST), (x, pad))
        x += img.width * scale + pad
    sheet.save(os.path.join('.scratch', 'result', 'contact.png'))
    print('wrote', len(images), 'pictures to', OUT)


if __name__ == '__main__':
    main()
