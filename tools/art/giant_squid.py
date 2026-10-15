"""Draws the giant squid sprite sheet (spike), pixel by pixel, on the game's grid.

The board cell is 64 px and ships are drawn 1:1, so the squid is 64 wide and
128 long (two cells), pointing down like the ships (arms toward the bow).

Run from the repo root:  python tools/art/giant_squid.py
Writes apps/client/public/assets/monsters/giant-squid.png (idle frames, then
whip frames) and a preview in .scratch/squid/.
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

W, H = 64, 128
WHIP_W, WHIP_H = 96, 64  # the whip overlay: the last 32 px of the squid's cell, then the target cell

# Palette: ramps taken from the Scallywag ship sheet (orange hull family and
# its navy outline) so the squid sits in the same colour world.
OUTLINE = (0x2e, 0x10, 0x1a)
SHADE2 = (0x55, 0x19, 0x22)
SHADE1 = (0x7d, 0x2a, 0x2c)
BASE = (0xa8, 0x40, 0x34)
LIGHT1 = (0xc8, 0x5c, 0x42)
LIGHT2 = (0xe4, 0x8a, 0x64)
SPOT = (0x7d, 0x2a, 0x2c)
EYE = (0xf2, 0xd8, 0x6a)
RING = (0xec, 0xd3, 0xac)  # sucker rings, the sand colour of the water sheet
WHITE = (0xff, 0xff, 0xff)
PUPIL = (0x26, 0x2b, 0x3d)


def blank(w, h):
    return np.zeros((h, w, 4), dtype=np.uint8)


def mask_of(w, h, painter):
    img = Image.new('L', (w, h), 0)
    painter(ImageDraw.Draw(img))
    return np.array(img) > 0


def shade(mask, light=(-0.55, -0.65), spots=None, bands=3):
    """Colour a mask: dark outline, then bands lit from the top left."""
    h, w = mask.shape
    out = blank(w, h)
    dist = ndimage.distance_transform_edt(mask)
    # the direction toward the light: a pixel whose lit side is open is bright
    shifted_lit = ndimage.shift(mask.astype(float), (light[1] * -3, light[0] * -3), order=0, cval=0) > 0
    shifted_dark = ndimage.shift(mask.astype(float), (light[1] * 3, light[0] * 3), order=0, cval=0) > 0
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        d = dist[y, x]
        if d <= 1.0:
            col = OUTLINE
        else:
            lit_edge = not shifted_lit[y, x]  # the lit side is outside the shape
            dark_edge = not shifted_dark[y, x]
            if d < 2.2:
                col = LIGHT1 if lit_edge else (SHADE2 if dark_edge else BASE)
            elif d < 3.6:
                col = LIGHT2 if lit_edge and d < 3 else (SHADE1 if dark_edge else BASE)
            else:
                col = BASE
                if dark_edge:
                    col = SHADE1
                elif lit_edge and (x + y) % 2 == 0:
                    col = LIGHT1
        out[y, x] = (*col, 255)
    if spots:
        for (sx, sy, r) in spots:
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    px, py = sx + dx, sy + dy
                    if dx * dx + dy * dy <= r * r and 0 <= px < w and 0 <= py < h and mask[py, px] and dist[py, px] > 2.2:
                        out[py, px] = (*SPOT, 255)
    return out


def soften_outline(layer):
    """Colour the outline from what it borders, as the ship art does, not a flat dark line.

    The edge is drawn in one placeholder colour (`OUTLINE`); each such pixel is
    then replaced by a darker version of the pixels beside it, so every part gets
    an edge of its own hue (deep red on the body, a darker sand on a sucker) and
    nothing is left looking black.
    """
    out = layer.copy()
    h, w = layer.shape[:2]
    key = np.array([*OUTLINE, 255], dtype=np.uint8)
    is_line = np.all(layer == key, axis=2)
    for y, x in zip(*np.nonzero(is_line)):
        total = np.zeros(3)
        count = 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if (dy or dx) and 0 <= ny < h and 0 <= nx < w and layer[ny, nx, 3] > 0 and not is_line[ny, nx]:
                    total += layer[ny, nx, :3]
                    count += 1
        if count == 0:
            out[y, x, :3] = SHADE2
        else:
            out[y, x, :3] = np.clip(total / count * np.array([0.6, 0.52, 0.54]), 0, 255).astype(np.uint8)
    return out


def paste(dst, src):
    a = src[..., 3] > 0
    dst[a] = src[a]


def bezier(p0, p1, p2, n=60):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        pts.append((x, y, t))
    return pts


def tentacle_mask(w, h, p0, p1, p2, r0, r1, club=0):
    def paint(d):
        for x, y, t in bezier(p0, p1, p2):
            r = r0 + (r1 - r0) * t
            if club and t > 0.82:
                r += club * math.sin((t - 0.82) / 0.18 * math.pi * 0.9)
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)

    return mask_of(w, h, paint)


def suckers(layer, mask, p0, p1, p2, every=5, start=0.25):
    """Rings of sucker pixels down the lit underside of a tentacle."""
    pts = bezier(p0, p1, p2, 40)
    for i, (x, y, t) in enumerate(pts):
        if t < start or i % max(1, every // 2) != 0:
            continue
        px, py = int(round(x)), int(round(y))
        if 0 <= px < layer.shape[1] and 0 <= py < layer.shape[0] and mask[py, px]:
            layer[py, px] = (*RING, 255)


def toward(p, origin, k):
    """Move point p toward origin: k=0 leaves it, k=1 puts it on the origin."""
    return (p[0] + (origin[0] - p[0]) * k, p[1] + (origin[1] - p[1]) * k)


def squid_frame(phase, eyes='open', pull=0.0, droop=0.0, fin=1.0):
    """One frame of the body. phase in [0, 1) drives the sway.

    eyes: open, closed or dead. pull curls the arms in (a flinch). droop lets
    them hang limp and spread. fin scales the fins (clamped when hurt).
    """
    sway = math.sin(phase * 2 * math.pi) * (1 - droop)
    flap = math.sin(phase * 2 * math.pi + 1.2) * fin
    layer = blank(W, H)

    # --- the two long feeding tentacles, behind everything
    for side in (-1, 1):
        p0 = (32 + side * 6, 78)
        p1 = (32 + side * (20 + 5 * sway + 6 * droop), 104 - 8 * droop)
        p2 = (32 + side * (13 + 6 * sway * side * -1 + 14 * droop), 124 - 14 * droop)
        p1, p2 = toward(p1, p0, pull * 0.5), toward(p2, p0, pull * 0.7)
        m = tentacle_mask(W, H, p0, p1, p2, 2.6, 2.0, club=2.6)
        t = shade(m)
        suckers(t, m, p0, p1, p2, every=4, start=0.82)
        paste(layer, t)

    # --- the eight short arms, fanning from the head
    for i, ang in enumerate([-0.95, -0.68, -0.42, -0.17, 0.17, 0.42, 0.68, 0.95]):
        curl = math.sin(phase * 2 * math.pi + i * 0.9) * 3.5
        p0 = (32 + math.sin(ang) * 8, 78)
        p1 = (32 + math.sin(ang) * 24 + curl, 93)
        p2 = (32 + math.sin(ang) * (31 + 12 * droop) - curl * 0.6, 104 + abs(ang) * 4 - 8 * droop)
        p1, p2 = toward(p1, p0, pull * 0.4), toward(p2, p0, pull * 0.6)
        m = tentacle_mask(W, H, p0, p1, p2, 4.2, 1.6)
        t = shade(m)
        suckers(t, m, p0, p1, p2, every=4, start=0.3)
        paste(layer, t)

    # --- fins: two diamonds either side of the mantle, they flap a little
    fin_w = (15 + 2.5 * flap) * (0.55 + 0.45 * fin)
    for side in (-1, 1):
        def fin(d, side=side):
            d.polygon(
                [
                    (32 + side * 1, 5),
                    (32 + side * (6 + fin_w * 0.4), 11),
                    (32 + side * (9 + fin_w * 0.75), 21),
                    (32 + side * (9 + fin_w * 0.8), 31),
                    (32 + side * (9 + fin_w * 0.55), 41),
                    (32 + side * 8, 47),
                ],
                fill=255,
            )

        m = mask_of(W, H, fin)
        paste(layer, shade(m, spots=[(32 + side * 16, 28, 1), (32 + side * 14, 36, 1)]))

    # --- the mantle: a long cone, widest past the middle
    def mantle(d):
        d.polygon([(32, 2), (24, 20), (20, 44), (24, 66), (40, 66), (44, 44), (40, 20)], fill=255)
        d.ellipse([20, 48, 44, 74], fill=255)

    m = mask_of(W, H, mantle)
    spots = [(28, 20, 1), (36, 24, 1), (30, 32, 1), (37, 38, 1), (27, 44, 1), (34, 50, 1), (39, 56, 1), (29, 58, 1)]
    paste(layer, shade(m, spots=spots))

    # a ridge down the mantle's back
    for y in range(8, 60):
        if m[y, 32]:
            layer[y, 32] = (*LIGHT2, 255) if y % 3 else (*LIGHT1, 255)

    # --- the head, narrower than the mantle, with the eyes
    def head(d):
        d.ellipse([19, 62, 45, 86], fill=255)

    hm = mask_of(W, H, head)
    paste(layer, shade(hm))
    for ex in (21, 43):
        eye = mask_of(W, H, lambda d, ex=ex: d.ellipse([ex - 4, 69, ex + 4, 78], fill=255))
        e = blank(W, H)
        ys, xs = np.nonzero(eye)
        dist = ndimage.distance_transform_edt(eye)
        fill = {'open': EYE, 'closed': BASE, 'dead': (0xc8, 0xc0, 0xb0)}[eyes]
        for y, x in zip(ys, xs):
            col = fill if (y > 70 or eyes != 'open') else SHADE2
            if dist[y, x] <= 1.0:
                col = OUTLINE
            e[y, x] = (*col, 255)
        if eyes == 'open':
            for dy in range(-2, 3):
                e[74 + dy, ex + (1 if ex < 32 else -1)] = (*PUPIL, 255)
        elif eyes == 'closed':
            for dx in range(-3, 4):
                e[74, ex + dx] = (*OUTLINE, 255)
        else:  # a cross
            for k in range(-2, 3):
                e[74 + k, ex + k] = (*PUPIL, 255)
                e[74 + k, ex - k] = (*PUPIL, 255)
        paste(layer, e)
    return soften_outline(layer)


def whip_frame(step):
    """A tentacle lashing out from the squid's arms into the next cell.

    The frame's left edge is the squid's centre line and its right edge of the
    squid is at x=32, so the root sits on the arm base and the whip reads as
    part of the animal; the target cell is x 32..96.
    """
    layer = blank(WHIP_W, WHIP_H)
    reach = [0.0, 0.45, 0.9, 1.0, 0.7, 0.25][step]
    if reach <= 0:
        return layer
    bow = [0, 5, 9, 7, 4, 1][step]
    p0 = (14, 18)
    p2 = (14 + 78 * reach, 18 + 22 * reach)
    p1 = ((p0[0] + p2[0]) / 2 + 4, 6 - bow)
    m = tentacle_mask(WHIP_W, WHIP_H, p0, p1, p2, 3.6, 2.2, club=2.8 if reach > 0.8 else 1.0)
    t = shade(m)
    suckers(t, m, p0, p1, p2, every=3, start=0.45)
    paste(layer, t)
    return soften_outline(layer)


def tint(layer, colour, amount):
    out = layer.copy()
    a = out[..., 3] > 0
    for c in range(3):
        out[..., c][a] = (out[..., c][a] * (1 - amount) + colour[c] * amount).astype(np.uint8)
    return out


def fade(layer, alpha):
    out = layer.copy()
    out[..., 3] = (out[..., 3] * alpha).astype(np.uint8)
    return out


def shrink(layer, factor):
    """Scale the sprite about its centre, nearest neighbour so it stays pixel art."""
    h, w = layer.shape[:2]
    img = Image.fromarray(layer, 'RGBA')
    nw, nh = max(1, round(w * factor)), max(1, round(h * factor))
    small = img.resize((nw, nh), Image.NEAREST)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(small, ((w - nw) // 2, (h - nh) // 2))
    return np.array(out)


INK = (0x26, 0x2b, 0x3d)
INK_LIGHT = (0x3c, 0x44, 0x62)


def ink_cloud(w, h, size, alpha=1.0):
    """A dark cloud of blobs round the body centre, growing with size (0 to 1)."""
    layer = blank(w, h)
    blobs = [(-14, 8, 11), (16, 2, 12), (-4, -24, 12), (6, 30, 11), (-22, -14, 9), (24, 22, 9), (0, 4, 14), (-12, 36, 8), (14, -30, 8)]
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    cx, cy = w / 2, h * 0.55
    for bx, by, r in blobs:
        rr = r * size
        if rr < 1:
            continue
        d.ellipse([cx + bx * size - rr, cy + by * size - rr, cx + bx * size + rr, cy + by * size + rr], fill=255)
    mask = np.array(img) > 0
    dist = ndimage.distance_transform_edt(mask)
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        col = INK if dist[y, x] > 2 else INK_LIGHT
        layer[y, x] = (*col, 255)
    return fade(layer, alpha)


def flinch(phase, flash=False):
    """Hurt: eyes shut, arms pulled in, fins clamped. flash whitens the whole body."""
    frame = squid_frame(phase, eyes='closed', pull=0.55, fin=0.2)
    frame = np.roll(frame, -2, axis=0)  # jerks back, up the sheet
    return tint(frame, (255, 255, 255), 0.6) if flash else frame


def death_frame(step, wide=96):
    """Five frames: the squid goes limp and pale, sinks, and a cloud of ink spreads."""
    specs = [
        # eyes, pull, droop, fin, pale, scale, alpha, ink size, ink alpha
        ('dead', 0.15, 0.0, 0.5, 0.30, 1.0, 1.0, 0.0, 0.0),
        ('dead', 0.0, 0.55, 0.3, 0.45, 1.0, 1.0, 0.35, 1.0),
        ('dead', 0.0, 0.9, 0.2, 0.55, 0.92, 0.9, 0.7, 1.0),
        ('dead', 0.0, 1.0, 0.2, 0.65, 0.8, 0.6, 1.0, 0.9),
        ('dead', 0.0, 1.0, 0.2, 0.75, 0.66, 0.3, 1.1, 0.5),
    ]
    eyes, pull, droop, fin, pale, scale, alpha, ink, ink_alpha = specs[step]
    body = squid_frame(0.25, eyes=eyes, pull=pull, droop=droop, fin=fin)
    body = tint(body, (0xd8, 0xc0, 0xb4), pale)
    if scale < 1:
        body = tint(shrink(body, scale), (0x1c, 0x85, 0xd9), 0.2)
    body = fade(body, alpha)
    out = blank(wide, H)
    if ink > 0:
        paste(out, ink_cloud(wide, H, ink, ink_alpha))
    off = (wide - W) // 2
    sub = out[:, off:off + W]
    a = body[..., 3] > 0
    sub[a] = body[a]
    return out


def main():
    idle = [squid_frame(i / 4) for i in range(4)]
    whips = [whip_frame(i) for i in range(6)]
    hurts = [flinch(0.0, flash=True), flinch(0.5)]
    deaths = [death_frame(i) for i in range(5)]

    # Every frame sits in the sheet with a transparent gutter round it, so a frame
    # drawn rotated or at a fractional pixel never shows its neighbour. The frame
    # rectangles are written to a manifest the game reads.
    G = 2
    rows = [
        ('idle', idle, W, H),
        ('whip', whips, WHIP_W, WHIP_H),
        ('hurt', hurts, W, H),
        ('death', deaths, 96, H),
    ]
    sheet_w = max(len(frames) * (fw + 2 * G) for _, frames, fw, _ in rows)
    sheet_h = sum(fh + 2 * G for _, _, _, fh in rows)
    sheet = blank(sheet_w, sheet_h)
    manifest = {'sheet': {'width': sheet_w, 'height': sheet_h}, 'frames': {}}
    y = 0
    for name, frames, fw, fh in rows:
        for i, f in enumerate(frames):
            x = i * (fw + 2 * G) + G
            sheet[y + G:y + G + fh, x:x + fw] = f
            manifest['frames'][f'{name}/{i}'] = {'x': x, 'y': y + G, 'w': fw, 'h': fh}
        y += fh + 2 * G

    out_dir = os.path.join('apps', 'client', 'public', 'assets', 'monsters')
    os.makedirs(out_dir, exist_ok=True)
    Image.fromarray(sheet, 'RGBA').save(os.path.join(out_dir, 'giant-squid.png'))
    with open(os.path.join('apps', 'client', 'src', 'phaser', 'assets', 'giantSquidFrames.json'), 'w', encoding='utf8') as out:
        json.dump(manifest, out, indent=1)
        out.write('\n')

    # Preview: the sprite over water at 1x and 3x, with the 64 px grid.
    os.makedirs(os.path.join('.scratch', 'squid'), exist_ok=True)
    water = (0x1c, 0x85, 0xd9, 255)
    scale = 3
    pw = (sheet.shape[1] + 16) * scale
    ph = (sheet.shape[0] + 16) * scale
    prev = Image.new('RGBA', (pw, ph), water)
    big = Image.fromarray(sheet, 'RGBA').resize((sheet.shape[1] * scale, sheet.shape[0] * scale), Image.NEAREST)
    prev.alpha_composite(big, (8 * scale, 8 * scale))
    d = ImageDraw.Draw(prev)
    for gx in range(0, pw, 64 * scale):
        d.line([(gx + 8 * scale, 0), (gx + 8 * scale, ph)], fill=(255, 255, 255, 60))
    for gy in range(0, ph, 64 * scale):
        d.line([(0, gy + 8 * scale), (pw, gy + 8 * scale)], fill=(255, 255, 255, 60))
    prev.save(os.path.join('.scratch', 'squid', 'preview.png'))


if __name__ == '__main__':
    main()
