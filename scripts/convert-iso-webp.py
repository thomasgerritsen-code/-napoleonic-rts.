#!/usr/bin/env python3
"""Convert the Graphics Lab iso prop sprites from PNG to lossy WebP with alpha.

Rewrites props.json to point at the .webp files and removes the PNGs.
Needs Pillow (pip install pillow), e.g. in the Blender venv:
  .bvenv/bin/python scripts/convert-iso-webp.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

PROPS = Path(__file__).resolve().parents[1] / "graphics-lab/assets/iso/props"


def main() -> int:
    manifest_path = PROPS / "props.json"
    manifest = json.loads(manifest_path.read_text())
    for kind, meta in manifest["props"].items():
        src = PROPS / meta["image"]
        if src.suffix != ".png":
            continue
        dst = src.with_suffix(".webp")
        Image.open(src).convert("RGBA").save(dst, "WEBP", quality=90, alpha_quality=100, method=6)
        meta["image"] = dst.name
        src.unlink()
        print(f"{kind}: {dst.name} ({dst.stat().st_size // 1024} KB)")
    manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
