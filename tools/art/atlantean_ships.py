"""Draws a fleet of regal Atlantean ships as a drop-in replacement for the Scallywag ship sheet.

The output has exactly the layout of apps/client/public/assets/scallywag/ships.png, so
every frame box in scallywag.ts works on it unchanged. The hulls (three sizes, five
team colours, whole / cracked / broken) and the sails (six colours, four kinds) are
redrawn; the wreck row, yards, emblems, cannons, smoke and wake are copied from the
original so the sheet is complete.

The ships are sleek and ornate: a body in a jewel colour per team (teal, sapphire,
emerald, amethyst, coral) edged in a gold rail, scale plating on the flanks, a pearl deck
with a glowing channel, a gold-ringed gem at the mast, a crown of spikes at the stern,
swept tail fins, and a gold prow (a trident on the large ship's bowsprit). The sails are
pearly scallop fans edged in gold.

Run from the repo root:  python tools/art/atlantean_ships.py
Writes docs/media/atlantean-ships/ships-atlantean.png and compare.png.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from pixel import (blank, cracks, ell, erode, interior, line_px, paste, plates, poly, put,  # noqa: E402
                   render, rivets, scales, shift, stroke, tint)

SRC = os.path.join('apps', 'client', 'public', 'assets', 'scallywag', 'ships.png')
OUT_DIR = os.path.join('docs', 'media', 'atlantean-ships')
SEA = (0x1c, 0x85, 0xd9)

# (outline, dark, base, light, bright) for each team's hull body
BODIES = [
    ((0x08, 0x24, 0x30), (0x16, 0x50, 0x64), (0x28, 0x84, 0x94), (0x58, 0xb8, 0xbc), (0xb0, 0xf4, 0xe8)),   # teal
    ((0x08, 0x10, 0x34), (0x1a, 0x30, 0x70), (0x30, 0x58, 0xb0), (0x60, 0x90, 0xe0), (0xb4, 0xd0, 0xff)),   # sapphire
    ((0x04, 0x24, 0x18), (0x0e, 0x56, 0x38), (0x1e, 0x90, 0x58), (0x50, 0xc8, 0x88), (0xb0, 0xf8, 0xd0)),   # emerald
    ((0x18, 0x0a, 0x34), (0x3e, 0x20, 0x72), (0x6c, 0x40, 0xb4), (0x9c, 0x74, 0xe0), (0xd8, 0xc4, 0xff)),   # amethyst
    ((0x34, 0x0e, 0x18), (0x74, 0x24, 0x38), (0xb4, 0x44, 0x58), (0xe4, 0x7c, 0x88), (0xff, 0xc8, 0xc8)),   # coral
]
GEMS = [(0x5c, 0xf0, 0xff), (0x78, 0xa8, 0xff), (0x7c, 0xf0, 0x7c), (0xc8, 0x8c, 0xff), (0xff, 0xb0, 0x7c)]
GOLD = ((0x44, 0x2a, 0x08), (0x92, 0x62, 0x1c), (0xcc, 0x98, 0x38), (0xf0, 0xcc, 0x6a), (0xff, 0xf4, 0xb0))
PEARL = ((0x58, 0x4c, 0x48), (0xb4, 0xa8, 0xa4), (0xe0, 0xd6, 0xd0), (0xf6, 0xf0, 0xea), (0xff, 0xff, 0xff))


def gem_ramp(c):
    """Five tones from one gem colour: a dark socket up to a white glint."""
    def mix(a, b, t):
        return tuple(int(round(a[i] * (1 - t) + b[i] * t)) for i in range(3))
    return (mix(c, (0, 0, 0), 0.8), mix(c, (0, 0, 0), 0.45), c, mix(c, (255, 255, 255), 0.5), (255, 255, 255))


def mix_pal(a, b, t):
    return tuple(tuple(int(round(a[i][c] * (1 - t) + b[i][c] * t)) for c in range(3)) for i in range(5))


def noise(x, y, salt=0):
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65536.0


def half_width(t, maxhalf):
    """Half width (as pixels) of the hull at t along it: a rounded stern, a full midships, a long curved bow."""
    if t < 0.4:
        f = math.sqrt(max(0.0, 1.0 - ((0.4 - t) / 0.4) ** 2.2))
    elif t <= 0.5:
        f = 1.0
    else:
        f = max(0.0, 1.0 - ((t - 0.5) / 0.5) ** 1.8) ** 0.75
    return f * maxhalf


def rotated_ellipse(w, h, cx, cy, a, b, degrees):
    """A tilted ellipse as a mask, from many points so its edge is clean."""
    ang = math.radians(degrees)
    pts = []
    for k in range(32):
        t = k / 32 * 2 * math.pi
        x, y = a * math.cos(t), b * math.sin(t)
        pts.append((cx + x * math.cos(ang) - y * math.sin(ang), cy + x * math.sin(ang) + y * math.cos(ang)))
    return poly(w, h, pts)


def hull_layers(w, h, team, large=False):
    """The whole hull of one team, w by h, bow to the bottom. Returns (layer, hull_mask)."""
    layer = blank(w, h)
    body = BODIES[team]
    gem = gem_ramp(GEMS[team])
    cx = w / 2.0
    y0 = 6.0
    bow_extra = 16 if large else 6
    yb = h - bow_extra - 1  # where the body ends and the prow begins
    maxhalf = (w - 6) / 2.0

    def y_at(t):
        return y0 + t * (yb - y0)

    # sweeping fins at the stern shoulders, rounded and edged in gold
    for side in (-1, 1):
        fin = rotated_ellipse(w, h, cx + side * (maxhalf * 0.95), y_at(0.13), 5.2, 3.3, -side * 32)
        paste(layer, render(fin, body))
        paste_ring = fin & ~erode(fin, 1)
        line_px(layer, (cx + side * (maxhalf * 0.95 - side * 2), y_at(0.13) - 3), (cx + side * (maxhalf + 3), y_at(0.13) - 5), GOLD[3],
                within=erode(fin, 1))
    # a gold stern crest topped with a gem pearl and a pearl each side: rounded, no spikes
    crest = ell(w, h, cx, y0 + 2.5, 8, 4.5) & (np.arange(h)[:, None] < y0 + 4)
    paste(layer, render(crest, GOLD))
    for dx in (-6, 6):
        paste(layer, render(ell(w, h, cx + dx, y0 - 0.5, 2.2, 2.2), GOLD))
    paste(layer, render(ell(w, h, cx, y0 - 1.5, 3, 3), gem))
    put(layer, cx - 1, y0 - 2.5, (255, 255, 255))

    # the hull body
    hull = np.zeros((h, w), dtype=bool)
    for y in range(int(y0), int(yb) + 1):
        hw = half_width((y + 0.5 - y0) / (yb - y0 + 1), maxhalf)
        x0, x1 = int(round(cx - hw)), int(round(cx + hw))
        if x1 > x0:
            hull[y, x0:x1] = True
    hl = render(hull, body)
    # scale plating over the flanks and a gold rail round the edge
    scales(hl, interior(hull), body, sw=6, sh=4)
    rail = erode(hull, 1) & ~erode(hull, 3)
    ry, rx = np.nonzero(rail)
    light_edge = rail & ~shift(rail, 1, 1)
    for y, x in zip(ry, rx):
        hl[y, x] = (*(GOLD[3] if light_edge[y, x] else GOLD[2]), 255)
    shadow = rail & ~shift(rail, -1, -1)
    for y, x in zip(*np.nonzero(shadow)):
        hl[y, x] = (*GOLD[1], 255)
    paste(layer, hl)

    # the deck: a pearl inlay with plank seams and a glowing channel down its middle
    deck = erode(hull, 7)
    deck &= (np.arange(h)[:, None] > y_at(0.1)) & (np.arange(h)[:, None] < y_at(0.86))
    deck_pal = mix_pal(PEARL, body, 0.42)
    dl = render(deck, deck_pal)
    plates(dl, interior(deck), deck_pal, pw=14, ph=4, stagger=7, light=False)
    paste(layer, dl)
    chan_x = int(cx)
    for y in range(int(y_at(0.17)), int(y_at(0.44))):
        if deck[y, chan_x]:
            put(layer, chan_x, y, gem[3])
            put(layer, chan_x - 1, y, gem[1] if y % 3 else gem[2])
            put(layer, chan_x + 1, y, gem[1] if y % 3 else gem[2])
    for y in range(int(y_at(0.56)), int(y_at(0.80))):
        if deck[y, chan_x]:
            put(layer, chan_x, y, gem[2])
            put(layer, chan_x - 1, y, gem[1])

    # the stern dais with a throne gem, and the mast ring: a gold ring round a glowing gem
    dais = poly(w, h, [(cx - 6, y_at(0.13)), (cx + 6, y_at(0.13)), (cx + 5, y_at(0.13) + 5), (cx - 5, y_at(0.13) + 5)])
    paste(layer, render(dais, GOLD))
    put(layer, cx, y_at(0.13) + 2, gem[3])
    ring_r = 5.5 if w >= 48 else 4.5
    my = y_at(0.50)
    paste(layer, render(ell(w, h, cx, my, ring_r, ring_r), GOLD))
    paste(layer, render(ell(w, h, cx, my, ring_r - 2, ring_r - 2), gem))
    put(layer, cx - 1, my - 1, (255, 255, 255))

    # a row of gems along each flank, where the rail is
    steps = 5 if w >= 48 else 4
    for k in range(steps):
        t = 0.24 + k * (0.50 / (steps - 1))
        for side in (-1, 1):
            gx = cx + side * (half_width(t, maxhalf) - 2.5)
            put(layer, round(gx), round(y_at(t)), gem[3])
            put(layer, round(gx), round(y_at(t)) + 1, gem[1])

    # the prow: a gold cap over the bow, then a spike, or on the big ship a trident on a bowsprit
    ys_idx = np.arange(h)[:, None]
    xs_idx = np.arange(w)[None, :]
    cap = hull & (ys_idx >= y_at(0.86) + 0.5 * np.abs(xs_idx - cx))
    paste(layer, render(cap, GOLD, outline=GOLD[0]))
    tip_y = yb
    if large:
        paste(layer, render(stroke(w, h, [(cx, tip_y - 1), (cx, tip_y + 8)], 4), GOLD))
        head = ell(w, h, cx, tip_y + 12, 7.5, 6) & ~ell(w, h, cx, tip_y + 14.5, 5, 5) & (np.arange(h)[:, None] <= h - 1)
        paste(layer, render(head, GOLD))
        prong = poly(w, h, [(cx - 2, tip_y + 8), (cx + 2, tip_y + 8), (cx + 1, h - 3), (cx, h - 1), (cx - 1, h - 3)])
        paste(layer, render(prong, GOLD))
    else:
        paste(layer, render(ell(w, h, cx, tip_y + 1, 2.6, 5), GOLD))
    return layer, hull


def damage(layer, hull, w, h, team, seed):
    """A cracked hull: dark gashes with water showing, hairline cracks, the odd gem gone dark."""
    out = layer.copy()
    body = BODIES[team]
    region = interior(hull)
    spots = [(0.32, -0.45, 3.0), (0.60, 0.50, 2.5), (0.76, -0.2, 2.0)]
    ys = np.arange(h)
    top = np.nonzero(hull.any(axis=1))[0].min()
    bottom = np.nonzero(hull.any(axis=1))[0].max()
    for t, sx, r in spots:
        cy = top + (bottom - top) * t
        cxx = w / 2 + sx * (w / 2 - 6)
        hole = ell(w, h, cxx, cy, r + 1, r) & region
        out[hole] = (*body[0], 255)
        rim = erode(hole, 1)
        out[rim] = (0x0a, 0x40, 0x70, 255)
        put(out, cxx - 1, cy - 1, (0x3c, 0x9c, 0xd8))
    cracks(out, region, [(int(w * 0.30), int(top + (bottom - top) * 0.2), 1), (int(w * 0.62), int(top + (bottom - top) * 0.42), -1),
                         (int(w * 0.40), int(top + (bottom - top) * 0.7), 1), (int(w * 0.66), int(top + (bottom - top) * 0.58), 1)], body[0])
    return out


def split(layer, hull, w, h, team):
    """Broken in two at the middle: a ragged cut, the halves drifting apart, some splinters between."""
    layer = damage(layer, hull, w, h, team, 0)
    top = np.nonzero(hull.any(axis=1))[0].min()
    bottom = np.nonzero(hull.any(axis=1))[0].max()
    cut = int(top + (bottom - top) * 0.64)
    body = BODIES[team]
    out = blank(w, h)
    stern, bow = layer.copy(), layer.copy()
    for x in range(w):
        edge = cut + int(round(math.sin(x * 0.8) * 2.5 + math.sin(x * 2.1) * 1.5))
        stern[edge:, x] = 0
        bow[:edge, x] = 0
    # a dark broken edge on each half, so the cut reads
    for part, last in ((stern, True), (bow, False)):
        for x in range(w):
            col = np.nonzero(part[:, x, 3] > 0)[0]
            if len(col):
                y = col[-1] if last else col[0]
                part[y, x] = (*body[0], 255)
                y2 = y - 1 if last else y + 1
                if 0 <= y2 < h and part[y2, x, 3]:
                    part[y2, x] = (*body[1], 255)
    for dx, dy, part in ((-2, -1, stern), (3, 5, bow)):
        paste(out, np.stack([shift(part[..., c], dx, dy) for c in range(4)], axis=-1))
    return out


# --------------------------------------------------------------------------- the sails

SAIL_COLOURS = [  # grey, cream, green, yellow, blue, red, as pearly Atlantean tints
    ((0x60, 0x6c, 0x78), (0xa8, 0xb4, 0xc0), (0xd4, 0xde, 0xe8), (0xf0, 0xf6, 0xfc)),
    ((0x8c, 0x7c, 0x64), (0xd0, 0xc0, 0xa4), (0xf0, 0xe4, 0xcc), (0xff, 0xf8, 0xea)),
    ((0x1e, 0x78, 0x58), (0x50, 0xc0, 0x90), (0x90, 0xec, 0xc0), (0xd4, 0xff, 0xe8)),
    ((0x9c, 0x6c, 0x14), (0xe0, 0xb0, 0x40), (0xff, 0xdc, 0x78), (0xff, 0xf4, 0xc0)),
    ((0x24, 0x64, 0xa8), (0x5c, 0xa8, 0xe8), (0x98, 0xd4, 0xff), (0xdc, 0xf0, 0xff)),
    ((0x9c, 0x34, 0x4c), (0xe8, 0x70, 0x84), (0xff, 0xa8, 0xb4), (0xff, 0xe0, 0xe4)),
]


def sail_image(w, hh, colour, billow):
    """A scallop-shell sail seen from above: a gold-edged fan of pearly ribs."""
    c = SAIL_COLOURS[colour]
    layer = blank(w, hh)
    mask = ell(w, hh * 2, w / 2 - 0.5, 0, w / 2, hh)[:hh]
    # a scalloped lower edge: little notches between the rib ends
    for x in range(1, w - 1):
        if x % 4 == 2:
            mask[hh - 1, x] = False
    deep = hh >= 7
    for y, x in zip(*np.nonzero(mask)):
        t = y / max(1, hh - 1)
        tone = c[2] if t < 0.4 else c[1] if t < 0.75 else c[0]
        layer[y, x] = (*tone, 232)
    for x in range(w):  # ribs fanning from the top centre
        if x % 4 == 1:
            line_px(layer, (w / 2 - 0.5, 0), (x, hh - 1), c[0], within=mask)
    for x in range(w):  # a light shine on the upper left
        if mask[1, x] and x < w // 2 and x % 4 == 3:
            layer[1, x] = (*c[3], 240)
    for x in np.nonzero(mask[0])[0]:  # the gold edge along the yard
        layer[0, x] = (*GOLD[3], 255)
        if hh > 1 and mask[1, x]:
            layer[1, x] = (*GOLD[2], 255) if x % 2 else (*GOLD[1], 255)
    # the outline underneath
    pad = np.pad(mask, 1)
    edge = mask & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    for y, x in zip(*np.nonzero(edge)):
        if y > 0:
            layer[y, x] = (*c[0], 255)
    return layer


# --------------------------------------------------------------------------- cannons and effects

CANNON_BODY = BODIES[0]
SPRAY = (0xe8, 0xfc, 0xff)
SPRAY_D = (0x9c, 0xe0, 0xf0)
FIRE = (0x8c, 0xfa, 0xff)
FIRE_D = (0x3c, 0xc4, 0xd8)
# the three cannon sizes the ships use: (width, height, gold bands); the muzzle is on the left
CANNON_SIZES = [(6, 6, 0), (12, 6, 1), (14, 8, 2)]
CANNON_BOXES = [(452, 566), (449, 582), (448, 596)]


def cannon_pixels(w, h, bands, team=0):
    """An Atlantean cannon, muzzle to the left: a teal barrel, gold bands, a gem ring at the muzzle, a gold breech."""
    layer = blank(w, h)
    cap = max(3, h // 2 + 1)
    mask = np.zeros((h, w), dtype=bool)
    mask[:, :w - h // 2] = True
    mask |= ell(w, h, w - h / 2.0, h / 2.0, h / 2.0, h / 2.0)
    gem_c = GEMS[team]
    ring = (gem_ramp(gem_c)[3], gem_ramp(gem_c)[1])
    paste(layer, render(mask, BODIES[team]))
    inner = erode(mask)
    ys, xs = np.nonzero(inner)
    for y, x in zip(ys, xs):
        if x >= w - cap:  # the gold breech
            top = y == ys.min()
            layer[y, x] = (*(GOLD[3] if top else GOLD[1] if y == ys.max() else GOLD[2]), 255)
        elif x <= 2:  # the glowing gem ring at the muzzle
            layer[y, x] = (*(ring[0] if x == 1 else ring[1]), 255)
    for k in range(bands):
        bx = (w - cap) // (bands + 1) * (k + 1) + 3
        for y, x in zip(ys, xs):
            if x == bx:
                layer[y, x] = (*(GOLD[3] if y == ys.min() else GOLD[2]), 255)
    put(layer, w - 2, h // 2 - 1 if h > 6 else h // 2, gem_ramp(gem_c)[3])
    return layer


def cannon_fire(w, h, bands, recoil):
    """Firing: a cyan flash leaps from the muzzle, then the barrel kicks back with spray."""
    pad_l, pad_v = 8, 3
    layer = blank(w + pad_l + 1, h + pad_v * 2)
    barrel = cannon_pixels(w, h, bands)
    off = pad_l + (1 if recoil else 0)
    layer[pad_v:pad_v + h, off:off + w] = barrel
    cy = pad_v + h // 2
    if not recoil:
        paste(layer, render(ell(layer.shape[1], layer.shape[0], pad_l - 1, cy, 3.5, 3.5), ((0x0c, 0x5c, 0x70), FIRE_D, FIRE, (0xd0, 0xff, 0xff), (255, 255, 255)), rim=False))
        for k, (dx, dy) in enumerate(((-5, 0), (-4, -3), (-4, 3), (-2, -5), (-2, 5))):
            line_px(layer, (pad_l - 1, cy), (pad_l - 1 + dx, cy + dy), FIRE)
        put(layer, pad_l - 1, cy, (255, 255, 255))
    else:
        for k in range(7):
            put(layer, pad_l - 2 - k % 3 + (k % 2), cy + (k - 3), SPRAY if k % 2 else SPRAY_D)
    return layer


def puff_frame(i):
    """Sea-spray burst: foam that opens into droplets and thins away."""
    layer = blank(16, 16)
    r = [3.5, 5.5, 7.0, 7.5][i]
    if i == 0:
        paste(layer, render(ell(16, 16, 8, 8, r, r), (SPRAY_D, SPRAY_D, SPRAY, (255, 255, 255), (255, 255, 255))))
        return layer
    for k in range(10 + i * 2):
        a = k / (10 + i * 2) * 2 * math.pi + i
        d = r * (0.45 + 0.55 * noise(k, i, 3))
        x, y = 8 + math.cos(a) * d, 8 + math.sin(a) * d
        alpha = [255, 235, 190, 110][i]
        put(layer, x, y, SPRAY if k % 2 else SPRAY_D, alpha)
        if k % 3 == 0 and i < 3:
            put(layer, x + 1, y, SPRAY, alpha)
    return layer


def burst_frame(i):
    """The cannon's hit: a cold cyan burst, in place of the orange explosion."""
    layer = blank(16, 16)
    ramp = ((0x0c, 0x5c, 0x70), FIRE_D, FIRE, (0xd0, 0xff, 0xff), (255, 255, 255))
    if i == 0:
        paste(layer, render(ell(16, 16, 8, 8, 4.5, 4.5), ramp, rim=False))
        paste(layer, render(ell(16, 16, 8, 8, 2.5, 2.5), (FIRE, FIRE, (0xd0, 0xff, 0xff), (255, 255, 255), (255, 255, 255)), rim=False))
    elif i == 1:
        for k in range(8):
            a = k / 8 * 2 * math.pi
            line_px(layer, (8 + math.cos(a) * 2, 8 + math.sin(a) * 2), (8 + math.cos(a) * 7, 8 + math.sin(a) * 7), FIRE if k % 2 else FIRE_D)
        paste(layer, render(ell(16, 16, 8, 8, 2.5, 2.5), ramp, rim=False))
    elif i == 2:
        for k in range(12):
            a = k / 12 * 2 * math.pi + 0.2
            put(layer, 8 + math.cos(a) * 6.5, 8 + math.sin(a) * 6.5, FIRE if k % 2 else (255, 255, 255))
            put(layer, 8 + math.cos(a) * 4.2, 8 + math.sin(a) * 4.2, FIRE_D, 190)
    else:
        for k in range(8):
            a = k / 8 * 2 * math.pi + 0.5
            put(layer, 8 + math.cos(a) * 7.2, 8 + math.sin(a) * 7.2, FIRE_D, 130)
    return layer


def team_cannon_box(team, ctype):
    """Where a team's cannon of a type sits on the sheet: a strip under the effects, a column per team."""
    return 460 + 20 * team, 642 + 10 * ctype


def draw_cannons_and_fx(sheet):
    # the old iron guns, their fire frames and the wheeled variants: clear the rows and redraw
    sheet[560:608, 440:560] = 0
    for (w, h, bands), (bx, by) in zip(CANNON_SIZES, CANNON_BOXES):
        sheet[by:by + h, bx:bx + w] = cannon_pixels(w, h, bands)
        fire = cannon_fire(w, h, bands, False)
        sheet[by - 3:by - 3 + fire.shape[0], bx + 18:bx + 18 + fire.shape[1]] = fire
        recoil = cannon_fire(w, h, bands, True)
        sheet[by - 3:by - 3 + recoil.shape[0], bx + 36:bx + 36 + recoil.shape[1]] = recoil
    # one set per team colour in the free strip below the effects: the body and the gem match the hull
    for team in range(5):
        for ctype, (w, h, bands) in enumerate(CANNON_SIZES):
            bx, by = team_cannon_box(team, ctype)
            sheet[by:by + h, bx:bx + w] = cannon_pixels(w, h, bands, team)
    for i in range(4):
        sheet[608:624, 448 + 16 * i:464 + 16 * i] = puff_frame(i)
        sheet[624:640, 448 + 16 * i:464 + 16 * i] = burst_frame(i)


# --------------------------------------------------------------------------- the sheet

HULLS = {
    'small': dict(x0=0, pitch=32, w=32, h=64, rows={'intact': 0, 'damaged': 64, 'split': 128}, large=False),
    'medium': dict(x0=160, pitch=48, w=48, h=80, rows={'intact': 0, 'damaged': 80, 'split': 160}, large=False),
    'large': dict(x0=400, pitch=48, w=48, h=128, rows={'intact': 0, 'damaged': 128, 'split': 256}, large=True),
}
SAIL_BOXES = {
    'flatSmall': (6, 328, 20, 5, False), 'billowSmall': (38, 328, 20, 7, True),
    'flatLarge': (2, 363, 28, 7, False), 'billowLarge': (34, 363, 28, 10, True),
}


def build_sheet():
    sheet = np.array(Image.open(SRC).convert('RGBA'))
    for size, spec in HULLS.items():
        w, h = spec['w'], spec['h']
        for team in range(5):
            whole, hull = hull_layers(w, h, team, spec['large'])
            frames = {'intact': whole, 'damaged': damage(whole, hull, w, h, team, 1), 'split': split(whole, hull, w, h, team)}
            for state, img in frames.items():
                x, y = spec['x0'] + spec['pitch'] * team, spec['rows'][state]
                sheet[y:y + h, x:x + w] = img
    draw_cannons_and_fx(sheet)
    for colour in range(6):
        for kind, (bx, by, bw, bh, billow) in SAIL_BOXES.items():
            x = bx + 64 * colour
            sheet[by:by + bh, x:x + bw] = sail_image(bw, bh, colour, billow)
    return sheet


def crop(img, x, y, w, h):
    return img.crop((x, y, x + w, y + h))


def assemble(sheet_img, size, colour, state='intact', sail=None):
    spec = HULLS[size]
    w, h = spec['w'], spec['h']
    ship = Image.new('RGBA', (w + 16, h + 4), (0, 0, 0, 0))
    ship.alpha_composite(crop(sheet_img, spec['x0'] + spec['pitch'] * colour, spec['rows'][state], w, h), (8, 2))
    if state == 'intact' and sail is not None:
        sx, sy, sw, sh, _ = SAIL_BOXES['flatSmall' if size == 'small' else 'flatLarge']
        yard = crop(sheet_img, 0 + 32 * 5, 551, 32, 15)
        simg = crop(sheet_img, sx + 64 * sail, sy, sw, sh)
        cx = (w + 16) // 2
        cy = h // 2 - 2
        ship.alpha_composite(yard, (cx - 16, cy))
        ship.alpha_composite(simg, (cx - sw // 2, cy + 2))
    if state == 'intact':
        ctype = {'small': 0, 'medium': 1, 'large': 2}[size]
        cw, ch, _ = CANNON_SIZES[ctype]
        cbx, cby = team_cannon_box(colour, ctype)
        gun = crop(sheet_img, cbx, cby, cw, ch)
        edge = w // 2 - 7
        count = {'small': 2, 'medium': 2, 'large': 3}[size]
        for i in range(count):
            along = int(h / 2 + (i - (count - 1) / 2) * 13)
            cxm = (w + 16) // 2
            ship.alpha_composite(gun, (cxm - edge - cw // 2, along - ch // 2))
            ship.alpha_composite(gun.transpose(Image.FLIP_LEFT_RIGHT), (cxm + edge - cw // 2, along - ch // 2))
    return ship


def compare(new_sheet):
    living = Image.open(SRC).convert('RGBA')
    new = Image.fromarray(new_sheet, 'RGBA')
    scale = 3
    fleet = [('small', 0, 'intact', 4), ('medium', 1, 'intact', 4), ('large', 2, 'intact', 2), ('medium', 3, 'intact', 1),
             ('large', 4, 'intact', 5), ('medium', 0, 'damaged', None), ('large', 1, 'split', None)]
    tiles = [assemble(new, s, c, st, sa) for s, c, st, sa in fleet]
    old = [assemble(living, s, c, st, sa) for s, c, st, sa in fleet]
    n = len(fleet)
    cell_w = max(t.width for t in tiles) * scale + 16
    cell_h = max(t.height for t in tiles) * scale + 16
    canvas = Image.new('RGBA', (cell_w * n + 16, cell_h * 2 + 16), (*SEA, 255))
    for row, group in enumerate((old, tiles)):
        for col, t in enumerate(group):
            big = t.resize((t.width * scale, t.height * scale), Image.NEAREST)
            canvas.alpha_composite(big, (16 + col * cell_w, 16 + row * cell_h + (cell_h - 16 - big.height) // 2))
    canvas.save(os.path.join(OUT_DIR, 'compare.png'))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    sheet = build_sheet()
    Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT_DIR, 'ships-atlantean.png'))
    compare(sheet)
    print('wrote ships-atlantean.png and compare.png to', OUT_DIR)


if __name__ == '__main__':
    main()
