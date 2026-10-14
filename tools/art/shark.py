"""Draws the shark sprite sheet, pixel by pixel, one board cell (64 x 64) a frame.

It is the first monster that sails, so it fills a single cell and points down
(nose to the bottom) like the ships do.

Run from the repo root:  python tools/art/shark.py
Writes apps/client/public/assets/monsters/shark.png, its frame manifest in
apps/client/src/phaser/assets/sharkFrames.json, and a preview in .scratch/shark/.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from giant_squid import blank, fade, mask_of, paste, shrink, tint  # noqa: E402

S = 64  # one board cell

# A cool grey-blue ramp (the navy and slate of the ship sheet), with a pale belly.
OUTLINE = (0x14, 0x1a, 0x2a)
DEEP = (0x3a, 0x4a, 0x74)
SHADE = (0x4e, 0x62, 0x8e)
BASE = (0x6a, 0x81, 0xac)
FLANK = (0x8a, 0xa1, 0xc6)
LIGHT = (0xb0, 0xc5, 0xdf)
BRIGHT = (0xdb, 0xe6, 0xf2)
MOUTH = (0x82, 0x1e, 0x26)
MOUTH_DEEP = (0x4e, 0x10, 0x18)
TEETH = (0xf6, 0xf6, 0xee)
EYE = (0x0c, 0x0e, 0x14)
GLINT = (0xff, 0xff, 0xff)
GILL = (0x1c, 0x24, 0x38)

AXIS = 32


def noise(x, y, salt=0):
    """A small repeatable hash in [0, 1): the same pixels every run."""
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65536.0


def smooth_profile(points, steps=1):
    return points


def body_edges(sway):
    """Left and right edges of the torpedo body, tail at the top and nose at the bottom."""
    # (y, half width): a thick middle, a long tapering tail, a rounded snout.
    profile = [
        (12, 1.8), (16, 2.6), (20, 3.6), (24, 5.0), (28, 6.8), (32, 8.4), (36, 9.6),
        (40, 10.4), (44, 10.6), (48, 10.2), (52, 9.2), (56, 7.4), (59, 5.4), (61, 3.2), (62.5, 1.4),
    ]
    left, right = [], []
    for y, half in profile:
        bend = sway * max(0.0, (36 - y) / 24.0) ** 1.4 * 4.0
        half *= 1.25
        left.append((AXIS + bend - half, y))
        right.append((AXIS + bend + half, y))
    return left, list(reversed(right)), (lambda y: sway * max(0.0, (36 - y) / 24.0) ** 1.4 * 4.0)


def shade_body(mask, bend):
    """Countershading in clean bands: a dark back down the middle, mid flanks, a light lit edge."""
    h, w = mask.shape
    out = blank(w, h)
    dist = ndimage.distance_transform_edt(mask)
    for y, x in zip(*np.nonzero(mask)):
        d = dist[y, x]
        axis = AXIS + bend(y)
        row = np.nonzero(mask[y])[0]
        half = max(1.0, (row.max() - row.min() + 1) / 2.0)
        out_share = abs(x - axis) / half
        if d <= 1.0:
            col = OUTLINE
        elif out_share < 0.34:
            col = SHADE
        elif out_share < 0.62:
            col = BASE
        elif out_share < 0.82:
            col = BASE
            col = BASE
        else:
            col = FLANK
        # light from the top left: the lit edge is bright, the far edge falls back to shade
        if d < 2.6 and x < axis:
            col = LIGHT if d > 1.0 else col
        elif d < 2.6 and x > axis:
            col = SHADE
        out[y, x] = (*col, 255)
    return out


def shade_fin(mask, light_edge=True):
    """A fin: dark outline, mid body, a bright leading edge, and ray lines."""
    h, w = mask.shape
    out = blank(w, h)
    dist = ndimage.distance_transform_edt(mask)
    for y, x in zip(*np.nonzero(mask)):
        d = dist[y, x]
        if d <= 1.0:
            col = OUTLINE
        elif d < 2.2:
            col = LIGHT if light_edge else FLANK
        else:
            col = BASE
        out[y, x] = (*col, 255)
    return out


def poly_mask(points):
    return mask_of(S, S, lambda d: d.polygon(points, fill=255))


def soften_outline(layer):
    """Colour the outline from what it borders, as the ship and squid art do.

    The dark edge is drawn in one placeholder colour, then every such pixel is
    replaced by a darker version of the pixels beside it, so each part gets an
    edge of its own hue (steel blue on the body, red on the open mouth) and not a
    hard black line.
    """
    out = layer.copy()
    h, w = layer.shape[:2]
    key = np.array([*OUTLINE, 255], dtype=np.uint8)
    is_line = np.all(layer == key, axis=2)
    for y, x in zip(*np.nonzero(is_line)):
        darkest = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if (dy or dx) and 0 <= ny < h and 0 <= nx < w and layer[ny, nx, 3] > 0 and not is_line[ny, nx]:
                    colour = layer[ny, nx, :3].astype(int)
                    if darkest is None or colour.sum() < darkest.sum():
                        darkest = colour
        if darkest is None:
            out[y, x, :3] = DEEP
        else:
            out[y, x, :3] = np.clip(darkest * np.array([0.62, 0.68, 0.82]), 0, 255).astype(np.uint8)
    return out


def shark_frame(sway=0.0, jaw=0.0, eyes='open'):
    """One frame. sway swings the tail (-1 to 1); jaw opens the mouth (0 to 1)."""
    layer = blank(S, S)
    left, right, bend = body_edges(sway)
    tail = sway * 5.0

    # --- tail fin: a heterocercal crescent, the upper lobe the longer, drawn first (behind)
    tail_mask = poly_mask([
        (AXIS - 3 + bend(18), 19),
        (AXIS - 10 + tail, 6),
        (AXIS - 9 + tail, 3),
        (AXIS - 3 + tail, 7),
        (AXIS + tail * 0.8, 10),
        (AXIS + 5 + tail, 7),
        (AXIS + 9 + tail, 6),
        (AXIS + 3 + bend(18), 19),
    ])
    paste(layer, shade_fin(tail_mask))

    # --- pelvic and anal fins: small, behind the pectorals
    for side in (-1, 1):
        pelvic = poly_mask([
            (AXIS + side * 6, 25), (AXIS + side * 12, 23), (AXIS + side * 10, 29), (AXIS + side * 6, 30)])
        paste(layer, shade_fin(pelvic, light_edge=False))

    # --- pectoral fins: long, swept back, with ray lines
    for side in (-1, 1):
        pec = poly_mask([
            (AXIS + side * 9, 41), (AXIS + side * 15, 38), (AXIS + side * 22, 34), (AXIS + side * 24, 36),
            (AXIS + side * 19, 43), (AXIS + side * 13, 50), (AXIS + side * 9, 50),
        ])
        fin = shade_fin(pec)
        # rays fan out from the root
        for k in range(4):
            t = 0.2 + 0.2 * k
            x0, y0 = AXIS + side * 10, 44
            x1 = AXIS + side * (14 + t * 11)
            y1 = 46 - t * 16
            steps = 14
            for i in range(steps):
                px = int(round(x0 + (x1 - x0) * i / steps))
                py = int(round(y0 + (y1 - y0) * i / steps))
                if 0 <= px < S and 0 <= py < S and pec[py, px] and fin[py, px, 3] and tuple(fin[py, px, :3]) != OUTLINE:
                    fin[py, px] = (*SHADE, 255)
        paste(layer, fin)

    # --- the body
    def body(d):
        d.polygon(left + right, fill=255)

    body_mask = mask_of(S, S, body)
    paste(layer, shade_body(body_mask, bend))

    # --- the dorsal fin, seen from above: a pale blade on the spine, with its shadow on the body
    for y in range(26, 39):
        x = int(round(AXIS + bend(y)))
        spread = int((y - 26) * 0.22)
        for dx in range(-spread, spread + 1):
            if 0 <= x + dx < S and body_mask[y, x + dx]:
                layer[y, x + dx] = (*(BRIGHT if dx < 0 else LIGHT), 255)
        if body_mask[y, x + spread + 1]:
            layer[y, x + spread + 1] = (*OUTLINE, 255)
        for dx in range(spread + 2, spread + 4):
            if body_mask[y, x + dx]:
                layer[y, x + dx] = (*DEEP, 255)

    # --- gill slits: three short slanted lines each side behind the head
    for side in (-1, 1):
        for k in range(3):
            gy = 47 + k * 2
            gx = int(round(AXIS + bend(gy))) + side * 7
            for i in range(3):
                px, py = gx - side * (i // 2), gy - 1 + i // 2
                if 0 <= px < S and 0 <= py < S and body_mask[py, px]:
                    layer[py, px] = (*GILL, 255)

    # --- snout: nostrils
    for side in (-1, 1):
        nx, ny = AXIS + side * 2, 58
        if body_mask[ny, nx]:
            layer[ny, nx] = (*OUTLINE, 255)

    # --- the mouth
    jaw_px = int(round(jaw * 6))
    my = 53
    if jaw_px > 0:
        # the jaws part: a dark wedge, red inside, teeth along both edges
        for dy in range(0, jaw_px + 4):
            half = int(round(7 - abs(dy - (jaw_px + 3) / 2.0) * 1.1))
            for dx in range(-half, half + 1):
                x, y = AXIS + dx + int(round(bend(my))), my + dy
                if 0 <= y < S and 0 <= x < S:
                    inner = abs(dx) < half - 1 and 0 < dy < jaw_px + 3
                    layer[y, x] = (*(MOUTH_DEEP if dy > jaw_px // 2 else MOUTH), 255) if inner else (*OUTLINE, 255)
        for dx in range(-5, 6, 2):
            layer[my + 1, AXIS + dx] = (*TEETH, 255)
            if my + jaw_px + 2 < S:
                layer[my + jaw_px + 2, AXIS + dx] = (*TEETH, 255)
    else:
        for dx in range(-5, 6):
            layer[my + 2, AXIS + dx + int(round(bend(my)))] = (*OUTLINE, 255)
        for dx in (-4, -2, 2, 4):
            layer[my + 3, AXIS + dx] = (*TEETH, 255)

    # --- eyes
    for ex in (AXIS - 8, AXIS + 8):
        ey = 52
        if eyes == 'open':
            layer[ey - 1:ey + 2, ex - 1:ex + 2] = (*EYE, 255)
            layer[ey - 1, ex - (1 if ex < AXIS else -1)] = (*GLINT, 255)
            layer[ey - 2, ex - 1:ex + 2] = (*DEEP, 255)  # a heavy brow
        elif eyes == 'closed':
            for dx in (-1, 0, 1):
                layer[ey, ex + dx] = (*OUTLINE, 255)
        else:  # dead: a cross
            for k in (-1, 0, 1):
                layer[ey + k, ex + k] = (*OUTLINE, 255)
                layer[ey + k, ex - k] = (*OUTLINE, 255)
    return soften_outline(layer)


def death_frame(step):
    specs = [
        # sway, pale, scale, alpha
        (0.2, 0.35, 1.0, 1.0),
        (-0.4, 0.55, 0.9, 0.8),
        (0.0, 0.7, 0.72, 0.4),
    ]
    sway, pale, scale, alpha = specs[step]
    body = tint(shark_frame(sway=sway, jaw=0.0, eyes='dead'), (0xd8, 0xdc, 0xe4), pale)
    if scale < 1:
        body = tint(shrink(body, scale), (0x1c, 0x85, 0xd9), 0.25)
    return fade(body, alpha)


def main():
    idle = [shark_frame(sway=math.sin(i / 4 * 2 * math.pi) * 0.9) for i in range(4)]
    bite = [shark_frame(sway=0.3, jaw=j) for j in (0.0, 0.6, 1.0)]
    hurt = [tint(shark_frame(sway=0.2, eyes='closed'), (255, 255, 255), 0.6), shark_frame(sway=-0.3, eyes='closed')]
    death = [death_frame(i) for i in range(3)]

    G = 2
    rows = [('idle', idle), ('bite', bite), ('hurt', hurt), ('death', death)]
    sheet_w = max(len(frames) * (S + 2 * G) for _, frames in rows)
    sheet_h = len(rows) * (S + 2 * G)
    sheet = blank(sheet_w, sheet_h)
    manifest = {'sheet': {'width': sheet_w, 'height': sheet_h}, 'frames': {}}
    y = 0
    for name, frames in rows:
        for i, f in enumerate(frames):
            x = i * (S + 2 * G) + G
            sheet[y + G:y + G + S, x:x + S] = f
            manifest['frames'][f'{name}/{i}'] = {'x': x, 'y': y + G, 'w': S, 'h': S}
        y += S + 2 * G

    out_dir = os.path.join('apps', 'client', 'public', 'assets', 'monsters')
    os.makedirs(out_dir, exist_ok=True)
    Image.fromarray(sheet, 'RGBA').save(os.path.join(out_dir, 'shark.png'))
    with open(os.path.join('apps', 'client', 'src', 'phaser', 'assets', 'sharkFrames.json'), 'w', encoding='utf8') as out:
        json.dump(manifest, out, indent=1)
        out.write('\n')

    os.makedirs(os.path.join('.scratch', 'shark'), exist_ok=True)
    scale = 4
    prev = Image.new('RGBA', ((sheet_w + 8) * scale, (sheet_h + 8) * scale), (0x1c, 0x85, 0xd9, 255))
    big = Image.fromarray(sheet, 'RGBA').resize((sheet_w * scale, sheet_h * scale), Image.NEAREST)
    prev.alpha_composite(big, (4 * scale, 4 * scale))
    prev.save(os.path.join('.scratch', 'shark', 'preview.png'))


if __name__ == '__main__':
    main()
