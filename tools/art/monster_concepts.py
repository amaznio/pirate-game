"""Draws proof-of-concept sprite sheets for five new sea monsters.

Same pipeline as sea_monsters.py (numpy layers, nearest-neighbour
pixel art, one 64 x 64 board cell a frame, nose to the bottom), but they are
concepts: nothing here is wired into the game. Each sheet has the rows idle (4),
attack (3), hurt (2) and death (3).

Run from the repo root:  python tools/art/monster_concepts.py
Writes docs/media/monster-concepts/<id>.png, <id>.json (frame manifest),
overview.png and overview.gif.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from pixel import blank, erode, fade, interior, mask_of, paste, render, scales, shrink, tint  # noqa: E402

S = 64
G = 2
LIGHT_DIR = (-0.6, -0.8)  # light from the top left, as in the ship sheet

OUT_DIR = os.path.join('docs', 'media', 'monster-concepts')


# --------------------------------------------------------------------------- tools

def noise(x, y, salt=0):
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65536.0


def shade(mask, pal, alpha=255):
    """Fill a mask in the ship style (pixel.render): outline, flat base, a light top-left rim, a shadow bottom-right.

    Thin parts (a tentacle, a spine) skip the rim bands, so they stay readable. pal is
    (outline, dark, base, light, bright).
    """
    layer = render(mask, pal, rim=bool(erode(mask, 2).any()))
    if alpha != 255:
        layer[..., 3] = np.where(layer[..., 3] > 0, alpha, 0)
    return layer


def ell(w, h, cx, cy, rx, ry):
    return mask_of(w, h, lambda d: d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255))


def poly(w, h, pts):
    return mask_of(w, h, lambda d: d.polygon([(float(x), float(y)) for x, y in pts], fill=255))


def stroke(w, h, pts, width):
    """A thick polyline with round joints."""
    def paint(d):
        d.line([(float(x), float(y)) for x, y in pts], fill=255, width=width)
        r = width / 2.0
        for x, y in pts:
            d.ellipse([x - r + 0.5, y - r + 0.5, x + r - 0.5, y + r - 0.5], fill=255)
    return mask_of(w, h, paint)


def put(layer, x, y, col, alpha=255):
    if 0 <= y < layer.shape[0] and 0 <= x < layer.shape[1]:
        layer[y, x] = (*col, alpha)


def inside(layer, mask_layer):
    """Pixel coordinates (y, x) of the opaque pixels of a shaded part."""
    return np.nonzero(mask_layer[..., 3] > 0)


def line_px(layer, p0, p1, col, within=None, alpha=255):
    steps = int(max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]))) + 1
    for i in range(steps + 1):
        t = i / max(1, steps)
        x, y = int(round(p0[0] + (p1[0] - p0[0]) * t)), int(round(p0[1] + (p1[1] - p0[1]) * t))
        if 0 <= y < layer.shape[0] and 0 <= x < layer.shape[1] and (within is None or within[y, x]):
            layer[y, x] = (*col, alpha)


def eye(layer, x, y, state, white=(0xf4, 0xf0, 0xdc), pupil=(0x14, 0x10, 0x18), lid=(0x20, 0x20, 0x30)):
    if state == 'open':
        layer[y - 1:y + 2, x - 1:x + 2] = (*pupil, 255)
        put(layer, x - 1, y - 1, white)
    elif state == 'closed':
        for dx in (-1, 0, 1):
            put(layer, x + dx, y, lid)
    else:  # dead
        for k in (-1, 0, 1):
            put(layer, x + k, y + k, lid)
            put(layer, x + k, y - k, lid)


# --------------------------------------------------------------------------- 1. rock crab

CRAB = ((0x3a, 0x14, 0x12), (0x8a, 0x30, 0x20), (0xc0, 0x52, 0x2c), (0xe0, 0x7c, 0x44), (0xf2, 0xae, 0x74))
CRAB_LEG = ((0x3a, 0x14, 0x12), (0x70, 0x26, 0x1c), (0xa4, 0x42, 0x26), (0xc8, 0x62, 0x36), (0xe0, 0x84, 0x4c))


def crab_frame(step=0.0, claw=0.3, lunge=0, eyes='open'):
    """A rock crab. step shuffles the legs, claw opens the pincers (0 shut, 1 wide), lunge pushes forward."""
    layer = blank(S, S)
    cy = 23 + lunge

    # legs, three a side, the knee out and the foot down and out
    for side in (-1, 1):
        for i in range(3):
            phase = math.sin(step * 2 * math.pi + i * 2.1 + (0 if side < 0 else math.pi))
            sx, sy = 32 + side * 11, cy + (-3 + i * 5)
            kx, ky = sx + side * 9, sy - 3 + phase * 1.5
            fx, fy = kx + side * 3, ky + 8 + phase * 2.5
            leg = stroke(S, S, [(sx, sy), (kx, ky), (fx, fy)], 4)
            paste(layer, shade(leg, CRAB_LEG))

    # arms and claws, drawn under the shell so the shoulders tuck in
    for side in (-1, 1):
        sx, sy = 32 + side * 11, cy + 8
        ex, ey = 32 + side * 18, cy + 13
        px, py = 32 + side * 13, cy + 22
        arm = stroke(S, S, [(sx, sy), (ex, ey), (px, py - 3)], 5)
        paste(layer, shade(arm, CRAB_LEG))
        # one claw mask: a palm, a fixed finger and a moving one, so the outline is shared
        spread = 0.2 + claw * 0.4
        claw_mask = ell(S, S, px, py - 2, 6.5, 5)
        for ang, hook in ((spread, -1.6), (-spread, 1.6)):
            tipx = px + math.sin(ang) * 14 + hook
            tipy = py + math.cos(ang) * 14 + 2
            nx, ny = math.cos(ang), -math.sin(ang)
            claw_mask |= poly(S, S, [(px + nx * 3.0, py + 1 + ny * 3.0), (px - nx * 3.0, py + 1 - ny * 3.0),
                                     (tipx - nx * 0.8, tipy - ny * 0.8), (tipx, tipy)])
        paste(layer, shade(claw_mask, CRAB))

    # the shell: a broad dome with a flat front, a ridge and barnacle specks
    shell = poly(S, S, [
        (32 - 15, cy - 2), (32 - 11, cy - 10), (32 - 4, cy - 13), (32 + 4, cy - 13), (32 + 11, cy - 10),
        (32 + 15, cy - 2), (32 + 13, cy + 7), (32 + 6, cy + 12), (32 - 6, cy + 12), (32 - 13, cy + 7),
    ])
    body = shade(shell, CRAB)
    for dx, dy in ((-8, -4), (-5, -7), (0, -8), (5, -7), (8, -4), (-9, 1), (9, 1), (-3, -2), (3, -2), (-6, 3), (6, 3)):
        put(body, 32 + dx, cy + dy, CRAB[4])  # tubercles on the shell, each with a shadow under it
        put(body, 32 + dx, cy + dy + 1, CRAB[1])
    for dx in range(-9, 10):  # a brow ridge across the front
        y = cy + 5 - int(abs(dx) * 0.18)
        if shell[y, 32 + dx]:
            body[y, 32 + dx] = (*CRAB[1], 255)
    paste(layer, body)

    # eyes on short stalks at the front
    for side in (-1, 1):
        ex, ey = 32 + side * 5, cy + 11
        stalk = stroke(S, S, [(ex, cy + 7), (ex, ey)], 2)
        paste(layer, shade(stalk, CRAB_LEG))
        ball = ell(S, S, ex, ey + 1, 3, 3)
        paste(layer, shade(ball, ((0x20, 0x10, 0x10), (0xc8, 0xb0, 0x70), (0xee, 0xe4, 0xb0), (0xfa, 0xf4, 0xd8), (255, 255, 255))))
        eye(layer, ex, ey + 1, eyes)
    return layer


# --------------------------------------------------------------------------- 2. moon jelly

JELLY = ((0x4a, 0x2a, 0x7a), (0x84, 0x5c, 0xc4), (0xb4, 0x92, 0xe6), (0xd4, 0xc0, 0xf6), (0xf0, 0xe6, 0xff))
JELLY_T = ((0x6a, 0x40, 0xa8), (0x8a, 0x62, 0xd0), (0xb8, 0x98, 0xee), (0xd8, 0xc4, 0xfa), (0xf8, 0xf0, 0xff))
SPARK = (0xff, 0xf2, 0x9c)


def jelly_frame(pulse=0.0, strike=0.0, flash=0.0, eyes='open'):
    """A drifting jelly seen from above. pulse swells and shrinks the bell; strike whips the tentacles forward."""
    layer = blank(S, S)
    r = 11.5 + pulse * 2.4
    cx, cy = 32, 40 - strike * 4

    # trailing tentacles from the back rim, wavy, and a few short oral arms
    n = 9
    for i in range(n):
        a = math.pi * (0.12 + 0.76 * i / (n - 1))  # along the back half (top)
        bx, by = cx - math.cos(a) * r * 0.9, cy - math.sin(a) * r * 0.9
        length = 20 + (i % 3) * 5
        pts = []
        for j in range(7):
            t = j / 6.0
            wave = math.sin(t * 5 + i * 1.3 + pulse * 2.0) * (2 + t * 2.5)
            spread = (i - (n - 1) / 2.0) * (0.9 + 0.9 * t)
            ty = by - t * length * (1.0 - strike * 0.9)
            if strike > 0:  # whipped forward round the bell and out ahead of it
                ang = (i - (n - 1) / 2.0) / (n / 2.0)
                ty = by + t * (length * 1.25 * strike) - t * length * (1.0 - strike) * 0.2
                spread = ang * (4 + t * 10)
                wave *= 0.5
            pts.append((bx + spread + wave, ty))
        tent = stroke(S, S, pts, 2)
        shaded = shade(tent, JELLY_T, 200)
        if strike > 0.3:  # the stinging tips spark
            put(shaded, int(round(pts[-1][0])), int(round(pts[-1][1])), SPARK)
            put(shaded, int(round(pts[-2][0])), int(round(pts[-2][1])), SPARK)
        paste(layer, shaded)
    for side in (-1, 1):
        for k in range(2):
            ox = cx + side * (2 + k * 3)
            arm = stroke(S, S, [(cx + side * (1 + k), cy + 2), (ox, cy + 9 + k * 2), (ox + side * 1.5, cy + 15 + k * 3 + strike * 4)], 3)
            paste(layer, shade(arm, JELLY_T, 210))

    # the bell: a dome with ribs and a four-ringed gut showing through
    bell_mask = ell(S, S, cx, cy, r, r * 0.95)
    bell = shade(bell_mask, JELLY, 225)
    ys, xs = inside(layer, bell)
    for ang in range(0, 360, 30):
        a = math.radians(ang + 15)
        line_px(bell, (cx + math.cos(a) * r * 0.35, cy + math.sin(a) * r * 0.35),
                (cx + math.cos(a) * (r - 2.5), cy + math.sin(a) * (r - 2.5)), JELLY[1], within=bell_mask, alpha=225)
    for k in range(4):
        a = math.radians(45 + k * 90)
        gx, gy = cx + math.cos(a) * 3.2, cy + math.sin(a) * 3.2
        g = ell(S, S, gx, gy, 2.6, 2.6)
        gl = shade(g, ((0xc8, 0x70, 0xa8), (0xe0, 0x90, 0xc8), (0xf4, 0xb0, 0xdc), (0xfc, 0xd0, 0xee), (255, 255, 255)), 235)
        bell[g] = gl[g]
    paste(layer, bell)

    # a pair of eye spots on the front rim
    for side in (-1, 1):
        eye(layer, cx + side * 5, int(cy + r * 0.72), eyes, white=(0xff, 0xff, 0xff), pupil=(0x2a, 0x14, 0x4a))

    if flash > 0:
        layer = tint(layer, (255, 255, 255), flash)
    return layer


# --------------------------------------------------------------------------- 3. sea serpent (three cells long)

SH = 3 * S  # the serpent is three cells long
SERP = ((0x0c, 0x2e, 0x2a), (0x1c, 0x5c, 0x4c), (0x2c, 0x8a, 0x62), (0x56, 0xb4, 0x7c), (0x9a, 0xde, 0xa6))
SERP_FIN = ((0x1a, 0x2e, 0x4a), (0x2c, 0x5a, 0x80), (0x48, 0x84, 0xae), (0x80, 0xb8, 0xd8), (0xc0, 0xe2, 0xf0))
BELLY = (0xd8, 0xd0, 0x90)
SMOUTH = (0x9c, 0x20, 0x2a)
SMOUTH_D = (0x56, 0x10, 0x1c)
FANG = (0xf6, 0xf4, 0xe0)


def serpent_frame(phase=0.0, lunge=0, jaw=0.0, eyes='open', rear=0.0):
    """The sea serpent: a long S-curve, tail at the top and the head at the bottom.

    phase slithers the body; lunge pushes the head forward; jaw opens it; rear coils
    the neck back on itself before a strike. The head is part of the body's own
    outline, so the neck flows into the skull with no seam.
    """
    layer = blank(S, SH)
    head_y = 148 + lunge - rear * 10
    tail_y = 14
    hy = int(round(head_y))

    def centre(y):
        t = (y - tail_y) / (head_y - tail_y)
        amp = 5 + 13 * math.sin(min(1.0, t * 1.4) * math.pi / 2)
        amp *= 1.0 + rear * 0.5
        return 32 + amp * math.sin(t * 5.2 + phase * 2 * math.pi), t

    def radius(t):
        return 2.2 + 6.2 * min(1.0, t * 1.5) ** 0.8 - max(0.0, t - 0.88) * 8

    hx, _ = centre(head_y - 8)

    # tail fin, a fan with ribs
    tx, _ = centre(tail_y)
    fin = poly(S, SH, [(tx, tail_y + 8), (tx - 9, tail_y - 2), (tx - 5, tail_y - 8), (tx, tail_y - 3), (tx + 5, tail_y - 8), (tx + 9, tail_y - 2)])
    paste(layer, shade(fin, SERP_FIN))

    # body discs, ending where the neck widens into the skull
    path = []
    body = np.zeros((SH, S), dtype=bool)
    for y in range(tail_y + 4, hy - 10, 2):
        x, t = centre(y)
        rr = radius(t)
        path.append((x, y, rr))
        body |= ell(S, SH, x, y, rr, rr + 1.6)
    spikes = np.zeros((SH, S), dtype=bool)
    for idx in range(0, len(path), 3):
        x, y, rr = path[idx]
        side = -1 if (idx // 3) % 2 else 1
        h = 3 + rr * 0.55
        spikes |= poly(S, SH, [(x + side * (rr - 2), y - 3), (x + side * (rr + h), y + 1), (x + side * (rr - 2), y + 4)])
    paste(layer, shade(spikes, SERP_FIN))

    # swept-back frills with ribs, behind the skull
    for side in (-1, 1):
        frill = poly(S, SH, [(hx + side * 7, hy - 11), (hx + side * 17, hy - 17), (hx + side * 15, hy - 11),
                             (hx + side * 22, hy - 8), (hx + side * 16, hy - 4), (hx + side * 20, hy + 2),
                             (hx + side * 9, hy + 2)])
        fl = shade(frill, SERP_FIN)
        for k in range(4):
            line_px(fl, (hx + side * 9, hy - 6 + k * 2), (hx + side * (17 + (k % 2) * 3), hy - 12 + k * 4), SERP_FIN[1], within=frill)
        paste(layer, fl)

    # the skull joins the body mask: cranium, cheeks, a long snout
    skull = poly(S, SH, [
        (hx - 7, hy - 12), (hx - 3, hy - 14), (hx + 3, hy - 14), (hx + 7, hy - 12), (hx + 10, hy - 5),
        (hx + 10, hy + 2), (hx + 7, hy + 8), (hx + 5, hy + 12), (hx + 4, hy + 18), (hx, hy + 20),
        (hx - 4, hy + 18), (hx - 5, hy + 12), (hx - 7, hy + 8), (hx - 10, hy + 2), (hx - 10, hy - 5),
    ])
    whole = body | skull
    shaded = shade(whole, SERP)
    scales(shaded, interior(body) & (np.arange(SH)[:, None] < hy - 12), SERP, sw=6, sh=4)
    ys, xs = np.nonzero(body)
    for y, x in zip(ys, xs):
        if shaded[y, x, 3] == 0 or y > hy - 12:
            continue
        cxl, _ = centre(y)
        if abs(x - cxl) < 1.1 and tuple(shaded[y, x, :3]) != SERP[0]:
            shaded[y, x] = (*BELLY, 255)
    # a crest of ridges over the brow, and pale scale flecks on the cheeks
    for dx in (-3, 0, 3):
        for dy in range(-12, -3):
            if skull[hy + dy, int(hx + dx)]:
                shaded[hy + dy, int(hx + dx)] = (*SERP[1], 255)
    for side in (-1, 1):
        for k in range(3):
            put(shaded, int(hx + side * 8), hy + 1 + k * 2, SERP[4])
    paste(layer, shaded)

    # horns sweeping back from the cranium
    horn_pal = ((0x3a, 0x30, 0x20), (0x9a, 0x88, 0x60), (0xd8, 0xc8, 0x98), (0xf0, 0xe4, 0xc0), (255, 255, 240))
    for side in (-1, 1):
        horn = poly(S, SH, [(hx + side * 3, hy - 12), (hx + side * 6, hy - 13), (hx + side * 9, hy - 21), (hx + side * 4, hy - 15)])
        paste(layer, shade(horn, horn_pal))

    # the mouth: the snout tip is the upper jaw; the lower jaw drops away from it
    jaw_px = int(round(jaw * 8))
    if jaw_px > 0:
        tipy = hy + 17
        mouth = poly(S, SH, [(hx - 5, tipy - 3), (hx + 5, tipy - 3), (hx + 4, tipy + jaw_px + 3), (hx - 4, tipy + jaw_px + 3)])
        ml = blank(S, SH)
        ml[mouth] = (*SMOUTH, 255)
        for y in range(tipy + 2 + jaw_px // 2, tipy + jaw_px + 4):
            for x in range(S):
                if mouth[y, x]:
                    ml[y, x] = (*SMOUTH_D, 255)
        paste(layer, ml)
        lower = poly(S, SH, [(hx - 5, tipy + jaw_px + 1), (hx - 3, tipy + jaw_px + 6), (hx, tipy + jaw_px + 8), (hx + 3, tipy + jaw_px + 6), (hx + 5, tipy + jaw_px + 1),
                             (hx + 3, tipy + jaw_px + 1), (hx, tipy + jaw_px + 3), (hx - 3, tipy + jaw_px + 1)])
        paste(layer, shade(lower, SERP))
        for dx in (-3, 3):
            put(layer, int(hx + dx), tipy + jaw_px + 1, FANG)
            put(layer, int(hx + dx), tipy + jaw_px, FANG)
        for dx in (-4, -2, 2, 4):  # upper fangs hang from the snout
            for k in range(3):
                put(layer, int(hx + dx), tipy - 2 + k, FANG)
        for x in range(int(hx) - 5, int(hx) + 6):
            put(layer, x, tipy - 3, SERP[0])
    else:
        for dx in range(-3, 4):
            put(layer, int(hx + dx), hy + 17, SERP[0])
        for dx in (-3, 3):
            put(layer, int(hx + dx), hy + 18, FANG)
            put(layer, int(hx + dx), hy + 19, FANG)
    for dx in (-2, 2):
        put(layer, int(hx + dx), hy + 11, SERP[0])  # nostrils

    # eyes: a yellow slit under a heavy brow
    for dx in (-6, 6):
        ex, ey = int(hx + dx), hy - 3
        for k in (-1, 0, 1):
            put(layer, ex + k, ey - 2, SERP[0])  # brow
        if eyes == 'open':
            layer[ey - 1:ey + 2, ex - 1:ex + 2] = (0xff, 0xe0, 0x66, 255)
            for k in (-1, 0, 1):
                put(layer, ex, ey + k, (0x10, 0x08, 0x08))
        else:
            eye(layer, ex, ey, eyes)
    return layer


# --------------------------------------------------------------------------- 4. lantern angler

ANG = ((0x10, 0x10, 0x2a), (0x28, 0x26, 0x5a), (0x44, 0x40, 0x86), (0x66, 0x62, 0xac), (0x92, 0x8e, 0xd4))
ANG_FIN = ((0x10, 0x10, 0x2a), (0x20, 0x20, 0x4c), (0x36, 0x34, 0x72), (0x52, 0x50, 0x94), (0x78, 0x76, 0xbc))
LURE = (0xff, 0xe2, 0x6a)
LURE_GLOW = (0xff, 0xd0, 0x40)
DOT = (0x5c, 0xf0, 0xe0)
AMOUTH = (0x7a, 0x14, 0x30)
AMOUTH_D = (0x3c, 0x08, 0x1c)


def angler_frame(bob=0.0, jaw=0.0, glow=0.0, eyes='open', lure_pull=0.0):
    """A lantern angler: a round dark body, a huge mouth and a glowing lure dangling ahead of it."""
    layer = blank(S, S)
    cx, cy = 32, 30
    sway = bob * 2.0

    # tail and fins (behind)
    tail = poly(S, S, [(cx, cy - 8), (cx - 8 + sway, 2), (cx - 3 + sway, 5), (cx + sway, 1), (cx + 3 + sway, 5), (cx + 8 + sway, 2)])
    paste(layer, shade(tail, ANG_FIN))
    for side in (-1, 1):
        fin = poly(S, S, [(cx + side * 12, cy - 2), (cx + side * 23, cy - 6 + bob * 2), (cx + side * 24, cy + 4 + bob * 2), (cx + side * 13, cy + 8)])
        fl = shade(fin, ANG_FIN)
        for k in range(3):
            line_px(fl, (cx + side * 13, cy + k * 2), (cx + side * 22, cy - 3 + k * 3 + bob * 2), ANG_FIN[1], within=fin)
        paste(layer, fl)

    # the lure on its stalk, arching forward over the mouth (drawn before the body so it roots in the head)
    jawdrop = int(round(jaw * 7))
    lx, ly = cx + sway * 1.5, 58 - lure_pull * 8
    stalk = stroke(S, S, [(cx, cy + 4), (cx + 1, cy + 14), (cx + sway, ly - 8), (lx, ly - 2)], 2)
    paste(layer, shade(stalk, ANG_FIN))
    pulse = 4.2 + glow * 2.5
    halo = ell(S, S, lx, ly, pulse + 4, pulse + 4)
    halo_layer = blank(S, S)
    halo_layer[halo] = (*LURE_GLOW, 70)
    inner = ell(S, S, lx, ly, pulse + 2, pulse + 2)
    halo_layer[inner] = (*LURE_GLOW, 120)
    paste(layer, halo_layer)

    # body, then the mouth over its front
    body_mask = ell(S, S, cx, cy + 2, 16, 16)
    body = shade(body_mask, ANG)
    scales(body, interior(body_mask), ANG, sw=6, sh=4)
    for side in (-1, 1):
        for k in range(4):
            put(body, cx + side * (13 - (k % 2)), cy - 6 + k * 5, DOT)
    paste(layer, body)

    my = 48
    open_h = 3 + jawdrop
    mouth = ell(S, S, cx, my, 13, open_h)
    ml = blank(S, S)
    ml[mouth] = (*AMOUTH, 255)
    ml[ell(S, S, cx, my + 1, 10, max(1, open_h - 2))] = (*AMOUTH_D, 255)
    paste(layer, ml)
    rim = np.zeros((S, S), dtype=bool)
    rim |= ell(S, S, cx, my, 14, open_h + 1) & ~ell(S, S, cx, my, 13, open_h)
    rl = blank(S, S)
    rl[rim] = (*ANG[0], 255)
    paste(layer, rl)
    for dx in range(-11, 12, 3):  # needle teeth top and bottom
        top = my - int(open_h * (1 - (dx / 13.0) ** 2) ** 0.5)
        bot = my + int(open_h * (1 - (dx / 13.0) ** 2) ** 0.5)
        for k in range(3):
            put(layer, cx + dx, top + k, FANG)
            put(layer, cx + dx + 1, bot - k + (1 if jawdrop else 0), FANG)

    for side in (-1, 1):
        ex, ey = cx + side * 9, 40
        ball = ell(S, S, ex, ey, 3, 3)
        paste(layer, shade(ball, ((0x10, 0x10, 0x2a), (0xb0, 0xa0, 0x50), (0xe8, 0xd8, 0x78), (0xff, 0xf0, 0xa0), (255, 255, 255))))
        eye(layer, ex, ey, eyes, white=(0xff, 0xff, 0xff))

    # the bright core of the lure goes on top of everything
    core = ell(S, S, lx, ly, pulse - 1.5, pulse - 1.5)
    cl = shade(core, ((0xe0, 0x9a, 0x20), (0xff, 0xc8, 0x40), (0xff, 0xe2, 0x6a), (0xff, 0xf2, 0xa8), (255, 255, 255)))
    paste(layer, cl)
    return layer


# --------------------------------------------------------------------------- 5. spine urchin

URCH = ((0x1c, 0x0e, 0x30), (0x3c, 0x24, 0x64), (0x5e, 0x3c, 0x94), (0x86, 0x62, 0xc0), (0xb0, 0x90, 0xe0))
SPIKE = ((0x1c, 0x0e, 0x30), (0x2c, 0x1a, 0x4c), (0x48, 0x2e, 0x78), (0x70, 0x52, 0xa8), (0xc8, 0xb0, 0xf0))


def urchin_frame(turn=0.0, reach=0.0, flash=0.0, eyes='open'):
    """A spine urchin: a purple core in a ring of spikes. turn rotates the spikes; reach shoots them out."""
    layer = blank(S, S)
    cx, cy = 32, 32
    n = 22
    for i in range(n):
        a = (i / n) * 2 * math.pi + turn * (math.pi / n) * 2
        long_spike = i % 2 == 0
        length = (14 if long_spike else 10) + reach * (8 if long_spike else 5)
        length += ((i * 7) % 5 - 2) * 0.5
        base_r = 7.5
        x0, y0 = cx + math.cos(a) * base_r, cy + math.sin(a) * base_r
        x1, y1 = cx + math.cos(a) * (base_r + length), cy + math.sin(a) * (base_r + length)
        nx, ny = -math.sin(a), math.cos(a)
        wide = 2.2 if long_spike else 1.8
        sp = poly(S, S, [(x0 + nx * wide, y0 + ny * wide), (x0 - nx * wide, y0 - ny * wide), (x1, y1)])
        shaded = shade(sp, SPIKE)
        put(shaded, int(round(x1)), int(round(y1)), SPIKE[4])
        paste(layer, shaded)
    core = shade(ell(S, S, cx, cy, 10, 10), URCH)
    scales(core, interior(ell(S, S, cx, cy, 10, 10)), URCH, sw=4, sh=3)
    paste(layer, core)
    for k in range(5):
        a = math.pi / 2 + (k - 2) * 0.55
        line_px(layer, (cx, cy + 6), (cx + math.cos(a) * 4.5, cy + 6 + math.sin(a) * 4.5 - 1), (0xee, 0xe2, 0xc8))
    for side in (-1, 1):
        ex, ey = cx + side * 5, cy + 1
        if eyes == 'open':
            layer[ey - 1:ey + 2, ex - 1:ex + 2] = (0xff, 0xd8, 0x50, 255)
            put(layer, ex, ey, (0x20, 0x10, 0x10))
        else:
            eye(layer, ex, ey, eyes, lid=(0x1c, 0x0e, 0x30))
    if flash > 0:
        layer = tint(layer, (255, 255, 255) if flash < 1 else (0xff, 0x70, 0x60), min(1.0, flash))
    return layer


# --------------------------------------------------------------------------- the sheets

def death(frame_fn, pale_colour, **kw):
    out = []
    for pale, scale, alpha, extra in [(0.3, 1.0, 1.0, {}), (0.55, 0.9, 0.8, {}), (0.7, 0.7, 0.4, {})]:
        f = frame_fn(**kw, **extra)
        f = tint(f, pale_colour, pale)
        if scale < 1:
            f = tint(shrink(f, scale), (0x1c, 0x85, 0xd9), 0.25)
        out.append(fade(f, alpha))
    return out


def death_tall(frame_fn, pale_colour):
    """The serpent sinks tail-first: it goes pale, sags and fades."""
    out = []
    for i, (pale, alpha, drop) in enumerate([(0.3, 1.0, 0), (0.55, 0.8, 6), (0.7, 0.4, 12)]):
        f = frame_fn(phase=0.3 + 0.2 * i, lunge=-drop, jaw=0.0, eyes='dead')
        f = tint(f, pale_colour, pale)
        if i:
            f = tint(f, (0x1c, 0x85, 0xd9), 0.15 * i)
        out.append(fade(f, alpha))
    return out


def flashed(f):
    return tint(f, (255, 255, 255), 0.6)


MONSTERS = {
    'rock-crab': {
        'title': 'Rock crab',
        'idea': 'Armoured and slow, steps in any of four directions (omnidirectional, 1 cell). Claws snap on a lash.',
        'size': (S, S),
        'idle': [crab_frame(step=i / 4, claw=0.25 + 0.1 * math.sin(i * 1.6)) for i in range(4)],
        'attack': [crab_frame(step=0.1, claw=1.0, lunge=-1), crab_frame(step=0.2, claw=1.0, lunge=2), crab_frame(step=0.3, claw=0.0, lunge=3)],
        'hurt': [flashed(crab_frame(step=0.2, claw=0.5, lunge=-1, eyes='closed')), crab_frame(step=0.6, claw=0.6, eyes='closed')],
        'death': death(crab_frame, (0xe8, 0xd8, 0xc8), step=0.3, claw=0.9, eyes='dead'),
    },
    'moon-jelly': {
        'title': 'Moon jelly',
        'idea': 'Drifts with the wind, weak but its sting is long: a lash reaches two cells (pulses, not a hull).',
        'size': (S, S),
        'idle': [jelly_frame(pulse=math.sin(i / 4 * 2 * math.pi)) for i in range(4)],
        'attack': [jelly_frame(pulse=-1.0, strike=0.0), jelly_frame(pulse=1.0, strike=0.7, flash=0.15), jelly_frame(pulse=0.2, strike=1.0, flash=0.3)],
        'hurt': [flashed(jelly_frame(pulse=-0.8, eyes='closed')), jelly_frame(pulse=-0.3, eyes='closed')],
        'death': death(jelly_frame, (0xf0, 0xe8, 0xff), pulse=-0.8, eyes='dead'),
    },
    'sea-serpent': {
        'title': 'Sea serpent',
        'idea': 'A three-cell stationary wall that strikes along its whole length (like the giant squid, bigger).',
        'size': (S, SH),
        'idle': [serpent_frame(phase=i / 4) for i in range(4)],
        'attack': [serpent_frame(phase=0.2, rear=1.0, jaw=0.2), serpent_frame(phase=0.3, lunge=10, jaw=1.0), serpent_frame(phase=0.4, lunge=6, jaw=0.0)],
        'hurt': [flashed(serpent_frame(phase=0.25, eyes='closed', rear=0.3)), serpent_frame(phase=0.7, eyes='closed')],
        'death': death_tall(serpent_frame, (0xd8, 0xe4, 0xd0)),
    },
    'lantern-angler': {
        'title': 'Lantern angler',
        'idea': 'A lurker: the glowing lure is a decoy that other monsters or an AI ship may be drawn toward; bites hard.',
        'size': (S, S),
        'idle': [angler_frame(bob=math.sin(i / 4 * 2 * math.pi), glow=0.5 + 0.5 * math.sin(i / 4 * 2 * math.pi)) for i in range(4)],
        'attack': [angler_frame(jaw=0.2, glow=1.0, lure_pull=0.5), angler_frame(jaw=1.0, glow=1.0, lure_pull=1.0), angler_frame(jaw=0.0, glow=0.5, lure_pull=0.2)],
        'hurt': [flashed(angler_frame(eyes='closed')), angler_frame(bob=0.8, eyes='closed')],
        'death': death(angler_frame, (0xd0, 0xd0, 0xe8), glow=0.0, eyes='dead'),
    },
    'spine-urchin': {
        'title': 'Spine urchin',
        'idea': 'Drifts and rolls; no lash, but any ship that rams or stops beside it takes spike damage (a mine).',
        'size': (S, S),
        'idle': [urchin_frame(turn=i * 0.15) for i in range(4)],
        'attack': [urchin_frame(turn=0.2, reach=0.2), urchin_frame(turn=0.3, reach=1.0, flash=0.2), urchin_frame(turn=0.4, reach=0.6)],
        'hurt': [flashed(urchin_frame(turn=0.3, eyes='closed')), urchin_frame(turn=0.5, reach=0.5, eyes='closed')],
        'death': death(urchin_frame, (0xe4, 0xd8, 0xf0), turn=0.3, eyes='dead'),
    },
}

ROWS = ['idle', 'attack', 'hurt', 'death']


def build_sheet(name, spec):
    fw, fh = spec['size']
    cell_w, cell_h = fw + 2 * G, fh + 2 * G
    sheet_w = max(len(spec[r]) for r in ROWS) * cell_w
    sheet_h = len(ROWS) * cell_h
    sheet = blank(sheet_w, sheet_h)
    manifest = {'sheet': {'width': sheet_w, 'height': sheet_h}, 'frames': {}}
    for ri, row in enumerate(ROWS):
        for i, f in enumerate(spec[row]):
            x, y = i * cell_w + G, ri * cell_h + G
            sheet[y:y + fh, x:x + fw] = f
            manifest['frames'][f'{row}/{i}'] = {'x': x, 'y': y, 'w': fw, 'h': fh}
    Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT_DIR, f'{name}.png'))
    with open(os.path.join(OUT_DIR, f'{name}.json'), 'w', encoding='utf8') as out:
        json.dump(manifest, out, indent=1)
        out.write('\n')
    return sheet


SEA = (0x1c, 0x85, 0xd9, 255)


def overview(sheets):
    """Every sheet on sea blue, 3x, with a label."""
    scale = 3
    pad = 10
    label_h = 14
    imgs = []
    for name, sheet in sheets.items():
        img = Image.fromarray(sheet, 'RGBA').resize((sheet.shape[1] * scale, sheet.shape[0] * scale), Image.NEAREST)
        imgs.append((name, img))
    # the serpent is tall, so lay out all in one row
    total_w = sum(i.width for _, i in imgs) + pad * (len(imgs) + 1)
    total_h = max(i.height for _, i in imgs) + pad * 2 + label_h
    canvas = Image.new('RGBA', (total_w, total_h), SEA)
    d = ImageDraw.Draw(canvas)
    x = pad
    for name, img in imgs:
        canvas.alpha_composite(img, (x, pad + label_h))
        d.text((x, pad), MONSTERS[name]['title'], fill=(255, 255, 255, 255))
        x += img.width + pad
    canvas.save(os.path.join(OUT_DIR, 'overview.png'))


def gif():
    """Idle and attack looping side by side for each monster."""
    scale = 3
    frames = []
    seq = ['idle'] * 1 + ['attack']
    order = list(MONSTERS)
    cell = S * scale
    tall = SH * scale
    pad = 8
    w = (cell + pad) * 4 + pad + cell
    for step in range(10):
        canvas = Image.new('RGBA', (w, tall + pad * 2), SEA)
        x = pad
        for name in order:
            spec = MONSTERS[name]
            frames_list = spec['idle'] if step < 4 else spec['attack'] if step < 7 else spec['idle']
            idx = step % 4 if step < 4 else (step - 4) if step < 7 else (step - 7) % 4
            f = frames_list[idx % len(frames_list)]
            img = Image.fromarray(f, 'RGBA').resize((f.shape[1] * scale, f.shape[0] * scale), Image.NEAREST)
            canvas.alpha_composite(img, (x, pad + (tall - img.height) // 2 if img.height < tall else pad))
            x += cell + pad
        frames.append(canvas.convert('P', palette=Image.ADAPTIVE))
    frames[0].save(os.path.join(OUT_DIR, 'overview.gif'), save_all=True, append_images=frames[1:], duration=200, loop=0, disposal=2)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    sheets = {name: build_sheet(name, spec) for name, spec in MONSTERS.items()}
    overview(sheets)
    gif()
    print('wrote', ', '.join(sheets), 'to', OUT_DIR)


if __name__ == '__main__':
    main()
