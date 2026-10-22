#!/usr/bin/env python3
"""Write half-resolution copies of the Graphics Lab iso sprite atlases.

The lab draws sprites at about half their atlas size (20 px per metre on
screen against 41.3 px per metre in the atlas), so full-size atlases cost
4x the memory for no visible gain: all of them decoded take close to 1 GB,
too much for a phone. For every *_atlas.json this writes <image>_half.webp at
50% (resized with premultiplied alpha, so edges get no dark fringe) and adds
meta.half = {"image", "scale": 0.5}. The lab loads those unless ?hd=1.

  .bvenv/bin/python scripts/make-iso-halfres.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ATLASES = Path(__file__).resolve().parents[1] / "graphics-lab/assets/sprites/iso"


def main() -> int:
    for path in sorted(ATLASES.glob("*_atlas.json")):
        sheet = json.loads(path.read_text())
        meta = sheet["meta"]
        src = ATLASES / meta["image"]
        w, h = meta["size"]["w"], meta["size"]["h"]
        if w % 2 or h % 2:
            raise SystemExit(f"{path.name}: odd atlas size {w}x{h}")
        half = src.with_name(src.stem + "_half.webp")
        image = Image.open(src).convert("RGBA").convert("RGBa")
        image.resize((w // 2, h // 2), Image.LANCZOS).convert("RGBA").save(
            half, "WEBP", quality=90, alpha_quality=100, method=6)
        meta["half"] = {"image": half.name, "scale": 0.5}
        path.write_text(json.dumps(sheet, indent=1) + "\n", encoding="utf8")
        print(f"{path.name}: {half.name} {w // 2}x{h // 2}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
