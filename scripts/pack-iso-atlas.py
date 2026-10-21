#!/usr/bin/env python3
"""Pack the isometric Blender proof frames into one atlas per nation.

Layout: 8 rows (directions e, se, s, sw, w, nw, n, ne) x 8 columns
(idle 01-02, march 01-06), 128 px cells -> 1024x1024 RGBA PNG plus a
Pixi-compatible JSON. Optional --preview writes a 3x enlarged contact sheet on
a grass tone for human review.

  python3 scripts/pack-iso-atlas.py --frames art/frames/iso-proof \
    --out graphics-lab/assets/sprites/iso
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from infantry_atlas_png import PngError, read_rgba, write_rgba  # noqa: E402

CELL = 128
PIVOT = {"x": 64, "y": 108}
ALPHA_FLOOR = 16  # render/denoise speckle below ~6% opacity is cleared
DIRECTIONS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"]
STATES = [("idle", 2), ("march", 6)]
SIDES = {"france": "fr", "britain": "br"}


def frame_names(prefix: str) -> list[tuple[str, str, int, int]]:
    out = []
    for row, d in enumerate(DIRECTIONS):
        col = 0
        for state, n in STATES:
            for i in range(1, n + 1):
                out.append((f"{prefix}_iso_{state}_{d}_{i:02d}", state, row, col))
                col += 1
    return out


def pack(frames_dir: Path, side: str) -> tuple[bytes, dict, int]:
    prefix = SIDES[side]
    cols = sum(n for _, n in STATES)
    w, h = cols * CELL, len(DIRECTIONS) * CELL
    atlas = bytearray(w * h * 4)
    frames, animations, digests = {}, {}, set()
    for name, state, row, col in frame_names(prefix):
        fw, fh, rgba = read_rgba(frames_dir / side / (name + ".png"))
        if (fw, fh) != (CELL, CELL):
            raise PngError(f"{name}: {fw}x{fh}, expected {CELL}x{CELL}")
        rgba = bytearray(rgba)
        for i in range(3, len(rgba), 4):
            if rgba[i] < ALPHA_FLOOR:
                rgba[i - 3:i + 1] = b"\0\0\0\0"
        rgba = bytes(rgba)
        if not any(rgba[3::4]):
            raise PngError(f"{name}: empty frame")
        edge = [rgba[(y * CELL + x) * 4 + 3] for y in range(CELL) for x in (0, CELL - 1)]
        edge += [rgba[(y * CELL + x) * 4 + 3] for y in (0, CELL - 1) for x in range(CELL)]
        if max(edge):
            raise PngError(f"{name}: sprite touches the frame edge (clipped)")
        digests.add(hashlib.sha256(rgba).hexdigest())
        for y in range(CELL):
            dst = ((row * CELL + y) * w + col * CELL) * 4
            atlas[dst:dst + CELL * 4] = rgba[y * CELL * 4:(y + 1) * CELL * 4]
        frames[name] = {"frame": {"x": col * CELL, "y": row * CELL, "w": CELL, "h": CELL},
                        "rotated": False, "trimmed": False,
                        "sourceSize": {"w": CELL, "h": CELL},
                        "spriteSourceSize": {"x": 0, "y": 0, "w": CELL, "h": CELL},
                        "anchor": {"x": PIVOT["x"] / CELL, "y": PIVOT["y"] / CELL}}
        d = name.split("_")[3]
        animations.setdefault(f"{state}_{d}", []).append(name)
    if len(digests) != len(frames):
        raise PngError(f"{side}: pixel-identical frames found")
    sheet = {"frames": frames, "animations": animations,
             "meta": {"image": f"{prefix}_iso_infantry_atlas.png", "size": {"w": w, "h": h},
                      "scale": "1", "directions": DIRECTIONS, "pivot": PIVOT,
                      "source": "scripts/render-iso-infantry.py (Blender, original procedural model)"}}
    return bytes(atlas), sheet, w


def preview(atlas: bytes, w: int, folder: Path, prefix: str, scale: int = 2) -> None:
    """Writes one enlarged sheet per pair of direction rows (PNG size limit)."""
    bg = (118, 132, 86)
    for pair in range(len(DIRECTIONS) // 2):
        out = bytearray()
        for y in range(2 * CELL * scale):
            sy = pair * 2 * CELL + y // scale
            row = bytearray()
            for x in range(w):
                i = (sy * w + x) * 4
                a = atlas[i + 3] / 255
                row += (bytes(round(atlas[i + k] * a + bg[k] * (1 - a)) for k in range(3)) + b"\xff") * scale
            out += row
        names = "-".join(DIRECTIONS[pair * 2:pair * 2 + 2])
        write_rgba(folder / f"{prefix}_iso_review_{names}.png", w * scale, 2 * CELL * scale, bytes(out))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default="art/frames/iso-proof")
    ap.add_argument("--out", default="graphics-lab/assets/sprites/iso")
    ap.add_argument("--preview", help="directory for enlarged review sheets")
    args = ap.parse_args(argv)
    try:
        for side, prefix in SIDES.items():
            atlas, sheet, w = pack(Path(args.frames), side)
            out = Path(args.out)
            out.mkdir(parents=True, exist_ok=True)
            write_rgba(out / f"{prefix}_iso_infantry_atlas.png", w, len(atlas) // 4 // w, atlas)
            (out / f"{prefix}_iso_infantry_atlas.json").write_text(json.dumps(sheet, indent=1) + "\n", encoding="utf8")
            if args.preview:
                Path(args.preview).mkdir(parents=True, exist_ok=True)
                preview(atlas, w, Path(args.preview), prefix)
            print(f"{side}: {len(sheet['frames'])} frames -> {out}")
    except (OSError, PngError) as error:
        print(f"pack-iso-atlas: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
