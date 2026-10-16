"""Draws the shark sheet. The sea monsters are now drawn together in sea_monsters.py
(one toolkit, the ship-sheet style); this script is kept so the old command still works.

Run from the repo root:  python tools/art/shark.py
Writes apps/client/public/assets/monsters/shark.png and apps/client/src/phaser/assets/sharkFrames.json.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from sea_monsters import BUILDERS  # noqa: E402

if __name__ == '__main__':
    BUILDERS['shark']()
