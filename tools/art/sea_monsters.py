"""Draws the sea monsters of the game in the ship-sheet style: squid, giant squid, tentacle and shark.

Each sheet keeps the layout the game already reads (frame sizes, names and rows, and the
manifests in apps/client/src/phaser/assets/*Frames.json), so a redrawn sheet drops in.
The look follows the Scallywag ships and the Atlantean set (see pixel.py): a crisp
outline, flat banded tones with a rim light on the top left and a shadow bottom right,
and deliberate detail (ribbed fins, a spotted mantle, rows of suckers, glinting eyes)
in place of soft gradients and scattered speckle.

Run from the repo root:  python tools/art/sea_monsters.py [squid|giant-squid|tentacle|shark ...]
Writes apps/client/public/assets/monsters/<name>.png, the manifests next to the game's
frame code, and previews in .scratch/monsters/.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from pixel import (blank, ell, erode, fade, interior, line_px, paste, poly, put, render, shift,  # noqa: E402
                   shrink, stroke, tint)

G = 2  # a transparent gutter round every frame on the sheet
SEA = (0x1c, 0x85, 0xd9)
OUT_ASSETS = os.path.join('apps', 'client', 'public', 'assets', 'monsters')
OUT_FRAMES = os.path.join('apps', 'client', 'src', 'phaser', 'assets')
PREVIEW = os.path.join('.scratch', 'monsters')

# (outline, dark, base, light, bright)
SQUID_P = ((0x3a, 0x12, 0x18), (0x8c, 0x2c, 0x2e), (0xc6, 0x4e, 0x3a), (0xee, 0x82, 0x58), (0xff, 0xc8, 0x98))
SQUID_FIN = ((0x3a, 0x12, 0x18), (0x9c, 0x3c, 0x3c), (0xdc, 0x70, 0x58), (0xf8, 0xa4, 0x7c), (0xff, 0xdc, 0xbc))
SQUID_ARM = ((0x3a, 0x12, 0x18), (0x96, 0x34, 0x32), (0xd4, 0x62, 0x4a), (0xf6, 0x98, 0x6e), (0xff, 0xd8, 0xb0))
GIANT_P = ((0x2a, 0x0c, 0x18), (0x6a, 0x20, 0x2e), (0xa2, 0x38, 0x3c), (0xcc, 0x5e, 0x4c), (0xf0, 0xa6, 0x86))
GIANT_FIN = ((0x2a, 0x0c, 0x18), (0x7c, 0x2c, 0x36), (0xb8, 0x4e, 0x48), (0xe0, 0x82, 0x68), (0xff, 0xc4, 0xa4))
GIANT_ARM = ((0x2a, 0x0c, 0x18), (0x7a, 0x26, 0x30), (0xb4, 0x44, 0x42), (0xdc, 0x74, 0x5c), (0xfa, 0xb8, 0x98))
SUCKER = (0xf8, 0xe4, 0xc0)
SUCKER_D = (0xc8, 0x96, 0x78)
EYE_P = ((0x4a, 0x2a, 0x0c), (0xb0, 0x76, 0x1c), (0xf4, 0xcc, 0x58), (0xff, 0xea, 0x96), (0xff, 0xff, 0xf0))
PUPIL = (0x1c, 0x10, 0x18)
INK = ((0x14, 0x18, 0x28), (0x22, 0x28, 0x42), (0x32, 0x3a, 0x5c), (0x48, 0x52, 0x7a), (0x7a, 0x86, 0xa8))
FOAM = (0xea, 0xf8, 0xff)
FOAM_D = (0xa8, 0xd0, 0xea)


# --------------------------------------------------------------------------- shared drawing

def catmull(pts, per=14):
    """A smooth path through the control points (Catmull-Rom), as a list of (x, y)."""
    p = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)
                for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def limb(w, h, pts, r0, r1, club=0.0):
    """A tapering limb along a smooth path: its mask, the path and the radius at each point."""
    if len(pts) == 3:
        path = [((1 - t) ** 2 * pts[0][0] + 2 * (1 - t) * t * pts[1][0] + t * t * pts[2][0],
                 (1 - t) ** 2 * pts[0][1] + 2 * (1 - t) * t * pts[1][1] + t * t * pts[2][1]) for t in [i / 40 for i in range(41)]]
    else:
        path = catmull(pts)
    n = len(path)
    radii = [r0 + (r1 - r0) * (i / (n - 1)) for i in range(n)]
    if club:  # a swelling at the tip
        for i in range(n):
            u = i / (n - 1)
            if u > 0.82:
                radii[i] += club * math.sin((u - 0.82) / 0.18 * math.pi * 0.5) ** 1.2
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    for (x, y), r in zip(path, radii):
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return np.array(img) > 0, path, radii


def suckers(layer, mask, path, radii, start=0.25, every=3.4, rows=2):
    """Pale suckers in a row down each edge of a limb, with a dark rim under each."""
    inner = erode(mask, 1)
    travelled, last = 0.0, -99.0
    n = len(path)
    for i in range(1, n):
        x0, y0 = path[i - 1]
        x1, y1 = path[i]
        step = math.hypot(x1 - x0, y1 - y0)
        travelled += step
        if i / n < start or radii[i] < 1.7 or travelled - last < every:
            continue
        last = travelled
        nx, ny = -(y1 - y0) / max(step, 1e-6), (x1 - x0) / max(step, 1e-6)
        for side in (-1, 1) if rows == 2 else (1,):
            px = int(round(x1 + nx * side * radii[i] * 0.5))
            py = int(round(y1 + ny * side * radii[i] * 0.5))
            if 0 <= py < layer.shape[0] and 0 <= px < layer.shape[1] and inner[py, px]:
                layer[py, px] = (*SUCKER, 255)
                if 0 <= py + 1 < layer.shape[0] and inner[py + 1, px]:
                    layer[py + 1, px] = (*SUCKER_D, 255)


def draw_limb(layer, w, h, pts, r0, r1, pal, club=0.0, sucker_start=0.25, every=3.4, rim=True):
    mask, path, radii = limb(w, h, pts, r0, r1, club)
    paste(layer, render(mask, pal, rim=rim))
    suckers(layer, mask, path, radii, start=sucker_start, every=every)
    return mask, path


def scanline(w, h, y0, y1, half_of, cx):
    """A mask filled row by row: x from cx - half to cx + half, so the edges step cleanly."""
    m = np.zeros((h, w), dtype=bool)
    for y in range(int(y0), int(y1) + 1):
        hw = half_of(y)
        a, b = int(round(cx - hw)), int(round(cx + hw))
        if b > a:
            m[y, max(0, a):min(w, b)] = True
    return m


def eye(layer, x, y, r, state):
    """A big gold eye with a dark horizontal slit, a socket ring and a glint."""
    h, w = layer.shape[:2]
    if state == 'open':
        paste(layer, render(ell(w, h, x, y, r, r), EYE_P))
        for dx in range(-r + 2, r - 1):
            put(layer, x + dx, y, PUPIL)
            put(layer, x + dx, y + 1, PUPIL)
        put(layer, x - r + 2, y - r + 2, (255, 255, 255))
    elif state == 'closed':
        paste(layer, render(ell(w, h, x, y, r, r), SQUID_P))
        for dx in range(-r + 1, r):
            put(layer, x + dx, y, SQUID_P[0])
    else:
        paste(layer, render(ell(w, h, x, y, r, r), ((0x5a, 0x50, 0x48), (0xa0, 0x98, 0x8c), (0xd0, 0xc8, 0xb8), (0xe8, 0xe2, 0xd4), (255, 255, 255))))
        for k in range(-2, 3):
            put(layer, x + k, y + k, PUPIL)
            put(layer, x + k, y - k, PUPIL)


# --------------------------------------------------------------------------- the squid body (small and giant)

def squid_body(w, h, s, phase=0.0, eyes='open', pull=0.0, droop=0.0, fin=1.0, lunge=0.0):
    """A squid from above, arms to the bottom: fins, a spotted mantle, a head with big eyes, arms and two tentacles.

    s is the spec of the animal: where its parts sit in the frame, and its palettes.
    """
    layer = blank(w, h)
    cx = w / 2.0
    sway = math.sin(phase * 2 * math.pi) * (1 - droop)
    flap = math.sin(phase * 2 * math.pi + 1.2) * fin
    a0, a1 = s['apex'], s['collar']
    length = a1 - a0
    breathe = 1 + 0.035 * math.sin(phase * 2 * math.pi + 0.6) * (1 - droop)

    # the two long tentacles, behind everything: a stalk, then a clubbed tip with suckers
    ty = s['head_y'] + s['head_ry'] - 2
    for side in (-1, 1):
        reach = s['tent_reach'] * (0.62 + 0.38 * (1 - pull)) + s['tent_lunge'] * lunge
        pts = [(cx + side * 4, ty),
               (cx + side * (s['tent_spread'] + 3 * sway - 6 * lunge + 5 * droop), ty + reach * 0.45),
               (cx + side * (s['tent_spread'] * 0.7 - 3 * sway * side - 4 * lunge + 8 * droop), ty + reach)]
        paste(layer, render(limb(w, h, pts, 1.9, 1.6, club=s['club'] + lunge * 0.8)[0], s['arm']))
        mask, path, radii = limb(w, h, pts, 1.9, 1.6, club=s['club'] + lunge * 0.8)
        suckers(layer, mask, path, radii, start=0.78, every=2.6)

    # the short arms, fanned from the head, curling a little as they sway
    n_arms = len(s['arm_angles'])
    for i, ang in enumerate(s['arm_angles']):
        curl = math.sin(phase * 2 * math.pi + i * 0.9) * s['arm_curl']
        L = s['arm_len'] * (1 - 0.35 * pull) + 3 * droop
        pts = [(cx + math.sin(ang) * s['head_rx'] * 0.5, ty - 3),
               (cx + math.sin(ang) * (s['head_rx'] * 0.9) + curl, ty + L * 0.45),
               (cx + math.sin(ang) * (s['head_rx'] * 1.25 + 4 * droop) - curl * 0.6, ty + L + abs(ang) * 2 - 4 * droop)]
        draw_limb(layer, w, h, pts, s['arm_r'], 0.9, s['arm'], sucker_start=0.3, every=3.0)

    def half_of(y):
        u = (y - a0) / length
        if u < 0.6:
            return s['mantle_half'] * breathe * math.sin(math.pi / 2 * max(0.0, u) / 0.6) ** 0.85
        return s['mantle_half'] * breathe * (1 - 0.16 * ((u - 0.6) / 0.4) ** 2)

    # the fins: ribbed diamonds at the back of the mantle, flapping
    fw = s['fin_half'] * (0.6 + 0.4 * fin) + 2.0 * flap * fin
    for side in (-1, 1):
        def edge(u):
            uu = (u * length) / length
            return half_of(a0 + u * length)
        pts = [(cx + side * edge(0.12), a0 + 0.12 * length), (cx + side * fw * 0.85, a0 + 0.22 * length), (cx + side * fw, a0 + 0.34 * length),
               (cx + side * fw * 0.78, a0 + 0.5 * length), (cx + side * edge(0.64), a0 + 0.64 * length)]
        fm = poly(w, h, pts)
        f = render(fm, s['fin'])
        ins = interior(fm)
        for k in range(4):  # ribs fanning out from the root to the rim
            ry = a0 + (0.2 + k * 0.13) * length
            line_px(f, (cx + side * (edge(0.3) + 1), ry), (cx + side * (fw * (0.8 + 0.2 * math.sin((k + 0.5) * 0.9))), a0 + (0.22 + k * 0.1) * length), s['fin'][1], within=ins)
        paste(layer, f)

    # the mantle: a spotted cone with a ridge, side stripes and a darker collar
    half = half_of

    mantle = scanline(w, h, a0, a1, half, cx)
    m = render(mantle, s['pal'])
    ins = interior(mantle)
    for k, uu in enumerate((0.2, 0.32, 0.44, 0.56, 0.68, 0.8)):  # spots in staggered rows
        y = int(a0 + uu * length)
        hh = half(y)
        offs = (0.36, 0.72) if k % 2 == 0 else (0.0, 0.54)
        for off in offs:
            for sgn in ((-1, 1) if off else (1,)):
                px = int(round(cx + sgn * off * hh))
                for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                    if 0 <= y + dy < h and 0 <= px + dx < w and ins[y + dy, px + dx]:
                        m[y + dy, px + dx] = (*s['pal'][1], 255)
                if 0 <= y - 1 < h and ins[y - 1, px]:
                    m[y - 1, px] = (*s['pal'][3], 255)
    for y in range(int(a0) + 4, int(a1) - 3):  # the dorsal ridge, light with a dark break every few pixels
        if ins[y, int(cx)]:
            m[y, int(cx)] = (*(s['pal'][3] if y % 5 else s['pal'][1]), 255)
    for y in range(int(a1) - 5, int(a1) - 2):  # the collar band
        for x in range(w):
            if ins[y, x]:
                m[y, x] = (*s['pal'][1], 255)
    paste(layer, m)

    # the head: a rounded block under the mantle with a brow, and the big eyes
    head = ell(w, h, cx, s['head_y'], s['head_rx'], s['head_ry'])
    hl = render(head, s['arm'])
    paste(layer, hl)
    for side in (-1, 1):
        eye(layer, int(cx + side * s['eye_dx']), int(s['head_y'] + s['eye_dy']), s['eye_r'], eyes)
    # a siphon, a short pale funnel at the front of the head
    for dy in range(2):
        put(layer, cx - 1, s['head_y'] + s['head_ry'] - 3 + dy, s['arm'][3])
        put(layer, cx, s['head_y'] + s['head_ry'] - 3 + dy, s['arm'][3])
    return layer


SQUID_SPEC = dict(
    apex=40, collar=96, mantle_half=16.5, fin_half=26, head_y=103, head_rx=14, head_ry=9, eye_dx=13, eye_dy=-1, eye_r=4,
    arm_angles=[-1.1, -0.66, -0.24, 0.24, 0.66, 1.1], arm_len=22, arm_curl=2.2, arm_r=3.6,
    tent_reach=27, tent_lunge=34, tent_spread=11, club=1.8,
    pal=SQUID_P, fin=SQUID_FIN, arm=SQUID_ARM,
)
GIANT_SPEC = dict(
    apex=3, collar=66, mantle_half=20.5, fin_half=30, head_y=75, head_rx=21, head_ry=12, eye_dx=17, eye_dy=-1, eye_r=5,
    arm_angles=[-1.1, -0.66, -0.24, 0.24, 0.66, 1.1], arm_len=34, arm_curl=3.5, arm_r=5.0,
    tent_reach=42, tent_lunge=0, tent_spread=26, club=2.8,
    pal=GIANT_P, fin=GIANT_FIN, arm=GIANT_ARM,
)


# --------------------------------------------------------------------------- sheets

def write_sheet(name, rows, manifest_name, frame_h_of=None):
    """Lay the rows out with a gutter and write the png and the manifest the game reads."""
    sheet_w = max(len(frames) * (fw + 2 * G) for _, frames, fw, _ in rows)
    sheet_h = sum(fh + 2 * G for _, _, _, fh in rows)
    sheet = blank(sheet_w, sheet_h)
    manifest = {'sheet': {'width': sheet_w, 'height': sheet_h}, 'frames': {}}
    y = 0
    for row_name, frames, fw, fh in rows:
        for i, f in enumerate(frames):
            x = i * (fw + 2 * G) + G
            sheet[y + G:y + G + fh, x:x + fw] = f
            manifest['frames'][f'{row_name}/{i}'] = {'x': x, 'y': y + G, 'w': fw, 'h': fh}
        y += fh + 2 * G
    os.makedirs(OUT_ASSETS, exist_ok=True)
    Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT_ASSETS, f'{name}.png'))
    with open(os.path.join(OUT_FRAMES, manifest_name), 'w', encoding='utf8') as out:
        json.dump(manifest, out, indent=1)
        out.write('\n')
    os.makedirs(PREVIEW, exist_ok=True)
    scale = 3
    prev = Image.new('RGBA', ((sheet_w + 8) * scale, (sheet_h + 8) * scale), (*SEA, 255))
    prev.alpha_composite(Image.fromarray(sheet, 'RGBA').resize((sheet_w * scale, sheet_h * scale), Image.NEAREST), (4 * scale, 4 * scale))
    prev.save(os.path.join(PREVIEW, f'{name}.png'))
    return sheet


def flash(f):
    return tint(f, (255, 255, 255), 0.6)


def death_fade(body, pale, scale, alpha, colour=(0xd8, 0xc0, 0xb4)):
    body = tint(body, colour, pale)
    if scale < 1:
        body = tint(shrink(body, scale), SEA, 0.2)
    return fade(body, alpha)


def build_squid():
    w, h = 64, 160
    f = lambda **kw: squid_body(w, h, SQUID_SPEC, **kw)
    idle = [f(phase=i / 4) for i in range(4)]
    lash = [f(phase=0.2, pull=0.3), f(phase=0.2, lunge=0.65), f(phase=0.2, lunge=1.0)]
    hurt = [flash(f(phase=0.0, eyes='closed', pull=0.55, fin=0.2)), f(phase=0.5, eyes='closed', pull=0.55, fin=0.2)]
    specs = [(0.15, 0.0, 0.5, 0.30, 1.0, 1.0), (0.0, 0.6, 0.3, 0.50, 0.9, 0.7), (0.0, 1.0, 0.2, 0.65, 0.72, 0.35)]
    death = [death_fade(f(phase=0.25, eyes='dead', pull=p, droop=d, fin=fi), pale, sc, al) for p, d, fi, pale, sc, al in specs]
    write_sheet('squid', [('idle', idle, w, h), ('bite', lash, w, h), ('hurt', hurt, w, h), ('death', death, w, h)], 'squidFrames.json')


# --------------------------------------------------------------------------- giant squid

def ink_cloud(w, h, size, alpha=1.0):
    """A cloud of ink round the body: blobs in one outlined mass that grows with size (0 to 1)."""
    blobs = [(-14, 8, 11), (16, 2, 12), (-4, -24, 12), (6, 30, 11), (-22, -14, 9), (24, 22, 9), (0, 4, 14), (-12, 36, 8), (14, -30, 8)]
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    cx, cy = w / 2, h * 0.55
    for bx, by, r in blobs:
        rr = r * size
        if rr >= 1:
            d.ellipse([cx + bx * size - rr, cy + by * size - rr, cx + bx * size + rr, cy + by * size + rr], fill=255)
    mask = np.array(img) > 0
    return fade(render(mask, INK), alpha)


def whip_frame(step):
    """A tentacle lashing out from the giant squid's arms into the next cell (the overlay, 96 x 64)."""
    w, h = 96, 64
    layer = blank(w, h)
    reach = [0.0, 0.45, 0.9, 1.0, 0.7, 0.25][step]
    if reach <= 0:
        return layer
    bow = [0, 5, 9, 7, 4, 1][step]
    p0 = (14, 18)
    p2 = (14 + 78 * reach, 18 + 22 * reach)
    p1 = ((p0[0] + p2[0]) / 2 + 4, 6 - bow)
    mask, path, radii = limb(w, h, [p0, p1, p2], 4.4, 2.6, club=3.0 if reach > 0.8 else 1.2)
    paste(layer, render(mask, GIANT_ARM))
    suckers(layer, mask, path, radii, start=0.35, every=3.0)
    return layer


def build_giant_squid():
    w, h = 64, 128
    f = lambda **kw: squid_body(w, h, GIANT_SPEC, **kw)
    idle = [f(phase=i / 4) for i in range(4)]
    whips = [whip_frame(i) for i in range(6)]
    hurt = [flash(np.roll(f(phase=0.0, eyes='closed', pull=0.55, fin=0.2), -2, axis=0)), np.roll(f(phase=0.5, eyes='closed', pull=0.55, fin=0.2), -2, axis=0)]
    specs = [
        (0.15, 0.0, 0.5, 0.30, 1.0, 1.0, 0.0, 0.0), (0.0, 0.55, 0.3, 0.45, 1.0, 1.0, 0.35, 1.0), (0.0, 0.9, 0.2, 0.55, 0.92, 0.9, 0.7, 1.0),
        (0.0, 1.0, 0.2, 0.65, 0.8, 0.6, 1.0, 0.9), (0.0, 1.0, 0.2, 0.75, 0.66, 0.3, 1.1, 0.5),
    ]
    death = []
    for pull, droop, fin, pale, scale, alpha, ink, ink_alpha in specs:
        body = death_fade(f(phase=0.25, eyes='dead', pull=pull, droop=droop, fin=fin), pale, scale, alpha)
        out = blank(96, h)
        if ink > 0:
            paste(out, ink_cloud(96, h, ink, ink_alpha))
        sub = out[:, 16:16 + w]
        a = body[..., 3] > 0
        sub[a] = body[a]
        death.append(out)
    write_sheet('giant-squid', [('idle', idle, w, h), ('whip', whips, 96, 64), ('hurt', hurt, w, h), ('death', death, 96, h)], 'giantSquidFrames.json')


# --------------------------------------------------------------------------- tentacle

CW, CH, CY = 64, 160, 80  # the frame, and the row of the cell's centre (the cell runs y 48 to 112)
TENT = GIANT_ARM


def foam_ring(spread=1.0, alpha=1.0):
    """The water round the arm: a flat shadow, then a ring of foam with a lit top and a shaded lower edge."""
    layer = blank(CW, CH)
    cx, cy = 32, CY
    shadow = ell(CW, CH, cx, cy, 19 * spread, 13 * spread)
    layer[shadow] = (0x16, 0x4a, 0x7c, int(95 * alpha))
    rx, ry = 17 * spread, 12 * spread
    for i in range(180):
        ang = i / 180 * 2 * math.pi
        for r in (0.0, 1.0, 2.0):
            x = int(round(cx + math.cos(ang) * (rx - r)))
            y = int(round(cy + math.sin(ang) * (ry - r)))
            if (i // 3) % 5 == 4:  # gaps, so it reads as foam and not a hoop
                continue
            if not (r < 2 or math.sin(ang) > 0):
                continue
            lit = math.sin(ang) < 0.1
            col = FOAM if (lit and r < 1.5) or (r == 0.0) else FOAM_D
            put(layer, x, y, col, int(255 * alpha))
    return layer


def s_curve(base, tip, amplitude, phase, waves=1.0):
    pts = []
    for i in range(41):
        t = i / 40
        x = base[0] + (tip[0] - base[0]) * t + math.sin(t * math.pi * 2 * waves + phase) * amplitude * math.sin(t * math.pi) ** 0.7
        pts.append((x, base[1] + (tip[1] - base[1]) * t, t))
    return pts


def tentacle_frame(phase=0.0, extend=0.0, curl=1.0, droop=0.0, streaks=0.0, splat=False):
    """The arm alone, drawn pointing down then turned so it rises from the foam ring. extend reaches it out."""
    layer = blank(CW, CH)
    base = (32, CY)
    tip = (32, CY + 34 + 42 * extend - 8 * droop)
    amplitude = (1 - extend * 0.5) * (12 - 4 * droop)
    path = s_curve(base, tip, amplitude, phase * 2 * math.pi)
    img = Image.new('L', (CW, CH), 0)
    d = ImageDraw.Draw(img)
    radii = []
    for x, y, t in path:
        r = 8.4 + (2.8 - 8.4) * t ** 0.9
        radii.append(r)
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    ex, ey, _ = path[-1]
    angle = phase * 2 * math.pi
    flick = 0.55 + 0.6 * (0.5 + 0.5 * math.sin(angle + 1.3))
    lead = 3.0 * math.cos(angle + 0.4) * (1 - extend) * (1 - droop)
    curl_path = [(ex - math.sin(u * 2.1) * 7 * curl * flick * (1 - extend) + lead * u, ey + u * 7 * (1 - 0.6 * extend)) for u in [i / 10 for i in range(11)]]
    for k, (x, y) in enumerate(curl_path):
        r = 2.8 - 1.4 * k / 10
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    if splat:  # flung down hard: the tip spreads into a pad with a lobe each side
        tx, ty = curl_path[-1]
        for lx, ly, lr in ((tx, ty, 6.0), (tx - 6, ty - 3, 3.0), (tx + 6, ty - 3, 3.0)):
            d.ellipse([lx - lr, ly - lr, lx + lr, ly + lr], fill=255)
    mask = np.array(img) > 0
    body = render(mask, TENT)
    inner = erode(mask, 2)
    # banded skin: a darker ring across the arm every few pixels, bowed along it
    for k, (x, y, t) in enumerate(path):
        if 0.08 < t < 0.92 and k % 6 == 2:
            sx, sy = int(round(x)), int(round(y))
            rr = radii[k]
            for dx in range(-int(rr) + 2, int(rr) - 1):
                px, py = sx + dx, sy + (1 if abs(dx) > rr * 0.5 else 0)
                if 0 <= py < CH and 0 <= px < CW and inner[py, px]:
                    body[py, px] = (*TENT[1], 255)
    paste(layer, body)
    # two rows of suckers with a dark rim under each
    last, travelled = -99.0, 0.0
    for i in range(1, len(path)):
        x0, y0, _ = path[i - 1]
        x1, y1, t = path[i]
        step = math.hypot(x1 - x0, y1 - y0)
        travelled += step
        if t < 0.2 or travelled - last < 4.6:
            continue
        last = travelled
        nx, ny = -(y1 - y0) / max(step, 1e-6), (x1 - x0) / max(step, 1e-6)
        for side in (-1, 1):
            px = int(round(x1 + nx * side * radii[i] * 0.5))
            py = int(round(y1 + ny * side * radii[i] * 0.5))
            for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
                if 0 <= py + dy < CH and 0 <= px + dx < CW and inner[py + dy, px + dx]:
                    layer[py + dy, px + dx] = (*(SUCKER_D if (dx, dy) == (1, 1) else SUCKER), 255)
    if streaks > 0:
        count = 0
        for x, y, t in path:
            if t < 0.25 or t > 0.95:
                continue
            count += 1
            if count % 3:
                continue
            width = 8.0 + (2.6 - 8.0) * t
            for side in (-1, 1):
                px = int(round(x + side * (width + 2 + (count % 4))))
                for dy in range(0, int(4 + 8 * streaks)):
                    py = int(round(y)) - dy
                    if 0 <= px < CW and 0 <= py < CH and layer[py, px, 3] == 0 and dy % 2 == 0:
                        layer[py, px] = (*FOAM, int(255 * (1 - 0.6 * dy / (3 + 5 * streaks))))
    if splat:
        tx, ty = curl_path[-1]
        for k, (dx, dy) in enumerate([(-10, 4), (-8, 9), (9, 5), (11, 10), (-3, 12), (4, 13), (0, 8)]):
            px, py = int(round(tx + dx)), int(round(ty + dy))
            if 0 <= px < CW and 0 <= py < CH and layer[py, px, 3] == 0:
                layer[py, px] = (*(FOAM if k % 2 else FOAM_D), 255)
    return np.roll(np.flipud(layer), 1, axis=0)


def with_ghost(frame, ghost):
    out = ghost.copy()
    out[..., 3] = (out[..., 3] * 0.38).astype(np.uint8)
    paste(out, frame)
    return out


def build_tentacle():
    idle = [tentacle_frame(i / 4) for i in range(4)]
    strike = [
        tentacle_frame(0.2, extend=-0.3, curl=1.9),
        with_ghost(tentacle_frame(0.2, extend=0.55, curl=0.4, streaks=1.0), tentacle_frame(0.2, extend=-0.1, curl=1.2)),
        with_ghost(tentacle_frame(0.2, extend=0.94, curl=0.2, streaks=0.8), tentacle_frame(0.2, extend=0.45, curl=0.5)),
        tentacle_frame(0.2, extend=0.82, curl=0.9, splat=True),
        tentacle_frame(0.2, extend=0.4, curl=1.3),
    ]
    hurt = [flash(tentacle_frame(0.0, curl=1.6)), tentacle_frame(0.5, curl=1.6, droop=0.4)]
    death = [death_fade(tentacle_frame(0.25, droop=1.0), pale, sc, al) for pale, sc, al in ((0.3, 0.95, 1.0), (0.5, 0.75, 0.7), (0.65, 0.5, 0.35))]
    ring = [foam_ring(1.0), foam_ring(1.1, 1.0), foam_ring(1.35, 0.7), foam_ring(1.6, 0.35)]
    write_sheet('tentacle', [('idle', idle, CW, CH), ('bite', strike, CW, CH), ('hurt', hurt, CW, CH), ('death', death, CW, CH), ('ring', ring, CW, CH)], 'tentacleFrames.json')


# --------------------------------------------------------------------------- shark

SHARK = ((0x12, 0x1a, 0x2e), (0x32, 0x44, 0x6e), (0x56, 0x70, 0xa2), (0x84, 0xa2, 0xcc), (0xc8, 0xdc, 0xf0))
SHARK_FIN = ((0x12, 0x1a, 0x2e), (0x2a, 0x3a, 0x60), (0x44, 0x5c, 0x8c), (0x70, 0x8c, 0xb8), (0xb4, 0xca, 0xe4))
MOUTH = (0x86, 0x20, 0x28)
MOUTH_D = (0x4c, 0x10, 0x18)
TEETH = (0xf8, 0xf8, 0xee)
SPROFILE = [(12, 1.8), (16, 2.6), (20, 3.6), (24, 5.0), (28, 6.8), (32, 8.4), (36, 9.6), (40, 10.4), (44, 10.6), (48, 10.2), (52, 9.2), (56, 7.4), (59, 5.4), (61, 3.2), (62.5, 1.0)]


def shark_frame(sway=0.0, jaw=0.0, eyes='open'):
    """A shark from above, nose down: crescent tail, ribbed fins, a countershaded torpedo body and jaws."""
    w = h = 64
    layer = blank(w, h)
    cx = 32

    def bend(y):
        return sway * max(0.0, (36 - y) / 24.0) ** 1.4 * 4.0

    tail = sway * 5.0
    ys_p = [p[0] for p in SPROFILE]
    hs_p = [p[1] * 1.25 for p in SPROFILE]

    def half(y):
        return float(np.interp(y, ys_p, hs_p))

    def fin(pts, pal, ribs=()):
        m = poly(w, h, pts)
        f = render(m, pal)
        ins = interior(m)
        for a, b in ribs:
            line_px(f, a, b, pal[1], within=ins)
        paste(layer, f)

    # tail: a crescent, the upper lobe the longer
    fin([(cx - 3 + bend(18), 19), (cx - 10 + tail, 6), (cx - 9 + tail, 3), (cx - 3 + tail, 7), (cx + tail * 0.8, 10), (cx + 5 + tail, 7), (cx + 9 + tail, 6), (cx + 3 + bend(18), 19)],
        SHARK_FIN, [((cx - 2 + bend(18), 17), (cx - 8 + tail, 6)), ((cx + 2 + bend(18), 17), (cx + 7 + tail, 6))])
    for side in (-1, 1):  # pelvic fins
        fin([(cx + side * 6, 25), (cx + side * 12, 23), (cx + side * 10, 29), (cx + side * 6, 30)], SHARK_FIN)
    for side in (-1, 1):  # pectoral fins, long and swept back, with ribs fanning out
        fin([(cx + side * 9, 41), (cx + side * 15, 38), (cx + side * 22, 34), (cx + side * 24, 36), (cx + side * 19, 43), (cx + side * 13, 50), (cx + side * 9, 50)],
            SHARK_FIN, [((cx + side * 11, 44), (cx + side * (14 + t * 10), 45 - t * 11)) for t in (0.2, 0.5, 0.8)])

    # the body
    body = scanline(w, h, 12, 63, lambda y: half(y), cx)
    shifted = np.zeros_like(body)
    for y in range(h):
        dx = int(round(bend(y)))
        shifted[y] = np.roll(body[y], dx) if dx else body[y]
    body = shifted
    b = render(body, SHARK)
    ins = interior(body)
    for y in range(h):  # countershading: a dark back stripe down the middle, pale flanks
        xs = np.nonzero(body[y])[0]
        if len(xs) < 8:
            continue
        mid = (xs.min() + xs.max()) / 2.0
        hw = (xs.max() - xs.min()) / 2.0
        for x in xs:
            if not ins[y, x]:
                continue
            share = abs(x - mid) / hw
            if share < 0.2:
                b[y, x] = (*SHARK[1], 255)
            elif share > 0.72 and tuple(b[y, x, :3]) not in (SHARK[1], SHARK[4]):
                b[y, x] = (*SHARK[3], 255)
    paste(layer, b)

    # the dorsal fin seen from above: a pale blade on the spine with its shadow beside it
    for y in range(26, 40):
        x = int(round(cx + bend(y)))
        spread = int((y - 26) * 0.12)
        for dx in range(-spread, spread + 1):
            if body[y, x + dx]:
                put(layer, x + dx, y, SHARK[4] if dx < 0 else SHARK[3])
        put(layer, x + spread + 1, y, SHARK[0])
        for dx in (spread + 2, spread + 3):
            if body[y, x + dx]:
                put(layer, x + dx, y, SHARK[1])
    # gill slits: three slanted strokes each side behind the head
    for side in (-1, 1):
        for k in range(3):
            gy = 46 + k * 2
            gx = int(round(cx + bend(gy))) + side * 7
            for i in range(3):
                px, py = gx - side * (i // 2), gy - 1 + i // 2
                if body[py, px]:
                    put(layer, px, py, SHARK[0])
    for side in (-1, 1):  # nostrils
        put(layer, cx + side * 2, 58, SHARK[0])

    # the mouth: closed with a row of teeth, or open with red jaws and teeth top and bottom
    jaw_px = int(round(jaw * 6))
    my = 53
    if jaw_px > 0:
        for dy in range(0, jaw_px + 4):
            hh = int(round(7 - abs(dy - (jaw_px + 3) / 2.0) * 1.1))
            for dx in range(-hh, hh + 1):
                x, y = cx + dx + int(round(bend(my))), my + dy
                if 0 <= y < h and 0 <= x < w:
                    inner = abs(dx) < hh - 1 and 0 < dy < jaw_px + 3
                    put(layer, x, y, (MOUTH_D if dy > jaw_px // 2 else MOUTH) if inner else SHARK[0])
        for dx in range(-5, 6, 2):
            put(layer, cx + dx, my + 1, TEETH)
            put(layer, cx + dx, my + 2, TEETH)
            if my + jaw_px + 2 < h:
                put(layer, cx + dx, my + jaw_px + 2, TEETH)
                put(layer, cx + dx, my + jaw_px + 1, TEETH)
    else:
        for dx in range(-5, 6):
            put(layer, cx + dx + int(round(bend(my))), my + 2, SHARK[0])
        for dx in (-4, -2, 2, 4):
            put(layer, cx + dx, my + 3, TEETH)

    # eyes: a dark ball under a heavy brow, with a glint
    for ex in (cx - 8, cx + 8):
        ey = 51
        if eyes == 'open':
            layer[ey - 1:ey + 2, ex - 1:ex + 2] = (*SHARK[0], 255)
            put(layer, ex - (1 if ex < cx else -1), ey - 1, (255, 255, 255))
            for dx in (-1, 0, 1):
                put(layer, ex + dx, ey - 2, SHARK[1])
        elif eyes == 'closed':
            for dx in (-1, 0, 1):
                put(layer, ex + dx, ey, SHARK[0])
        else:
            for k in (-1, 0, 1):
                put(layer, ex + k, ey + k, SHARK[0])
                put(layer, ex + k, ey - k, SHARK[0])
    return layer


def build_shark():
    idle = [shark_frame(sway=math.sin(i / 4 * 2 * math.pi) * 0.9) for i in range(4)]
    bite = [shark_frame(sway=0.3, jaw=j) for j in (0.0, 0.6, 1.0)]
    hurt = [flash(shark_frame(sway=0.2, eyes='closed')), shark_frame(sway=-0.3, eyes='closed')]
    death = [death_fade(shark_frame(sway=sw, eyes='dead'), pale, sc, al, colour=(0xd8, 0xdc, 0xe4)) for sw, pale, sc, al in ((0.2, 0.35, 1.0, 1.0), (-0.4, 0.55, 0.9, 0.8), (0.0, 0.7, 0.72, 0.4))]
    write_sheet('shark', [('idle', idle, 64, 64), ('bite', bite, 64, 64), ('hurt', hurt, 64, 64), ('death', death, 64, 64)], 'sharkFrames.json')


BUILDERS = {'squid': build_squid, 'giant-squid': build_giant_squid, 'tentacle': build_tentacle, 'shark': build_shark}


def main():
    names = sys.argv[1:] or list(BUILDERS)
    for n in names:
        BUILDERS[n]()
        print('wrote', n)


if __name__ == '__main__':
    main()
