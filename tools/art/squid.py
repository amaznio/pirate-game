"""Draws the squid: the one-cell cousin of the giant squid, and a monster that sails.

The body mass (mantle, fins and head) sits inside one 64 px board cell, so it is
plain which cell it holds. Its arms and two long tentacles reach past the front
of the cell, the way a galleon overhangs its cell; when it strikes, the long
tentacles shoot out into the cell ahead. Points down (arms to the bottom) like the
ships.

Every frame is 64 wide and 160 tall with the cell in the middle (y 48 to 112), so
a frame swapped in keeps its body on the same spot and the attack frames have
room to reach into the next cell.

Run from the repo root:  python tools/art/squid.py
Writes apps/client/public/assets/monsters/squid.png, its frame manifest in
apps/client/src/phaser/assets/squidFrames.json, and a preview in .scratch/squid/.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from giant_squid import (  # noqa: E402
    BASE, EYE, LIGHT2, LIGHT1, OUTLINE, PUPIL, SHADE2,
    blank, fade, mask_of, paste, shade, shrink, soften_outline, suckers, tentacle_mask, tint, toward,
)

CW, CH = 64, 160
CY = 80  # the cell's centre row; the cell runs from y 48 to y 112
K = 1.45  # how much wider than tall-and-thin the body is drawn, so it fills its cell


def X(x):
    """A body x position, spread out from the centre line."""
    return 32 + (x - 32) * K


EYE_CLOSED = BASE
EYE_DEAD = (0xc8, 0xc0, 0xb0)


def squid_frame(phase=0.0, eyes='open', pull=0.0, droop=0.0, fin=1.0, lunge=0.0):
    """One frame. lunge (0 to 1) shoots the long tentacles forward into the next cell."""
    sway = math.sin(phase * 2 * math.pi) * (1 - droop)
    flap = math.sin(phase * 2 * math.pi + 1.2) * fin
    layer = blank(CW, CH)

    # --- the two long tentacles, behind everything
    for side in (-1, 1):
        p0 = (32 + side * 5, CY + 20)
        reach = 12 + 36 * lunge  # how far past the head they go
        p1 = (32 + side * (10 + 3 * sway + 5 * droop - 6 * lunge), CY + 20 + reach * 0.55)
        p2 = (32 + side * (7 + 3 * sway * -side + 8 * droop - 5 * lunge), CY + 20 + reach + 6 - 8 * droop)
        p1, p2 = toward(p1, p0, pull * 0.5), toward(p2, p0, pull * 0.7)
        m = tentacle_mask(CW, CH, p0, p1, p2, 2.0, 1.5, club=2.4 + lunge * 0.8)
        t = shade(m)
        suckers(t, m, p0, p1, p2, every=4, start=0.82)
        paste(layer, t)

    # --- six short arms fanning from the head, reaching past the cell edge
    for i, ang in enumerate([-0.8, -0.48, -0.16, 0.16, 0.48, 0.8]):
        curl = math.sin(phase * 2 * math.pi + i * 0.9) * 2.0
        p0 = (32 + math.sin(ang) * 6, CY + 18)
        p1 = (32 + math.sin(ang) * 15 + curl, CY + 27)
        p2 = (32 + math.sin(ang) * (21 + 6 * droop) - curl * 0.6, CY + 36 + abs(ang) * 2 - 5 * droop)
        p1, p2 = toward(p1, p0, pull * 0.4), toward(p2, p0, pull * 0.6)
        m = tentacle_mask(CW, CH, p0, p1, p2, 3.2, 1.2)
        t = shade(m)
        suckers(t, m, p0, p1, p2, every=4, start=0.3)
        paste(layer, t)

    # --- fins: two lobes either side of the mantle, tucked in at the tip
    fin_w = (11 + 2.4 * flap) * (0.55 + 0.45 * fin)
    for side in (-1, 1):
        def fin_shape(d, side=side):
            d.polygon(
                [
                    (32 + side * 1, CY - 36),
                    (32 + side * (6 + fin_w * 0.4), CY - 30),
                    (32 + side * (9 + fin_w * 0.8), CY - 22),
                    (32 + side * (9 + fin_w * 0.8), CY - 13),
                    (32 + side * (8 + fin_w * 0.5), CY - 5),
                    (32 + side * 7, CY - 2),
                ],
                fill=255,
            )

        m = mask_of(CW, CH, fin_shape)
        paste(layer, shade(m, spots=[(32 + side * 15, CY - 17, 1)]))

    # --- the mantle: a short cone, widest past the middle
    def mantle(d):
        d.polygon([(32, CY - 38), (X(27), CY - 26), (X(24), CY - 8), (X(26), CY + 6), (X(38), CY + 6), (X(40), CY - 8), (X(37), CY - 26)], fill=255)
        d.ellipse([X(24), CY - 12, X(40), CY + 12], fill=255)

    m = mask_of(CW, CH, mantle)
    spots = [(int(X(29)), CY - 26, 1), (int(X(35)), CY - 22, 1), (int(X(30)), CY - 14, 1), (int(X(36)), CY - 9, 1), (int(X(28)), CY - 4, 1), (int(X(34)), CY - 1, 1)]
    paste(layer, shade(m, spots=spots))
    for y in range(CY - 34, CY + 2):  # a ridge down the back
        if m[y, 32]:
            layer[y, 32] = (*(LIGHT2 if y % 3 else LIGHT1), 255)

    # --- the head, with the eyes
    head = mask_of(CW, CH, lambda d: d.ellipse([X(21), CY + 1, X(43), CY + 25], fill=255))
    paste(layer, shade(head))
    for ex in (int(X(25)), int(X(39))):
        eye = mask_of(CW, CH, lambda d, ex=ex: d.ellipse([ex - 3, CY + 7, ex + 3, CY + 15], fill=255))
        e = blank(CW, CH)
        dist = ndimage.distance_transform_edt(eye)
        fill = {'open': EYE, 'closed': EYE_CLOSED, 'dead': EYE_DEAD}[eyes]
        for y, x in zip(*np.nonzero(eye)):
            col = fill if (y > CY + 8 or eyes != 'open') else SHADE2
            if dist[y, x] <= 1.0:
                col = OUTLINE
            e[y, x] = (*col, 255)
        if eyes == 'open':
            for dy in range(-2, 3):
                e[CY + 11 + dy, ex + (1 if ex < 32 else -1)] = (*PUPIL, 255)
        elif eyes == 'closed':
            for dx in range(-2, 3):
                e[CY + 11, ex + dx] = (*OUTLINE, 255)
        else:
            for k in range(-2, 3):
                e[CY + 11 + k, ex + k] = (*PUPIL, 255)
                e[CY + 11 + k, ex - k] = (*PUPIL, 255)
        paste(layer, e)
    return soften_outline(layer)


def death_frame(step):
    specs = [
        # eyes, pull, droop, fin, pale, scale, alpha
        ('dead', 0.15, 0.0, 0.5, 0.30, 1.0, 1.0),
        ('dead', 0.0, 0.6, 0.3, 0.50, 0.9, 0.7),
        ('dead', 0.0, 1.0, 0.2, 0.65, 0.72, 0.35),
    ]
    eyes, pull, droop, fin, pale, scale, alpha = specs[step]
    body = squid_frame(0.25, eyes=eyes, pull=pull, droop=droop, fin=fin)
    body = tint(body, (0xd8, 0xc0, 0xb4), pale)
    if scale < 1:
        body = tint(shrink(body, scale), (0x1c, 0x85, 0xd9), 0.2)
    return fade(body, alpha)


def main():
    idle = [squid_frame(i / 4) for i in range(4)]
    lash = [squid_frame(0.2, pull=0.3, lunge=0.0), squid_frame(0.2, lunge=0.65), squid_frame(0.2, lunge=1.0)]
    hurt = [tint(squid_frame(0.0, eyes='closed', pull=0.55, fin=0.2), (255, 255, 255), 0.6), squid_frame(0.5, eyes='closed', pull=0.55, fin=0.2)]
    death = [death_frame(i) for i in range(3)]

    G = 2
    rows = [('idle', idle), ('bite', lash), ('hurt', hurt), ('death', death)]
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
    Image.fromarray(sheet, 'RGBA').save(os.path.join(out_dir, 'squid.png'))
    with open(os.path.join('apps', 'client', 'src', 'phaser', 'assets', 'squidFrames.json'), 'w', encoding='utf8') as out:
        json.dump(manifest, out, indent=1)
        out.write('\n')

    # Preview: each frame over water with its cell outlined, so the body mass can be judged against it.
    os.makedirs(os.path.join('.scratch', 'squid'), exist_ok=True)
    scale = 3
    prev = Image.new('RGBA', ((sheet_w + 8) * scale, (sheet_h + 8) * scale), (0x86, 0x9f, 0xc0, 255))
    big = Image.fromarray(sheet, 'RGBA').resize((sheet_w * scale, sheet_h * scale), Image.NEAREST)
    prev.alpha_composite(big, (4 * scale, 4 * scale))
    d = ImageDraw.Draw(prev)
    ry = 0
    for _, frames in rows:
        for i in range(len(frames)):
            x0 = (i * (CW + 2 * G) + G + 4) * scale
            y0 = (ry * (CH + 2 * G) + G + 48 + 4) * scale
            d.rectangle([x0, y0, x0 + 64 * scale, y0 + 64 * scale], outline=(255, 255, 255, 200))
        ry += 1
    prev.save(os.path.join('.scratch', 'squid', 'small_preview.png'))


if __name__ == '__main__':
    main()
