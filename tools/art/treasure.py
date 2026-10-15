"""Draws the treasure chest of a hunt: a banded wooden chest heaped with gold.

It is 16 by 14 art pixels, drawn at 3x on the board like the other pickups, and
has no black outline (the edge is a darker shade of what it borders).

Run from the repo root:  python tools/art/treasure.py
Writes apps/client/public/assets/scallywag/treasure.png.
"""
from PIL import Image

W, H = 16, 14
WOOD = (0x9a, 0x5b, 0x2c)
WOOD_LIGHT = (0xb8, 0x74, 0x3c)
WOOD_DARK = (0x6a, 0x3a, 0x1c)
IRON = (0x5c, 0x6a, 0x7a)
GOLD = (0xf6, 0xc9, 0x3a)
GOLD_LIGHT = (0xff, 0xea, 0x8a)
GOLD_DARK = (0xc2, 0x8a, 0x1a)

img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
px = img.load()


def fill(x0, y0, x1, y1, colour):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = colour + (255,)


# The heap of gold rising over the open lid.
fill(3, 1, 12, 5, GOLD)
fill(5, 0, 10, 1, GOLD)
fill(4, 2, 6, 3, GOLD_LIGHT)
fill(9, 2, 11, 2, GOLD_LIGHT)
px[7, 4] = GOLD_DARK + (255,)
px[10, 4] = GOLD_DARK + (255,)
fill(3, 5, 12, 5, GOLD_DARK)
# The chest: a lighter lid band, a body, iron straps and a lock.
fill(1, 6, 14, 8, WOOD_LIGHT)
fill(1, 9, 14, 12, WOOD)
fill(1, 12, 14, 13, WOOD_DARK)
fill(1, 8, 14, 8, WOOD_DARK)
fill(3, 6, 4, 13, IRON)
fill(11, 6, 12, 13, IRON)
fill(7, 8, 8, 10, GOLD)
px[7, 9] = GOLD_DARK + (255,)
# Round the corners.
for corner in ((1, 6), (14, 6), (1, 13), (14, 13)):
    px[corner] = (0, 0, 0, 0)

out = 'apps/client/public/assets/scallywag/treasure.png'
img.save(out)
print('wrote', out)
