"""Draws a themed set of Atlantean sea monsters that fire harpoons from their sides.

A proof of concept in the style of the Scallywag ships (see pixel.py): flat banded
tones, a crisp outline, a rim light, plate seams, rivets and crack marks, with gold
trim like the gold-edged hull. One board cell (64 x 64) a frame, nose to the bottom;
the leviathan is two cells long. Each monster fires its harpoons out to the left and
right (the game's `lashSides: ['left', 'right']`), like a ship's broadside.
The sheets have the rows idle (4), attack (3), hurt (2) and death (3).

Run from the repo root:  python tools/art/atlantean.py
Writes docs/media/monster-concepts/atlantean/<id>.png, <id>.json, harpoon.png,
overview.png and overview.gif.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from pixel import (blank, cracks, ell, erode, fade, interior, line_px, paste, plates, poly, put,  # noqa: E402
                   render, rivets, scales, shrink, stroke, tint)

S = 64
G = 2
LH = 2 * S
OUT_DIR = os.path.join('docs', 'media', 'monster-concepts', 'atlantean')

# (outline, dark, base, light, bright)
TEAL = ((0x0a, 0x2a, 0x38), (0x1a, 0x5a, 0x6c), (0x2c, 0x8a, 0x98), (0x5c, 0xbc, 0xc0), (0xb4, 0xf4, 0xe8))
TEAL_DK = ((0x08, 0x20, 0x2e), (0x12, 0x44, 0x56), (0x1e, 0x68, 0x7a), (0x3c, 0x94, 0xa0), (0x84, 0xd0, 0xd0))
GOLD = ((0x4a, 0x2c, 0x0a), (0x96, 0x64, 0x1e), (0xd0, 0x9a, 0x3a), (0xf2, 0xce, 0x6c), (0xff, 0xf4, 0xb4))
BONE = ((0x5a, 0x42, 0x30), (0xb0, 0x98, 0x70), (0xdc, 0xca, 0xa0), (0xf4, 0xea, 0xd0), (0xff, 0xfc, 0xee))
GLOWP = ((0x0c, 0x5c, 0x70), (0x2c, 0xa8, 0xc0), (0x6c, 0xe4, 0xf0), (0xb0, 0xfc, 0xff), (255, 255, 255))
GLOW = (0x8c, 0xfa, 0xff)
GLOW_D = (0x3c, 0xc4, 0xd8)
SHAFT = (0xe8, 0xd0, 0x7c)
SHAFT_D = (0x96, 0x64, 0x1e)
STRIPE = (0xb4, 0x7c, 0x4c)
SPRAY = (0xe8, 0xfc, 0xff)
SEA = (0x1c, 0x85, 0xd9)


def eye(layer, x, y, state):
    """A glowing eye in a dark socket: ring, cyan, a pupil and a glint."""
    ring = TEAL[0]
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            if (abs(dx) == 2 or abs(dy) == 2) and not (abs(dx) == 2 and abs(dy) == 2):
                put(layer, x + dx, y + dy, ring)
    if state == 'open':
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                put(layer, x + dx, y + dy, GLOW_D)
        put(layer, x, y, TEAL[0])
        put(layer, x, y + 1, TEAL[0])
        put(layer, x - 1, y - 1, (255, 255, 255))
    elif state == 'closed':
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                put(layer, x + dx, y + dy, TEAL_DK[1])
        for dx in (-1, 0, 1):
            put(layer, x + dx, y, ring)
    else:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                put(layer, x + dx, y + dy, TEAL_DK[2])
        for k in (-1, 0, 1):
            put(layer, x + k, y + k, ring)
            put(layer, x + k, y - k, ring)


# --------------------------------------------------------------------------- the harpoon

def harpoon(layer, x, y, d, shaft=8, glow=False):
    """A harpoon along rows y and y + 1, barbed head at x + d * shaft, flying toward d (+1 right, -1 left)."""
    h, w = layer.shape[:2]
    tx = x + d * shaft
    for sy in (-1, 1):  # fletching: two feathers at the tail
        feather = poly(w, h, [(x, y + (0 if sy < 0 else 1)), (x - d * 5, y + sy * 4 + (0 if sy < 0 else 1)), (x - d * 3, y + (0 if sy < 0 else 1))])
        paste(layer, render(feather, TEAL_DK, rim=False))
    for i in range(shaft):
        px = x + d * i
        put(layer, px, y, SHAFT)
        put(layer, px, y + 1, SHAFT_D)
    for i in (2, shaft - 3):  # gold collars
        put(layer, x + d * i, y, GOLD[3])
        put(layer, x + d * i, y + 1, GOLD[1])
    head = poly(w, h, [(tx + d * 9, y + 0.5), (tx - d * 1, y - 4.5), (tx + d * 2, y + 0.5), (tx - d * 1, y + 5.5)])
    paste(layer, render(head, TEAL))
    put(layer, tx + d * 3, y, TEAL[4])
    put(layer, tx + d * 2, y + 1, TEAL[3])
    if glow:
        put(layer, tx + d * 7, y, (255, 255, 255))
        for k in range(1, 4):
            put(layer, x - d * (3 + k * 2), y, GLOW_D, 200 - k * 50)


def puff(layer, x, y, d, size):
    for k in range(size):
        a = (k / max(1, size)) * math.pi - math.pi / 2
        put(layer, x + d * (2 + k % 3) + math.cos(a) * (1 + k % 2), y + math.sin(a) * (2 + k % 3), SPRAY)
    put(layer, x + d, y, (255, 255, 255))


def broadside(layer, cx, y, reach, shot, shaft=8):
    """A gilded launcher each side at row y: idle (shot None) or firing (0, 1, 2). The harpoon itself is a separate sprite."""
    h, w = layer.shape[:2]
    for d in (-1, 1):
        xa, xb = sorted((cx + d * (reach - 3), cx + d * (reach + 5)))
        box = poly(w, h, [(xa, y - 5), (xb, y - 5), (xb, y + 5), (xa, y + 5)])
        paste(layer, render(box, GOLD))
        for sy in (y - 3, y + 4):
            put(layer, xa + 1 if d > 0 else xb - 1, sy, GOLD[4])
        # the barrel slot, dark, with a cyan glint when it has just fired
        slot_x = [cx + d * (reach + k) for k in (1, 2, 3, 4)]
        for sx in slot_x:
            put(layer, sx, y - 1, TEAL[0])
            put(layer, sx, y + 2, TEAL[0])
        # the harpoon is not part of the sprite: it appears as its own projectile when launched,
        # so the cradle only shows the muzzle: empty and dark, then flashing, then a puff of spray
        if shot is not None:
            for sx in slot_x:
                put(layer, sx, y, GLOW)
                put(layer, sx, y + 1, GLOW_D)
            puff(layer, cx + d * (reach + 6), y, d, 4 + shot * 3)


# --------------------------------------------------------------------------- 1. nautilus gunship

def nautilus_frame(bob=0.0, shot=None, eyes='open', glow=0.0):
    """A nautilus in a gilded shell: tiger-striped coil, a visor hood, harpoon cradles on each flank."""
    layer = blank(S, S)
    cx = 32

    # trident crest on the shell's apex, behind everything
    for pts in ([(29, 16), (35, 16), (32, 2)], [(21, 20), (27, 17), (21, 8)], [(43, 20), (37, 17), (43, 8)]):
        paste(layer, render(poly(S, S, pts), GOLD))

    # tentacles trailing from under the head, with sucker dots
    for i in (0, 7, 1, 6, 2, 5, 3, 4):
        a = (i - 3.5) / 3.5
        x0 = cx + a * 8
        sway = math.sin(bob * 2 * math.pi + i * 0.9)
        pts = [(x0, 46), (x0 + a * 3 + sway * 1.5, 53), (x0 + a * 6 + sway * 2.5, 61)]
        t = stroke(S, S, pts, 3)
        paste(layer, render(t, TEAL_DK))
        for k, (px, py) in enumerate(pts[1:]):
            put(layer, px, py, TEAL_DK[4])

    # the shell
    shell_mask = ell(S, S, cx, 25, 15, 18)
    shell = render(shell_mask, BONE)
    inside = interior(shell_mask)
    for k in range(-6, 7):  # tiger stripes fanning from the apex
        if k % 2 == 0:
            line_px(shell, (cx + k * 1.2, 9), (cx + k * 3.0, 41), STRIPE, within=inside)
    for k in range(-6, 7):
        if k % 2:
            line_px(shell, (cx + k * 1.2 + 1, 9), (cx + k * 3.0 + 1, 41), BONE[3], within=inside)
    # the coil: a spiral of darker lines
    prev = None
    for i in range(60):
        t = i / 59.0
        a = t * 3.2 * math.pi
        r = 2 + 11 * t
        p = (cx - 3 + math.cos(a) * r * 0.95, 29 + math.sin(a) * r)
        if prev and inside[int(p[1]), int(p[0])] and inside[int(prev[1]), int(prev[0])]:
            line_px(shell, prev, p, BONE[0])
        prev = p
    paste(layer, shell)

    # the gilded visor across the shell mouth, a jewel in its middle
    visor = poly(S, S, [(15, 36), (49, 36), (46, 45), (18, 45)])
    paste(layer, render(visor, GOLD))
    plates(layer, interior(visor), GOLD, pw=6, ph=9, stagger=3, light=False)
    rivets(layer, [(19, 39), (45, 39), (24, 42), (40, 42)], GOLD)
    paste(layer, render(ell(S, S, cx, 40.5, 4, 3.5), GLOWP))

    # the head and its two glowing eyes
    head = ell(S, S, cx, 49, 11, 7)
    paste(layer, render(head, TEAL))
    scales(layer, interior(head), TEAL, sw=4, sh=3)
    for dx in (-6, 6):
        eye(layer, cx + dx, 49, eyes)

    broadside(layer, cx, 31, 14, shot)
    if glow:
        for dx in (-14, 14):
            put(layer, cx + dx, 28, GLOW)
    return layer


# --------------------------------------------------------------------------- 2. coral bastion (turtle)

def bastion_frame(paddle=0.0, shot=None, eyes='open', flash=0.0):
    """An armoured sea turtle: a gold-rimmed shell of teal plates, a glowing core, a ballista each side."""
    layer = blank(S, S)
    cx = 32
    sw = math.sin(paddle * 2 * math.pi)

    # flippers: the front pair paddle
    for side in (-1, 1):
        swing = sw * side * 2.5
        for pts in ([(cx + side * 12, 38), (cx + side * 27 + swing, 43 + sw * 1.5), (cx + side * 25 + swing, 50 + sw * 1.5), (cx + side * 11, 48)],
                    [(cx + side * 12, 14), (cx + side * 22 - swing * 0.5, 11), (cx + side * 21 - swing * 0.5, 19), (cx + side * 11, 22)]):
            m = poly(S, S, pts)
            fl = render(m, TEAL_DK)
            ins = interior(m)
            for k in range(3):
                line_px(fl, (pts[0][0] + side * 1, pts[0][1] + 2 + k * 3), (pts[1][0] - side * 1, pts[1][1] + 1 + k * 3), TEAL_DK[1], within=ins)
            paste(layer, fl)

    # tail
    paste(layer, render(poly(S, S, [(29, 7), (35, 7), (32, 15)]), TEAL_DK))

    # head, with a gilded crown and eyes
    head = ell(S, S, cx, 55, 8, 7)
    paste(layer, render(head, TEAL))
    scales(layer, interior(head), TEAL, sw=4, sh=3)
    paste(layer, render(poly(S, S, [(26, 49), (38, 49), (36, 54), (28, 54)]), GOLD))
    for dx in (-4, 4):
        eye(layer, cx + dx, 57, eyes)

    # the shell: a gold rim around teal plates, a core of light in a gold ring
    outer = ell(S, S, cx, 31, 18, 21)
    paste(layer, render(outer, GOLD))
    plates(layer, interior(outer) & ~erode(outer, 4), GOLD, pw=6, ph=3, stagger=3, light=False)
    inner_mask = ell(S, S, cx, 31, 15, 18)
    inner = render(inner_mask, TEAL)
    region = interior(inner_mask)
    scales(inner, region, TEAL, sw=8, sh=5)
    cracks(inner, region, [(22, 20, 1), (40, 40, -1)], TEAL[0])
    paste(layer, inner)
    paste(layer, render(ell(S, S, cx, 31, 6, 6), GOLD))
    paste(layer, render(ell(S, S, cx, 31, 3.5, 3.5), GLOWP))
    rivets(layer, [(cx - 15, 20), (cx + 15, 20), (cx - 15, 40), (cx + 15, 40)], GOLD)

    broadside(layer, cx, 31, 17, shot, shaft=7)
    if flash:
        layer = tint(layer, (255, 255, 255), flash)
    return layer


# --------------------------------------------------------------------------- 3. trident ray

def ray_frame(flap=0.0, shot=None, eyes='open', flash=0.0):
    """A manta in sea-green armour: ribbed wings edged in gold, a gilded back and a trident tail."""
    layer = blank(S, S)
    cx = 32
    f = math.sin(flap * 2 * math.pi) * 3

    # the whip tail ends in a little gold trident
    tail = stroke(S, S, [(cx, 16), (cx + f * 0.3, 11), (cx - f * 0.3, 8)], 3)
    paste(layer, render(tail, TEAL_DK))
    for pts in ([(cx - 1, 8), (cx + 1, 8), (cx, 0)], [(cx - 4, 8), (cx - 2, 8), (cx - 4, 2)], [(cx + 2, 8), (cx + 4, 8), (cx + 4, 2)]):
        paste(layer, render(poly(S, S, pts), GOLD, rim=False))

    # the wings
    wy = 31
    pts = [(cx, 13), (cx - 13, wy - 11 + f), (cx - 30, wy - 2 + f * 1.5), (cx - 27, wy + 6 + f), (cx - 11, wy + 12), (cx, 50),
           (cx + 11, wy + 12), (cx + 27, wy + 6 + f), (cx + 30, wy - 2 + f * 1.5), (cx + 13, wy - 11 + f)]
    wings = poly(S, S, pts)
    wl = render(wings, TEAL)
    region = interior(wings)
    for side in (-1, 1):  # ribs fanning out from the body
        for k in range(5):
            line_px(wl, (cx + side * 6, wy - 5 + k * 2.4), (cx + side * (27 - abs(k - 2) * 2), wy - 3 + f + k * 2.2 - (2 - k) * 0.5), TEAL[1], within=region)
        # a gold edge along the leading edge of each wing
        line_px(wl, (cx + side * 13, wy - 10 + f), (cx + side * 29, wy - 2 + f * 1.5), GOLD[2], within=region)
        line_px(wl, (cx + side * 13, wy - 9 + f), (cx + side * 28, wy - 1 + f * 1.5), GOLD[1], within=region)
    scales(wl, region, TEAL, sw=6, sh=4)
    paste(layer, wl)

    # the gilded back plate in segments, and the head
    plate = poly(S, S, [(cx - 6, 22), (cx + 6, 22), (cx + 7, 38), (cx, 47), (cx - 7, 38)])
    pl = render(plate, GOLD)
    for y in (27, 32, 37):
        line_px(pl, (cx - 6, y), (cx + 6, y), GOLD[1], within=interior(plate))
    paste(layer, pl)
    for side in (-1, 1):
        paste(layer, render(poly(S, S, [(cx + side * 3, 49), (cx + side * 8, 50), (cx + side * 5, 59)]), TEAL_DK))
    for dx in (-6, 6):
        eye(layer, cx + dx, 46, eyes)

    broadside(layer, cx, wy + int(f * 0.8), 19, shot, shaft=6)
    if flash:
        layer = tint(layer, (255, 255, 255), flash)
    return layer


# --------------------------------------------------------------------------- 4. the leviathan (two cells, the boss)

def leviathan_frame(sway=0.0, wave=None, eyes='open', glow=0.0, flash=0.0):
    """An armoured whale with a gold-edged hull, a trident tusk and three harpoon ports a side.

    sway swings the tail. wave is None (all loaded) or how far the salvo has got, the front
    port leading and each next one a beat behind.
    """
    layer = blank(S, LH)
    cx = 32

    def bend(y):
        return sway * max(0.0, (70 - y) / 56.0) ** 1.4 * 5.0

    # tail flukes
    fx = cx + bend(8)
    flukes = poly(S, LH, [(cx + bend(24), 28), (fx - 20, 8), (fx - 15, 1), (fx - 3, 9), (fx, 13), (fx + 3, 9), (fx + 15, 1), (fx + 20, 8), (cx + bend(24), 28)])
    fl = render(flukes, TEAL_DK)
    for side in (-1, 1):
        for k in range(3):
            line_px(fl, (cx + bend(24) + side * 2, 24 - k), (fx + side * (9 + k * 4), 7 - k), TEAL_DK[1], within=interior(flukes))
    paste(layer, fl)

    # pectoral fins
    for side in (-1, 1):
        pts = [(cx + side * 13 + bend(82), 78), (cx + side * 25, 84), (cx + side * 27, 92), (cx + side * 12, 96)]
        m = poly(S, LH, pts)
        fin = render(m, TEAL_DK)
        for k in range(3):
            line_px(fin, (pts[0][0] + side * 2, 80 + k * 3), (pts[1][0] - side * 1, 85 + k * 3), TEAL_DK[1], within=interior(m))
        paste(layer, fin)

    # the body: a long armoured teardrop with a gold-edged hull, teal plates and gilded bands
    profile = [(14, 3.0), (22, 5.0), (30, 8.0), (40, 11.0), (52, 14.0), (64, 16.0), (76, 16.5), (88, 14.5), (98, 10.5), (106, 6.0), (110, 3.0)]
    left = [(cx + bend(y) - h, y) for y, h in profile]
    right = [(cx + bend(y) + h, y) for y, h in reversed(profile)]
    body_mask = poly(S, LH, left + right)
    body = render(body_mask, TEAL, outline=GOLD[1])
    region = interior(body_mask)
    scales(body, region, TEAL, sw=8, sh=5)
    cracks(body, region, [(26, 62, 1), (40, 74, -1), (30, 92, 1), (36, 44, 1)], TEAL[0])
    paste(layer, body)
    ys = np.arange(LH)[:, None]
    for band in (44, 58, 72, 86):  # gilded armour bands
        bm = body_mask & ((ys >= band) & (ys < band + 5))
        paste(layer, render(bm, GOLD, outline=GOLD[0]))
        for y in (band + 2,):
            xs = np.nonzero(bm[y])[0]
            if len(xs) > 8:
                put(layer, xs[2], y, GOLD[4])
                put(layer, xs[-3], y, GOLD[4])
    cap = body_mask & (ys >= 101)  # a gold prow cap
    paste(layer, render(cap, GOLD, outline=GOLD[0]))

    # a blowhole glowing between the bands
    bx = cx + int(bend(52))
    paste(layer, render(ell(S, LH, bx, 51, 4, 2.5), GLOWP))
    for dx in (-9, 9):
        eye(layer, int(cx + bend(98) + dx), 94, eyes)

    # the tusk: a gold trident held out from the snout
    tx = cx + bend(110)
    paste(layer, render(stroke(S, LH, [(tx, 108), (tx, 119)], 3), GOLD))
    paste(layer, render(poly(S, LH, [(tx - 5, 117), (tx + 5, 117), (tx + 5, 120), (tx - 5, 120)]), GOLD))
    for pts in ([(tx - 5, 118), (tx - 3, 118), (tx - 4, 127)], [(tx + 3, 118), (tx + 5, 118), (tx + 4, 127)], [(tx - 1.5, 118), (tx + 1.5, 118), (tx, 127)]):
        paste(layer, render(poly(S, LH, pts), GOLD, rim=False))

    # three harpoon ports each side, front first; the salvo ripples front to back
    for k, py in enumerate((82, 68, 54)):
        local = None if wave is None else wave - k * 0.7
        px = int(bend(py))
        if local is None or local <= 0:
            stage = None
        elif local < 1.4:
            stage = 0
        elif local < 2.4:
            stage = 1
        else:
            stage = 2
        broadside(layer, cx + px, py, 17, stage, shaft=7)
    if flash:
        layer = tint(layer, (255, 255, 255), flash)
    return layer


# --------------------------------------------------------------------------- the sheets

def flashed(f):
    return tint(f, (255, 255, 255), 0.6)


def death(frame_fn, pale_colour, **kw):
    out = []
    for pale, scale, alpha in [(0.3, 1.0, 1.0), (0.55, 0.9, 0.8), (0.7, 0.7, 0.4)]:
        f = tint(frame_fn(**kw), pale_colour, pale)
        if scale < 1:
            f = tint(shrink(f, scale), SEA, 0.25)
        out.append(fade(f, alpha))
    return out


MONSTERS = {
    'nautilus-gunship': {
        'title': 'Nautilus gunship',
        'idea': 'The sailing line unit. One cell, two moves a turn. Two harpoons a turn from its flanks.',
        'size': (S, S),
        'idle': [nautilus_frame(bob=i / 4) for i in range(4)],
        'attack': [nautilus_frame(bob=0.1, glow=1.0), nautilus_frame(bob=0.2, shot=1), nautilus_frame(bob=0.3, shot=2)],
        'hurt': [flashed(nautilus_frame(eyes='closed')), nautilus_frame(bob=0.5, eyes='closed')],
        'death': death(nautilus_frame, (0xd8, 0xe8, 0xe4), bob=0.3, eyes='dead'),
    },
    'coral-bastion': {
        'title': 'Coral bastion',
        'idea': 'The tank. One cell, one slow move, a big hull; a ballista each flank hits hard.',
        'size': (S, S),
        'idle': [bastion_frame(paddle=i / 4) for i in range(4)],
        'attack': [bastion_frame(paddle=0.1), bastion_frame(paddle=0.2, shot=1), bastion_frame(paddle=0.3, shot=2)],
        'hurt': [flashed(bastion_frame(eyes='closed')), bastion_frame(paddle=0.5, eyes='closed')],
        'death': death(bastion_frame, (0xd8, 0xe8, 0xe4), paddle=0.3, eyes='dead'),
    },
    'trident-ray': {
        'title': 'Trident ray',
        'idea': 'The skirmisher. Fast (three moves), fragile, one harpoon per flank and then gone.',
        'size': (S, S),
        'idle': [ray_frame(flap=i / 4) for i in range(4)],
        'attack': [ray_frame(flap=0.1), ray_frame(flap=0.2, shot=1), ray_frame(flap=0.3, shot=2)],
        'hurt': [flashed(ray_frame(eyes='closed')), ray_frame(flap=0.5, eyes='closed')],
        'death': death(ray_frame, (0xd8, 0xe8, 0xe4), flap=0.3, eyes='dead'),
    },
    'atlantean-leviathan': {
        'title': 'Atlantean leviathan',
        'idea': 'The boss, two cells and stationary. Six ports fire in a ripple down the flank, front to back.',
        'size': (S, LH),
        'idle': [leviathan_frame(sway=math.sin(i / 4 * 2 * math.pi) * 0.9, glow=1.0) for i in range(4)],
        'attack': [leviathan_frame(sway=0.2, wave=0.5), leviathan_frame(sway=0.3, wave=1.8), leviathan_frame(sway=0.4, wave=3.2)],
        'hurt': [flashed(leviathan_frame(sway=0.2, eyes='closed')), leviathan_frame(sway=-0.3, eyes='closed')],
        'death': death(leviathan_frame, (0xd8, 0xe8, 0xe4), sway=0.3, eyes='dead'),
    },
}

ROWS = ['idle', 'attack', 'hurt', 'death']


def build_sheet(name, spec):
    fw, fh = spec['size']
    cw, ch = fw + 2 * G, fh + 2 * G
    sheet_w = max(len(spec[r]) for r in ROWS) * cw
    sheet_h = len(ROWS) * ch
    sheet = blank(sheet_w, sheet_h)
    manifest = {'sheet': {'width': sheet_w, 'height': sheet_h}, 'frames': {}}
    for ri, row in enumerate(ROWS):
        for i, f in enumerate(spec[row]):
            x, y = i * cw + G, ri * ch + G
            sheet[y:y + fh, x:x + fw] = f
            manifest['frames'][f'{row}/{i}'] = {'x': x, 'y': y, 'w': fw, 'h': fh}
    Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT_DIR, f'{name}.png'))
    with open(os.path.join(OUT_DIR, f'{name}.json'), 'w', encoding='utf8') as out:
        json.dump(manifest, out, indent=1)
        out.write('\n')
    return sheet


def build_harpoon():
    """The projectile, flying right (the game flips it for the left): launch, flight, impact splash."""
    w, h = 40, 16
    frames = []
    f = blank(w, h)
    harpoon(f, 8, 7, 1, shaft=14, glow=True)
    put(f, 5, 7, GLOW)
    put(f, 4, 6, SPRAY)
    put(f, 4, 9, SPRAY)
    frames.append(f)
    f = blank(w, h)
    harpoon(f, 12, 7, 1, shaft=14, glow=True)
    frames.append(f)
    f = blank(w, h)
    harpoon(f, 12, 7, 1, shaft=8)
    for k in range(10):
        a = k / 10 * 2 * math.pi
        put(f, 31 + math.cos(a) * (3 + k % 3), 8 + math.sin(a) * (3 + k % 3), SPRAY)
    frames.append(f)
    sheet = blank(w * 3, h)
    manifest = {'sheet': {'width': w * 3, 'height': h}, 'frames': {}}
    for i, fr in enumerate(frames):
        sheet[:, i * w:(i + 1) * w] = fr
        manifest['frames'][f'flight/{i}'] = {'x': i * w, 'y': 0, 'w': w, 'h': h}
    Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT_DIR, 'harpoon.png'))
    with open(os.path.join(OUT_DIR, 'harpoon.json'), 'w', encoding='utf8') as out:
        json.dump(manifest, out, indent=1)
        out.write('\n')


def overview(sheets):
    scale = 3
    pad = 10
    label_h = 14
    imgs = [(n, Image.fromarray(s, 'RGBA').resize((s.shape[1] * scale, s.shape[0] * scale), Image.NEAREST)) for n, s in sheets.items()]
    total_w = sum(i.width for _, i in imgs) + pad * (len(imgs) + 1)
    total_h = max(i.height for _, i in imgs) + pad * 2 + label_h
    canvas = Image.new('RGBA', (total_w, total_h), (*SEA, 255))
    d = ImageDraw.Draw(canvas)
    x = pad
    for name, img in imgs:
        canvas.alpha_composite(img, (x, pad + label_h))
        d.text((x, pad), MONSTERS[name]['title'], fill=(255, 255, 255, 255))
        x += img.width + pad
    canvas.save(os.path.join(OUT_DIR, 'overview.png'))


def gif():
    """Each monster idling, then firing, then idling again."""
    scale = 3
    pad = 8
    cell = S * scale
    tall = 2 * S * scale
    names = list(MONSTERS)
    w = (cell + pad) * len(names) + pad
    frames = []
    for step in range(11):
        canvas = Image.new('RGBA', (w, tall + 2 * pad), (*SEA, 255))
        x = pad
        for name in names:
            spec = MONSTERS[name]
            if step < 4:
                f = spec['idle'][step]
            elif step < 7:
                f = spec['attack'][step - 4]
            else:
                f = spec['idle'][step - 7]
            img = Image.fromarray(f, 'RGBA').resize((f.shape[1] * scale, f.shape[0] * scale), Image.NEAREST)
            canvas.alpha_composite(img, (x, pad + (tall - img.height) // 2))
            x += cell + pad
        frames.append(canvas.convert('P', palette=Image.ADAPTIVE))
    frames[0].save(os.path.join(OUT_DIR, 'overview.gif'), save_all=True, append_images=frames[1:], duration=220, loop=0, disposal=2)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    sheets = {n: build_sheet(n, s) for n, s in MONSTERS.items()}
    build_harpoon()
    overview(sheets)
    gif()
    print('wrote', ', '.join(sheets), 'and harpoon to', OUT_DIR)


if __name__ == '__main__':
    main()
