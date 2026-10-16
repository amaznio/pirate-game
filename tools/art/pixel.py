"""A small toolkit for ship-style pixel art: flat banded tones, a clean outline and a rim light.

The Scallywag ships are drawn with a crisp one-pixel outline in a darker shade of
the part's own colour, flat fills, a light line on the top-left edge, a heavier
shadow on the bottom-right, plank seams and a few crack marks. `render` does the
outline and the rim bands for any mask; `plates`, `cracks` and `rivets` add the
surface detail. Light comes from the top left, as in the ship sheet.
"""
import math

import numpy as np
from PIL import Image, ImageDraw

H = 255


def blank(w, h):
    return np.zeros((h, w, 4), dtype=np.uint8)


def paste(dst, src):
    a = src[..., 3] > 0
    dst[a] = src[a]


def mask_of(w, h, painter):
    img = Image.new('L', (w, h), 0)
    painter(ImageDraw.Draw(img))
    return np.array(img) > 0


def ell(w, h, cx, cy, rx, ry):
    return mask_of(w, h, lambda d: d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255))


def poly(w, h, pts):
    return mask_of(w, h, lambda d: d.polygon([(float(x), float(y)) for x, y in pts], fill=255))


def stroke(w, h, pts, width):
    def paint(d):
        d.line([(float(x), float(y)) for x, y in pts], fill=255, width=width)
        r = width / 2.0
        for x, y in pts:
            d.ellipse([x - r + 0.5, y - r + 0.5, x + r - 0.5, y + r - 0.5], fill=255)
    return mask_of(w, h, paint)


def shift(m, dx, dy):
    """The mask moved by (dx, dy); what leaves the canvas is dropped."""
    h, w = m.shape
    out = np.zeros_like(m)
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = m[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def erode(m, n=1):
    for _ in range(n):
        m = m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1) & shift(m, 0, -1)
    return m


def render(mask, pal, outline=None, rim=True):
    """Fill a mask: outline, flat base, a light rim top-left and a two-pixel shadow bottom-right.

    pal is (outline, dark, base, light, bright). `outline` overrides the outline colour,
    as the gold-edged hull does on the ship sheet.
    """
    h, w = mask.shape
    o, d, b, l, br = pal
    if outline is not None:
        o = outline
    out = blank(w, h)
    if not mask.any():
        return out
    inner = erode(mask)
    inner2 = erode(inner)
    out[mask] = (*o, 255)
    out[inner] = (*b, 255)
    if rim:
        shadow = inner & ~shift(inner2, -1, -1)
        light = inner & ~shift(inner, 1, 1) & ~shadow
        out[shadow] = (*d, 255)
        out[light] = (*l, 255)
        ys, xs = np.nonzero(light)
        for y, x in zip(ys, xs):
            if (x * 3 + y * 5) % 13 == 0:
                out[y, x] = (*br, 255)
    return out


def interior(mask):
    """Where surface detail may go: clear of the outline and the rim bands."""
    return erode(mask, 2)


def plates(layer, region, pal, pw=8, ph=6, stagger=4, light=True):
    """Plank or plate seams: a dark line under each row, a light line over it, staggered joints."""
    ys, xs = np.nonzero(region)
    for y, x in zip(ys, xs):
        row, ly = y // ph, y % ph
        lx = (x + row * stagger) % pw
        if ly == ph - 1 or lx == 0:
            layer[y, x] = (*pal[1], 255)
        elif light and ly == 0 and lx != 1:
            layer[y, x] = (*pal[3], 255)


def scales(layer, region, pal, sw=8, sh=5, stagger=True):
    """Overlapping fish scales: rows of rounded edges, each row half a scale along from the last.

    The dark line is the lower rim of a scale, deepest in its middle; above it sits a
    light pixel on the upper left, so each scale reads as a small raised dome.
    """
    prof = [1 + int(round((sh - 2) * math.sin(math.pi * (i + 0.5) / sw))) for i in range(sw)]
    ys, xs = np.nonzero(region)
    for y, x in zip(ys, xs):
        row, ly = y // sh, y % sh
        xo = (x + (sw // 2 if stagger and row % 2 else 0)) % sw
        if ly == prof[xo]:
            layer[y, x] = (*pal[1], 255)
        elif ly == prof[xo] - 1 and xo < sw // 2:
            layer[y, x] = (*pal[3], 255)


def line_px(layer, p0, p1, col, within=None, alpha=255):
    steps = int(max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]))) + 1
    for i in range(steps + 1):
        t = i / max(1, steps)
        x, y = int(round(p0[0] + (p1[0] - p0[0]) * t)), int(round(p0[1] + (p1[1] - p0[1]) * t))
        if 0 <= y < layer.shape[0] and 0 <= x < layer.shape[1] and (within is None or within[y, x]):
            layer[y, x] = (*col, alpha)


def put(layer, x, y, col, alpha=255):
    x, y = int(x), int(y)
    if 0 <= y < layer.shape[0] and 0 <= x < layer.shape[1]:
        layer[y, x] = (*col, alpha)


def cracks(layer, region, starts, col):
    """Short zigzag crack marks like the ship planks have. starts are (x, y, direction) with direction +1 or -1."""
    for x, y, d in starts:
        for dx, dy in ((0, 0), (d, 0), (d, 1), (2 * d, 1), (2 * d, 2), (3 * d, 2)):
            px, py = x + dx, y + dy
            if 0 <= py < region.shape[0] and 0 <= px < region.shape[1] and region[py, px]:
                layer[py, px] = (*col, 255)


def rivets(layer, pts, pal):
    for x, y in pts:
        put(layer, x, y, pal[4])
        put(layer, x, y + 1, pal[1])


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
    h, w = layer.shape[:2]
    img = Image.fromarray(layer, 'RGBA')
    nw, nh = max(1, round(w * factor)), max(1, round(h * factor))
    small = img.resize((nw, nh), Image.NEAREST)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(small, ((w - nw) // 2, (h - nh) // 2))
    return np.array(out)
