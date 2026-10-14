"""Draws the tentacle: a small arm of the giant squid that rises out of the water.

It holds one 64 px board cell and rises up out of the water: the foam ring is at
the bottom and the tip curls toward the top. It has no front. A ring of foam where it breaks the surface marks the
cell it holds; the arm itself curves out past the front edge. When it strikes,
the arm straightens and reaches up, and the game turns the whole sprite so that
"up" is the way it strikes.

Every frame is 64 wide and 160 tall with the cell in the middle (y 48 to 112), as
the squid sprites are, so frames swap in place and the strike has room to reach.

Run from the repo root:  python tools/art/tentacle.py
Writes apps/client/public/assets/monsters/tentacle.png, its frame manifest in
apps/client/src/phaser/assets/tentacleFrames.json, and a preview in .scratch/squid/.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from giant_squid import (  # noqa: E402
    RING, blank, fade, paste, shade, shrink, soften_outline, tint,
)

CW, CH = 64, 160
CY = 80  # the cell's centre row; the cell runs from y 48 to y 112
FOAM = (0xe8, 0xf6, 0xff)
FOAM_SHADE = (0xb4, 0xd6, 0xee)


def foam_ring(layer, spread=1.0, alpha=1.0, cx=32, cy=CY):
    """The water round the arm: a shadow under it, then a broken ring of foam on top."""
    shadow = np.zeros((CH, CW), dtype=bool)
    img = Image.new('L', (CW, CH), 0)
    ImageDraw.Draw(img).ellipse([cx - 19 * spread, cy - 13 * spread, cx + 19 * spread, cy + 13 * spread], fill=255)
    shadow = np.array(img) > 0
    for y, x in zip(*np.nonzero(shadow)):
        if (x + y) % 2 == 0:  # a dithered shade, so it stays pixel art
            layer[y, x] = (0x16, 0x4a, 0x7c, int(120 * alpha))
    rx, ry = 17 * spread, 12 * spread
    for i in range(96):
        ang = i / 96 * 2 * math.pi
        for r in (0.0, 1.0, 2.0):
            x = int(round(cx + math.cos(ang) * (rx - r)))
            y = int(round(cy + math.sin(ang) * (ry - r)))
            # a ring with gaps, so it looks like spray and not a hoop; thicker on the near side
            if 0 <= x < CW and 0 <= y < CH and (i + int(r) * 2) % 11 not in (0, 5) and (r < 2 or math.sin(ang) > 0):
                col = FOAM if (x + y) % 3 else FOAM_SHADE
                layer[y, x] = (*col, int(255 * alpha))


def s_curve(base, tip, amplitude, phase, waves=1.0):
    """The path of the arm: from the water to its tip, swaying from side to side."""
    pts = []
    for i in range(0, 41):
        t = i / 40
        x = base[0] + (tip[0] - base[0]) * t + math.sin(t * math.pi * 2 * waves + phase) * amplitude * math.sin(t * math.pi) ** 0.7
        y = base[1] + (tip[1] - base[1]) * t
        pts.append((x, y, t))
    return pts


def arm_mask(path, r0, r1):
    img = Image.new('L', (CW, CH), 0)
    d = ImageDraw.Draw(img)
    for x, y, t in path:
        r = r0 + (r1 - r0) * t
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return np.array(img) > 0


def add_suckers(layer, mask, path, spacing=3.2):
    """Two rows of pale suckers down the arm, one along each edge."""
    last = -99.0
    travelled = 0.0
    for i in range(1, len(path)):
        x0, y0, _ = path[i - 1]
        x1, y1, t = path[i]
        step = math.hypot(x1 - x0, y1 - y0)
        travelled += step
        if t < 0.2 or travelled - last < spacing:
            continue
        last = travelled
        length = max(step, 1e-6)
        nx, ny = -(y1 - y0) / length, (x1 - x0) / length  # sideways
        width = 7.5 + (2.4 - 7.5) * t
        for side in (-1, 1):
            px = int(round(x1 + nx * side * width * 0.5))
            py = int(round(y1 + ny * side * width * 0.5))
            if 0 <= px < CW and 0 <= py < CH and mask[py, px]:
                layer[py, px] = (*RING, 255)


def ring_frame(spread=1.0, alpha=1.0):
    """The foam and the dark water under the arm, on its own so it can stay level."""
    layer = blank(CW, CH)
    foam_ring(layer, spread=spread, alpha=alpha)
    return layer


def add_streaks(layer, path, strength):
    """Motion streaks trailing the arm as it snaps out: short pale lines beside the shaft."""
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
            for dy in range(0, int(3 + 5 * strength)):
                py = int(round(y)) - dy  # trailing behind, toward the base (pre-flip: up the sheet)
                if 0 <= px < CW and 0 <= py < CH and layer[py, px, 3] == 0:
                    layer[py, px] = (*FOAM, int(200 * (1 - dy / (3 + 5 * strength))))


def tentacle_frame(phase=0.0, extend=0.0, curl=1.0, droop=0.0, streaks=0.0):
    """One frame of the arm alone. extend straightens it and reaches it up: 0 is at rest, 1 is
    fully out, and below 0 it is drawn back and coiled, ready to strike. streaks (0 to 1) adds motion lines."""
    layer = blank(CW, CH)

    base = (32, CY)
    tip = (32, CY + 34 + 42 * extend - 8 * droop)
    amplitude = (1 - extend * 0.5) * (12 - 4 * droop)
    path = s_curve(base, tip, amplitude, phase * 2 * math.pi, waves=1.0)
    arm = arm_mask(path, 8.0, 2.6)

    # the tip curls over at the end
    ex, ey, _ = path[-1]
    angle = phase * 2 * math.pi
    # The tip is not a fixed hook: it uncurls and curls again, and flicks a little to either side.
    flick = 0.55 + 0.6 * (0.5 + 0.5 * math.sin(angle + 1.3))
    lead = 3.0 * math.cos(angle + 0.4) * (1 - extend) * (1 - droop)
    curl_path = [
        (ex - math.sin(u * 2.1) * 7 * curl * flick * (1 - extend) + lead * u, ey + u * 7 * (1 - 0.6 * extend), 1.0)
        for u in [i / 10 for i in range(11)]
    ]
    mask = arm | arm_mask(curl_path, 2.6, 1.3)

    body = shade(mask)
    add_suckers(body, mask, path)
    paste(layer, body)
    if streaks > 0:
        add_streaks(layer, path, streaks)
    # Drawn pointing down, then turned over, so it rises up out of the foam ring (the cell's
    # centre row stays put). The strike frames reach up the same way.
    return np.roll(np.flipud(soften_outline(layer)), 1, axis=0)


def death_frame(step):
    specs = [
        # pale, scale, alpha (the ring spreads and fades in its own frames)
        (0.3, 0.95, 1.0),
        (0.5, 0.75, 0.7),
        (0.65, 0.5, 0.35),
    ]
    pale, scale, alpha = specs[step]
    body = tentacle_frame(0.25, droop=1.0)
    body = tint(body, (0xd8, 0xc0, 0xb4), pale)
    if scale < 1:
        body = tint(shrink(body, scale), (0x1c, 0x85, 0xd9), 0.2)
    return fade(body, alpha)


def main():
    idle = [tentacle_frame(i / 4) for i in range(4)]
    # The strike, in five beats: coil back, snap out, full reach, slam, and recoil.
    strike = [
        tentacle_frame(0.2, extend=-0.3, curl=1.9),
        tentacle_frame(0.2, extend=0.55, curl=0.4, streaks=1.0),
        tentacle_frame(0.2, extend=1.0, curl=0.2, streaks=0.7),
        tentacle_frame(0.2, extend=1.0, curl=1.0),
        tentacle_frame(0.2, extend=0.4, curl=1.3),
    ]
    hurt = [tint(tentacle_frame(0.0, curl=1.6), (255, 255, 255), 0.6), tentacle_frame(0.5, curl=1.6, droop=0.4)]
    death = [death_frame(i) for i in range(3)]
    # The ring: calm, then spreading and fading as the arm goes down.
    ring = [ring_frame(1.0), ring_frame(1.1, 1.0), ring_frame(1.35, 0.7), ring_frame(1.6, 0.35)]

    G = 2
    rows = [('idle', idle), ('bite', strike), ('hurt', hurt), ('death', death), ('ring', ring)]
    sheet_w = max(len(frames) * (CW + 2 * G) for _, frames in rows)
    sheet_h = len(rows) * (CH + 2 * G)
    sheet = blank(sheet_w, sheet_h)
    manifest = {'sheet': {'width': sheet_w, 'height': sheet_h}, 'frames': {}}
    y = 0
    for name, frames in rows:
        for i, f in enumerate(frames):
            x = i * (CW + 2 * G) + G
            sheet[y + G:y + G + CH, x:x + CW] = f
            manifest['frames'][f'{name}/{i}'] = {'x': x, 'y': y + G, 'w': CW, 'h': CH}
        y += CH + 2 * G

    out_dir = os.path.join('apps', 'client', 'public', 'assets', 'monsters')
    os.makedirs(out_dir, exist_ok=True)
    Image.fromarray(sheet, 'RGBA').save(os.path.join(out_dir, 'tentacle.png'))
    with open(os.path.join('apps', 'client', 'src', 'phaser', 'assets', 'tentacleFrames.json'), 'w', encoding='utf8') as out:
        json.dump(manifest, out, indent=1)
        out.write('\n')

    os.makedirs(os.path.join('.scratch', 'squid'), exist_ok=True)
    scale = 3
    prev = Image.new('RGBA', ((sheet_w + 8) * scale, (sheet_h + 8) * scale), (0x86, 0x9f, 0xc0, 255))
    big = Image.fromarray(sheet, 'RGBA').resize((sheet_w * scale, sheet_h * scale), Image.NEAREST)
    prev.alpha_composite(big, (4 * scale, 4 * scale))
    d = ImageDraw.Draw(prev)
    for r, (_, frames) in enumerate(rows):
        for i in range(len(frames)):
            x0 = (i * (CW + 2 * G) + G + 4) * scale
            y0 = (r * (CH + 2 * G) + G + 48 + 4) * scale
            d.rectangle([x0, y0, x0 + 64 * scale, y0 + 64 * scale], outline=(255, 255, 255, 200))
    prev.save(os.path.join('.scratch', 'squid', 'tentacle_preview.png'))


if __name__ == '__main__':
    main()
