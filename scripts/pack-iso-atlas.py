#!/usr/bin/env python3
"""Pack the isometric Blender infantry frames into two atlases per nation.

Each atlas has 8 rows (directions e, se, s, sw, w, nw, n, ne) of 176x128 px
cells plus a Pixi-compatible JSON:
- infantry: idle 2, march 6, aim 2, fire 3, reload 4 -> 2992x1024
- fallen:   three ways to fall (die, diefwd, dieside), 4 frames each -> 2112x1024
The renderer's muzzle.json (screen pixel of the muzzle on the firing frame,
per direction) is copied into the infantry JSON so the lab spawns smoke at
the barrel. Officer, drummer and ensign (render-iso-roles.py) get one atlas
each per nation: idle 2, march 6, command 2 in taller 176x160 cells (feet at
88,140) -> 1760x1280. Optional --preview writes review sheets on a grass tone.

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

CELL_W, CELL_H = 176, 128
PIVOT = {"x": 88, "y": 108}
ALPHA_FLOOR = 16  # render/denoise speckle below ~6% opacity is cleared
DIRECTIONS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"]
SHEETS = {
    "infantry": [("idle", 2), ("march", 6), ("aim", 2), ("fire", 3), ("reload", 4)],
    "fallen": [("die", 4), ("diefwd", 4), ("dieside", 4)],
}
# Folder -> sprite prefix; folders 2 and 3 hold the alternative soldier looks.
SIDES = {"france": "fr", "britain": "br", "france2": "fr2", "britain2": "br2", "france3": "fr3", "britain3": "br3"}


def frame_names(prefix: str, states) -> list[tuple[str, str, int, int]]:
    out = []
    for row, d in enumerate(DIRECTIONS):
        col = 0
        for state, n in states:
            for i in range(1, n + 1):
                out.append((f"{prefix}_iso_{state}_{d}_{i:02d}", state, row, col))
                col += 1
    return out


ROLES = {"officer": "o", "drummer": "d", "ensign": "e"}
ROLE_STATES = [("idle", 2), ("march", 6), ("command", 2)]
ROLE_CELL = (176, 160)
ROLE_PIVOT = {"x": 88, "y": 140}


def clean(rgba: bytes, name: str, cell=(CELL_W, CELL_H)) -> bytes:
    cw, ch = cell
    buf = bytearray(rgba)
    for i in range(3, len(buf), 4):
        if buf[i] < ALPHA_FLOOR:
            buf[i - 3:i + 1] = b"\0\0\0\0"
    if not any(buf[3::4]):
        raise PngError(f"{name}: empty frame")
    edge = [buf[(y * cw + x) * 4 + 3] for y in range(ch) for x in (0, cw - 1)]
    edge += [buf[(y * cw + x) * 4 + 3] for y in (0, ch - 1) for x in range(cw)]
    if max(edge):
        raise PngError(f"{name}: sprite touches the frame edge (clipped)")
    return bytes(buf)


def pack(frames_dir: Path, side: str, kind: str) -> tuple[bytes, dict, int]:
    if kind in ROLES:
        return pack_cells(frames_dir / "roles" / f"{side}_{kind}", SIDES[side] + ROLES[kind], kind,
                          ROLE_STATES, ROLE_CELL, ROLE_PIVOT)
    atlas, sheet, w = pack_cells(frames_dir / side, SIDES[side], kind, SHEETS[kind], (CELL_W, CELL_H), PIVOT)
    if kind == "infantry":
        muzzle = json.loads((frames_dir / side / "muzzle.json").read_text())
        if sorted(muzzle) != sorted(DIRECTIONS):
            raise PngError(f"{side}: muzzle.json must list all 8 directions")
        sheet["meta"]["muzzle"] = {"state": "fire", "frame": 1, "px": muzzle}
    return atlas, sheet, w


def pack_cells(folder: Path, prefix: str, kind: str, states, cell, pivot) -> tuple[bytes, dict, int]:
    cw, ch = cell
    cols = sum(n for _, n in states)
    w, h = cols * cw, len(DIRECTIONS) * ch
    atlas = bytearray(w * h * 4)
    frames, animations, digests = {}, {}, set()
    for name, state, row, col in frame_names(prefix, states):
        fw, fh, rgba = read_rgba(folder / (name + ".png"))
        if (fw, fh) != (cw, ch):
            raise PngError(f"{name}: {fw}x{fh}, expected {cw}x{ch}")
        rgba = clean(rgba, name, cell)
        digests.add(hashlib.sha256(rgba).hexdigest())
        for y in range(ch):
            dst = ((row * ch + y) * w + col * cw) * 4
            atlas[dst:dst + cw * 4] = rgba[y * cw * 4:(y + 1) * cw * 4]
        frames[name] = {"frame": {"x": col * cw, "y": row * ch, "w": cw, "h": ch},
                        "rotated": False, "trimmed": False,
                        "sourceSize": {"w": cw, "h": ch},
                        "spriteSourceSize": {"x": 0, "y": 0, "w": cw, "h": ch},
                        "anchor": {"x": pivot["x"] / cw, "y": pivot["y"] / ch}}
        d = name.split("_")[3]
        animations.setdefault(f"{state}_{d}", []).append(name)
    if len(digests) != len(frames):
        raise PngError(f"{prefix} {kind}: pixel-identical frames found")
    source = "render-iso-roles.py" if kind in ROLES else "render-iso-infantry.py"
    meta = {"image": f"{prefix}_iso_{kind}_atlas.png", "size": {"w": w, "h": h},
            "scale": "1", "cell": {"w": cw, "h": ch}, "directions": DIRECTIONS, "pivot": pivot,
            "source": f"scripts/{source} (Blender, original procedural model)"}
    return bytes(atlas), {"frames": frames, "animations": animations, "meta": meta}, w


def preview(atlas: bytes, w: int, folder: Path, prefix: str, kind: str) -> None:
    """One review sheet per direction (atlas row) on a grass tone."""
    bg = (118, 132, 86)
    ch = len(atlas) // 4 // w // len(DIRECTIONS)
    for row, d in enumerate(DIRECTIONS):
        out = bytearray()
        for y in range(ch):
            sy = row * ch + y
            for x in range(w):
                i = (sy * w + x) * 4
                a = atlas[i + 3] / 255
                out += bytes(round(atlas[i + k] * a + bg[k] * (1 - a)) for k in range(3)) + b"\xff"
        write_rgba(folder / f"{prefix}_iso_{kind}_review_{d}.png", w, ch, bytes(out))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default="art/frames/iso-proof")
    ap.add_argument("--out", default="graphics-lab/assets/sprites/iso")
    ap.add_argument("--preview", help="directory for review sheets")
    args = ap.parse_args(argv)
    try:
        jobs = [(side, kind) for side in SIDES for kind in SHEETS]
        jobs += [(side, role) for side in ("france", "britain") for role in ROLES]
        for side, kind in jobs:
            atlas, sheet, w = pack(Path(args.frames), side, kind)
            out = Path(args.out)
            out.mkdir(parents=True, exist_ok=True)
            image = out / sheet["meta"]["image"]
            write_rgba(image, w, len(atlas) // 4 // w, atlas)
            image.with_suffix(".json").write_text(json.dumps(sheet, indent=1) + "\n", encoding="utf8")
            if args.preview:
                Path(args.preview).mkdir(parents=True, exist_ok=True)
                preview(atlas, w, Path(args.preview), image.stem.split("_")[0], kind)
            print(f"{side} {kind}: {len(sheet['frames'])} frames -> {image}")
    except (OSError, PngError, ValueError) as error:
        print(f"pack-iso-atlas: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
