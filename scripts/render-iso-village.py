#!/usr/bin/env python3
"""Render the game's village buildings for the iso view (src/systems/rendering/iso-view-v1.js).

The game's villages place cottages, farmhouses, barns, inns and chapels at any
angle along their roads, so each kind is rendered at 16 headings (22.5° apart)
with the props kit and camera of render-iso-props.py. The models follow the
game's footprints: the length/depth ratio of each kind and the extra wings its
2D roof plan shows (farmhouse and inn wing at the rear, the chapel's transept and
crossing tower). The front (door) is on the model's -y side.

Output: graphics-lab/assets/iso/village/<kind>.webp, one sheet of 16 frames at
half the sprite scale, and village.json with each frame's rectangle and pivot.

  bvenv/bin/python scripts/render-iso-village.py [--only cottage] [--samples 32]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("isoprops", HERE / "render-iso-props.py")
props = importlib.util.module_from_spec(spec)
spec.loader.exec_module(props)
M, house, windows, door, part, empty = props.M, props.house, props.windows, props.door, props.part, props.empty

HEADINGS = 16
SCALE = 0.5   # sheets are stored at half the sprite scale: the game draws buildings small


def wing(root, x, y, w, d, h, wall, roof, **kw):
    sub = empty("wing", root, loc=(x, y, 0))
    return house(sub, w, d, h, wall, roof, **kw)


def v_cottage(root):
    w, d, h = 6.5, 4.0, 3.3
    house(root, w, d, h, "#a59e90", "#a69058", roof_pat="thatch", roof_h=2.7, wall_pat="wall", chimneys=(-2.0,), overhang=0.6)
    windows(root, w, d, (1.9,), 2, frame="#d7cfbb", shutters="#3e5a6b")
    door(root, 0.9, -d / 2 - 0.08, 1.0, 1.9)


def v_farmhouse(root):
    w, d, h = 9.0, 4.8, 4.4
    house(root, w, d, h, "#e3d8bf", "#9e4b2f", roof_h=3.0, chimneys=(2.6,))
    for y in (-d / 2 - 0.03, d / 2 + 0.03):
        for x in (-w / 2 + 0.15, -1.5, 1.5, w / 2 - 0.15):
            part("box", (0.22, 0.08, h - 0.7), (x, y, 0.7 + (h - 0.7) / 2), M("#4b3424", "planks", 0.8), root, name="post")
        part("box", (w, 0.08, 0.22), (0, y, h - 0.1), M("#4b3424", "planks", 0.8), root, name="beam")
    windows(root, w, d, (1.8, 3.4), 3, frame="#d8cfb8", shutters="#5f3b2b")
    door(root, -3.0, -d / 2 - 0.08, 1.1, 2.0)
    # Rear wing (the game's plan: 0.43 w by 0.78 d, set 0.27 w left and behind).
    wing(root, -0.27 * w, 0.53 * d + 0.4, 0.43 * w, 0.78 * d, 3.4, "#d9cdb2", "#93462c", roof_h=2.2)


def v_barn(root):
    w, d, h = 10.0, 5.6, 4.4
    house(root, w, d, h, "#6f4b2d", "#a38c55", roof_pat="thatch", roof_h=3.4, wall_pat="planks", plinth="#7d776a")
    part("box", (3.2, 0.12, 3.2), (0, -d / 2 - 0.06, 2.3), M("#4f3420", "planks", 0.8), root, name="bigdoor")
    for a in (40, -40):
        part("box", (4.2, 0.14, 0.18), (0, -d / 2 - 0.12, 2.3), M("#3b2717", "planks"), root, rot=(0, a, 0), name="brace")


def v_inn(root):
    w, d, h = 11.0, 6.4, 6.2
    house(root, w, d, h, "#ece4cf", "#8f3f2b", roof_h=3.2, chimneys=(-3.6, 3.6))
    part("box", (w + 0.1, d + 0.1, 0.22), (0, 0, 3.5), M("#cfc6b0", "plain", 0.8), root, name="cornice")
    windows(root, w, d, (2.0, 4.6), 4, frame="#efe9da", shutters="#2f5b3d")
    door(root, 0, -d / 2 - 0.08, 1.5, 2.3, "#5b2f1d")
    # Hanging sign on a bracket beside the door.
    part("box", (0.08, 1.4, 0.08), (1.6, -d / 2 - 0.7, 3.3), M("#2b2420", "plain", 0.5, metal=0.6), root, name="bracket")
    part("box", (0.9, 0.06, 0.7), (1.6, -d / 2 - 1.25, 2.8), M("#b78a3a", "planks", 0.7), root, name="sign")
    wing(root, 0.2 * w, 0.51 * d + 0.4, 0.46 * w, 0.66 * d, 4.2, "#e3dac2", "#86392a", roof_h=2.4, chimneys=(1.0,))


def v_chapel(root):
    w, d, h = 12.0, 5.0, 5.6
    stone = "#b5ad9c"
    house(root, w, d, h, stone, "#5e646d", roof_pat="slate", roof_h=3.0, wall_pat="wall", plinth="#8c8577")
    # Transept across the middle (the game's plan: 0.34 w by 1.45 d).
    house(empty("transept", root), 0.34 * w, 1.45 * d, h, stone, "#5e646d", roof_pat="slate", roof_h=2.6, wall_pat="wall", plinth="#8c8577")
    # Tall lancet windows along the nave.
    for x in (-4.6, -3.0, 3.0, 4.6):
        for y, s in ((-d / 2, -1), (d / 2, 1)):
            part("box", (0.7, 0.07, 2.4), (x, y + s * 0.03, 2.9), M("#2c3540", "plain", 0.3), root, name="lancet")
    door(root, -w / 2 - 0.05, 0, 1.4, 2.6, "#4a2c1c")
    # Crossing tower with a slate spire.
    tw, th = 2.8, 10.5
    part("box", (tw, tw, th), (0, 0, th / 2), M(stone, "wall", 0.9, alt="#8c8578"), root, name="tower")
    part("box", (tw + 0.2, tw + 0.2, 0.3), (0, 0, th), M("#cfc6b0", "plain", 0.8), root, name="towercap")
    spire = part("cyl", (tw * 0.75, 5.0, 0.05), (0, 0, th + 2.5), M("#4f555e", "slate", 0.8), root, name="spire", segments=4)
    spire.rotation_euler[2] = math.radians(45)
    part("box", (0.08, 0.08, 1.2), (0, 0, th + 5.6), M("#c9a33c", "plain", 0.3, metal=0.9), root, name="cross")
    part("box", (0.6, 0.08, 0.08), (0, 0, th + 5.8), M("#c9a33c", "plain", 0.3, metal=0.9), root, name="cross")
    for y, s in ((-tw / 2, -1), (tw / 2, 1)):
        part("box", (0.9, 0.07, 1.4), (0, y + s * 0.03, th - 2.0), M("#20262d", "plain", 0.3), root, name="belfry")


# Second styles so a village is not one house repeated: a whitewashed cottage
# under red tiles, and a stone farmhouse under slate.
def v_cottage2(root):
    w, d, h = 6.5, 4.0, 3.3
    house(root, w, d, h, "#e8e0cc", "#a2482f", roof_pat="tiles", roof_h=2.5, chimneys=(2.0,), overhang=0.45)
    windows(root, w, d, (1.9,), 2, frame="#efe8d8", shutters="#47604a")
    door(root, -0.9, -d / 2 - 0.08, 1.0, 1.9, "#5a3a26")


def v_farmhouse2(root):
    w, d, h = 9.0, 4.8, 4.6
    house(root, w, d, h, "#b9ae98", "#5e646d", roof_pat="slate", roof_h=2.9, wall_pat="wall", chimneys=(-2.8, 2.8))
    windows(root, w, d, (1.8, 3.5), 3, frame="#ddd5c2", shutters="#6b4a32")
    door(root, 0.0, -d / 2 - 0.08, 1.2, 2.1)
    wing(root, -0.27 * w, 0.53 * d + 0.4, 0.43 * w, 0.78 * d, 3.5, "#ada28c", "#585e66",
         roof_pat="slate", roof_h=2.2, wall_pat="wall")


# Yard edges: a post-and-rail fence and a hawthorn hedge, 6 m long along x.
def v_fence(root):
    for x in (-3, -1.5, 0, 1.5, 3):
        part("box", (0.14, 0.14, 1.2), (x, 0, 0.6), M("#6a5038", "bark", 0.95), root, name="post")
    for z in (0.45, 0.95):
        part("box", (6.1, 0.07, 0.12), (0, 0, z), M("#7a5c40", "planks", 0.95), root, name="rail")


def v_hedge(root):
    for i, x in enumerate((-2.4, -0.8, 0.8, 2.4)):
        props.blob(root, 0.95, (x, 0, 0.75), "#466628" if i % 2 else "#4f6f2d", "#67843a", 0.22).scale = (1.15, 0.7, 0.9)


KINDS = {"cottage": (v_cottage, 6.5), "farmhouse": (v_farmhouse, 9.0), "barn": (v_barn, 10.0),
         "inn": (v_inn, 11.0), "chapel": (v_chapel, 12.0), "cottage2": (v_cottage2, 6.5),
         "farmhouse2": (v_farmhouse2, 9.0), "fence": (v_fence, 6.0), "hedge": (v_hedge, 6.0)}


def render_kind(kind: str, out: Path, samples: int) -> dict:
    build, length = KINDS[kind]
    frames, images = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(HEADINGS):
            key = f"{kind}_{i}"
            props.BUILDERS[key] = build
            props.YAW[key] = i * 360 / HEADINGS
            meta = props.render_prop(key, Path(tmp), samples)
            im = Image.open(Path(tmp) / meta["image"]).convert("RGBA")
            # Downscale with premultiplied alpha: no dark fringe at the edges.
            small = im.convert("RGBa").resize((max(1, round(im.width * SCALE)), max(1, round(im.height * SCALE))), Image.LANCZOS).convert("RGBA")
            images.append(small)
            frames.append({"w": small.width, "h": small.height,
                           "px": round(meta["pivot"]["x"] * SCALE, 1), "py": round(meta["pivot"]["y"] * SCALE, 1)})
            print(kind, i, small.size, flush=True)
    # One row per four headings.
    cols = 4
    rows = math.ceil(HEADINGS / cols)
    cw, ch = max(f["w"] for f in frames), max(f["h"] for f in frames)
    sheet = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0))
    for i, (f, im) in enumerate(zip(frames, images)):
        f["x"], f["y"] = (i % cols) * cw, (i // cols) * ch
        sheet.paste(im, (f["x"], f["y"]))
    name = f"{kind}.webp"
    sheet.save(out / name, "WEBP", quality=88, alpha_quality=100, method=6)
    return {"image": name, "lengthM": length, "frames": frames}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="graphics-lab/assets/iso/village")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--samples", type=int, default=32)
    args = ap.parse_args(argv)
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    path = out / "village.json"
    manifest = json.loads(path.read_text()) if path.exists() else {}
    manifest["pxPerM"] = round(props.SPRITE_PX_PER_M * SCALE, 4)
    manifest["headings"] = HEADINGS
    manifest["source"] = "scripts/render-iso-village.py (Blender, original procedural models)"
    manifest["front"] = "-y (door side); heading i = model yaw i*360/headings degrees, counter-clockwise seen from above"
    manifest.setdefault("kinds", {})
    for kind in args.only or KINDS:
        manifest["kinds"][kind] = render_kind(kind, out, args.samples)
        path.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
