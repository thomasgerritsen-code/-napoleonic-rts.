#!/usr/bin/env python3
"""Render the isometric Blender infantry (Graphics Lab iso proof, v323 model).

Builds an original, script-generated 1809 line fusilier from primitives (no
third-party model), poses it per frame and renders 8 directions x (2 idle +
6 march) frames with the shared iso camera and sun (iso_blender_common.py).
The same rig produces the French and the British soldier; only uniform
details and colours differ.

Requires Blender's Python module (``pip install bpy``, Blender 5.x):
  python scripts/render-iso-infantry.py --side france --out art/frames/iso-proof
Then pack with scripts/pack-iso-atlas.py.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from iso_blender_common import (SPRITE_PX_PER_M, camera, empty, material, part,  # noqa: E402
                                setup_render, shadow_catcher)

FRAME = 128              # output cell, px
PIVOT = (64, 108)        # feet on screen, px
DIRECTIONS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"]  # clockwise on screen
STATES = [("idle", 2), ("march", 6)]

PALETTES = {
    "france": {
        "coat": "#24315c", "lapel": "#ece8db", "collar": "#a62222", "cuff": "#a62222",
        "turnback": "#ece8db", "breeches": "#e0dbcb", "gaiter": "#1b1b1b", "strap": "#24315c",
        "shako": "#171717", "plate": "#c9a33c", "pompom": "#2f7d3a", "pack": "#86603c",
        "roll": "#4b5a73", "belt": "#f3f0e8", "button": "#d8b44a", "hair": "#4a3324",
    },
    "britain": {
        "coat": "#b3262b", "lapel": "#b3262b", "collar": "#e4d7a6", "cuff": "#e4d7a6",
        "turnback": "#f1ebdd", "breeches": "#8c9095", "gaiter": "#1b1b1b", "strap": "#b3262b",
        "shako": "#171717", "plate": "#c9a33c", "pompom": "#f1ebdd", "pack": "#272727",
        "roll": "#5b5f66", "belt": "#f3f0e8", "button": "#e9e6dc", "hair": "#6b4a2e",
    },
}
COMMON = {"skin": "#d6a27c", "wood": "#6a4322", "steel": "#a8aeb3", "shoe": "#121212",
          "box": "#161616", "canvas": "#d9d1b8", "canteen": "#6f8197"}


def build_soldier(side: str) -> dict:
    p = {**PALETTES[side], **COMMON}
    M = {k: material(v) for k, v in p.items()}
    M["skin"] = material(p["skin"], 0.6, pattern="skin")
    M["hair"] = material(p["hair"], 0.7, pattern="skin")
    M["steel"] = material(p["steel"], 0.32, 0.85, pattern="plain")
    M["plate"] = material(p["plate"], 0.3, 0.9, pattern="plain")
    M["button"] = material(p["button"], 0.35, 0.7 if side == "france" else 0.1, pattern="plain")
    M["wood"] = material(p["wood"], 0.55, pattern="bark", scale=2.5)
    M["shoe"] = material(p["shoe"], 0.35, pattern="plain")
    M["box"] = material(p["box"], 0.4, pattern="plain")
    british = side == "britain"

    root = empty("root")
    hips = empty("hips", root, (0, 0, 0.95))
    torso = empty("torso", hips)
    # Coat body with a slightly fuller chest, collar and short tails.
    part("box", (0.36, 0.23, 0.56), (0, 0, 0.29), M["coat"], torso, name="coat")
    part("box", (0.38, 0.24, 0.16), (0, 0.004, 0.46), M["coat"], torso, name="chest")
    if not british:
        part("box", (0.2, 0.02, 0.34), (0, 0.118, 0.36), M["lapel"], torso, name="lapel")
        for col in (-0.085, 0.085):
            for i in range(6):
                part("ball", (0.012,), (col, 0.131, 0.22 + i * 0.055), M["button"], torso, name="button", segments=8)
    else:
        for i in range(6):
            part("box", (0.15, 0.012, 0.02), (0, 0.124, 0.2 + i * 0.056), M["turnback"], torso, name="lace")
            part("ball", (0.012,), (0.08, 0.131, 0.2 + i * 0.056), M["button"], torso, name="button", segments=8)
            part("ball", (0.012,), (-0.08, 0.131, 0.2 + i * 0.056), M["button"], torso, name="button", segments=8)
    part("box", (0.32, 0.045, 0.3), (0, -0.115, -0.1), M["coat"], torso, name="tails")
    for x in (0.1, -0.1):
        part("box", (0.07, 0.05, 0.28), (x, -0.12, -0.1), M["turnback"], torso, name="turnback")
    part("box", (0.31, 0.21, 0.17), (0, 0.01, -0.02), M["breeches"], torso, name="waist")
    # Shoulder straps (British: with white worsted tufts).
    for x in (0.16, -0.16):
        part("box", (0.08, 0.13, 0.02), (x, 0, 0.575), M["strap"], torso, name="strap")
        if british:
            part("ball", (0.035, 1.3, 1, 0.6), (x * 1.18, 0, 0.57), M["turnback"], torso, name="tuft")
    # White crossbelts as an X on chest and back, with brass belt plate.
    for angle in (38, -38):
        part("box", (0.042, 0.272, 0.66), (0, 0, 0.3), M["belt"], torso, rot=(0, angle, 0), name="belt")
    part("box", (0.05, 0.012, 0.06), (0, 0.142, 0.3), M["plate"], torso, name="beltplate")
    part("box", (0.21, 0.085, 0.14), (0.1, -0.145, 0.0), M["box"], torso, name="cartridge")
    part("box", (0.16, 0.06, 0.18), (-0.19, 0.0, -0.03), M["canvas"], torso, name="haversack")
    part("cyl", (0.018, 0.34, 0.014), (-0.2, -0.07, -0.08), M["box"], torso, rot=(0, -8, 0), name="scabbard")
    if british:
        part("cyl", (0.065, 0.05), (0.2, 0.02, -0.01), M["canteen"], torso, rot=(0, 90, 0), name="canteen")
    part("box", (0.31, 0.13, 0.32), (0, -0.19, 0.38), M["pack"], torso, name="pack")
    for x in (0.1, -0.1):
        part("box", (0.03, 0.012, 0.3), (x, -0.26, 0.38), M["belt"], torso, name="packstrap")
    part("cyl", (0.058, 0.33), (0, -0.175, 0.58), M["roll"], torso, rot=(0, 90, 0), name="roll")
    part("cyl", (0.078, 0.075), (0, 0, 0.6), M["collar"], torso, name="collar")

    head = empty("head", torso, (0, 0, 0.72))
    part("ball", (0.104, 1, 1.02, 1.05), (0, 0.01, 0), M["skin"], head, name="face")
    part("ball", (0.106, 1, 0.95, 0.9), (0, -0.025, 0.02), M["hair"], head, name="hair")
    part("cyl", (0.022, 0.05, 0.004), (0, 0.115, -0.01), M["skin"], head, rot=(-90, 0, 0), name="nose", segments=8)
    for x in (0.1, -0.1):
        part("ball", (0.022,), (x, 0, 0), M["skin"], head, name="ear", segments=8)
    part("cyl", (0.097, 0.2, 0.112), (0, 0, 0.16), M["shako"], head, name="shako")
    part("cyl", (0.114, 0.02), (0, 0, 0.265), M["shako"], head, name="lid")
    part("box", (0.13, 0.06, 0.014), (0, 0.1, 0.075), M["shako"], head, rot=(-12, 0, 0), name="visor")
    part("box", (0.075, 0.012, 0.075), (0, 0.108, 0.16), M["plate"], head, rot=(0, 45, 0), name="plate")
    for x in (0.1, -0.1):
        part("box", (0.01, 0.03, 0.1), (x * 1.02, -0.005, 0.04), M["plate"], head, rot=(10, 0, 0), name="chinscale")
    if british:
        part("cyl", (0.022, 0.13, 0.03), (-0.05, 0.08, 0.33), M["pompom"], head, name="plume")
        part("box", (0.16, 0.01, 0.025), (0, 0.11, 0.24), M["turnback"], head, name="band")
    else:
        part("ball", (0.038,), (0, 0.06, 0.3), M["pompom"], head, name="pompom")
        part("box", (0.012, 0.012, 0.09), (0.06, 0.1, 0.12), M["belt"], head, rot=(0, 40, 0), name="cord")

    joints = {}
    for sign, key in ((1, "R"), (-1, "L")):
        sh = empty("shoulder" + key, torso, (0.215 * sign, 0, 0.52))
        part("cyl", (0.06, 0.3, 0.054), (0, 0, -0.15), M["coat"], sh, name="upperarm")
        el = empty("elbow" + key, sh, (0, 0, -0.3))
        part("cyl", (0.052, 0.25, 0.046), (0, 0, -0.125), M["coat"], el, name="forearm")
        part("cyl", (0.058, 0.075), (0, 0, -0.215), M["cuff"], el, name="cuff")
        part("ball", (0.042, 0.9, 0.75, 1.2), (0, 0.005, -0.29), M["skin"], el, name="hand")
        th = empty("thigh" + key, hips, (0.095 * sign, 0, 0))
        part("cyl", (0.08, 0.46, 0.066), (0, 0, -0.23), M["breeches"], th, name="thigh")
        kn = empty("knee" + key, th, (0, 0, -0.45))
        part("cyl", (0.068, 0.1), (0, 0, -0.03), M["gaiter"], kn, name="gaitertop")
        part("cyl", (0.064, 0.42, 0.055), (0, 0, -0.21), M["gaiter"], kn, name="shin")
        part("box", (0.1, 0.25, 0.07), (0, 0.05, -0.455), M["shoe"], kn, name="shoe")
        joints[key] = (sh, el, th, kn)

    # Shouldered musket on the left: butt in the left hand, barrel past the shoulder.
    musket = empty("musket", torso, (-0.25, 0.1, -0.05), (-22, -6, 0))
    part("box", (0.045, 0.1, 0.3), (0, 0, 0.15), M["wood"], musket, name="butt")
    part("cyl", (0.024, 0.95, 0.018), (0, 0.01, 0.75), M["wood"], musket, name="stock")
    part("cyl", (0.011, 1.05), (0, 0.032, 0.85), M["steel"], musket, name="barrel")
    part("box", (0.012, 0.03, 0.07), (0.022, 0.02, 0.42), M["steel"], musket, name="lock")
    for z in (0.62, 0.9, 1.15):
        part("cyl", (0.027, 0.022), (0, 0.015, z), M["steel"], musket, name="band")
    part("box", (0.008, 0.012, 0.8), (0, -0.03, 0.55), M["belt"], musket, rot=(4, 0, 0), name="sling")
    part("cyl", (0.009, 0.34, 0.002), (0, 0.04, 1.5), M["steel"], musket, name="bayonet")
    return {"root": root, "hips": hips, "torso": torso, "joints": joints}


def pose(rig: dict, state: str, frame: int, frames: int) -> None:
    sh_r, el_r, th_r, kn_r = rig["joints"]["R"]
    sh_l, el_l, th_l, kn_l = rig["joints"]["L"]
    rad = math.radians
    # Left arm holds the musket butt in every pose.
    sh_l.rotation_euler = Euler((rad(18), rad(-8), 0))
    el_l.rotation_euler = Euler((rad(42), 0, 0))
    if state == "idle":
        breath = math.cos(frame / frames * 2 * math.pi)
        rig["hips"].location.z = 0.95 + 0.006 * breath
        rig["torso"].rotation_euler = Euler((rad(1.5 * breath), 0, 0))
        for th, kn in ((th_r, kn_r), (th_l, kn_l)):
            th.rotation_euler = Euler((0, 0, 0))
            kn.rotation_euler = Euler((0, 0, 0))
        sh_r.rotation_euler = Euler((rad(4), rad(6), 0))
        el_r.rotation_euler = Euler((rad(10), 0, 0))
        return
    t = frame / frames * 2 * math.pi
    swing = math.sin(t)
    th_r.rotation_euler = Euler((rad(26 * swing), 0, 0))
    th_l.rotation_euler = Euler((rad(-26 * swing), 0, 0))
    # The trailing leg bends at the knee while it swings through.
    kn_r.rotation_euler = Euler((rad(-38 * max(0.0, -math.cos(t))), 0, 0))
    kn_l.rotation_euler = Euler((rad(-38 * max(0.0, math.cos(t))), 0, 0))
    rig["hips"].location.z = 0.95 - 0.025 * abs(swing)
    rig["torso"].rotation_euler = Euler((rad(4), 0, rad(3 * swing)))
    sh_r.rotation_euler = Euler((rad(-22 * swing), rad(6), 0))
    el_r.rotation_euler = Euler((rad(14 + 8 * max(0.0, -swing)), 0, 0))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--side", choices=sorted(PALETTES), required=True)
    ap.add_argument("--out", default="art/frames/iso-proof")
    ap.add_argument("--samples", type=int, default=64)
    args = ap.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render(args.samples)
    camera(FRAME, FRAME, SPRITE_PX_PER_M, PIVOT)
    # Small shadow catcher under the feet: its edge stays inside the frame.
    shadow_catcher("ground", [(0.2 + 0.85 * math.cos(a / 24 * math.tau), 0.05 + 0.85 * math.sin(a / 24 * math.tau)) for a in range(24)])
    rig = build_soldier(args.side)
    out = Path(args.out).resolve() / args.side
    out.mkdir(parents=True, exist_ok=True)
    prefix = "fr" if args.side == "france" else "br"
    for d, name in enumerate(DIRECTIONS):
        # Model faces +Y; screen direction d is clockwise from east.
        rig["root"].rotation_euler = Euler((0, 0, math.radians(-45 * d - 90)))
        for state, frames in STATES:
            for f in range(frames):
                pose(rig, state, f, frames)
                bpy.context.view_layer.update()
                bpy.context.scene.render.filepath = str(out / f"{prefix}_iso_{state}_{name}_{f + 1:02d}.png")
                bpy.ops.render.render(write_still=True)
    print(f"{args.side}: {len(DIRECTIONS) * sum(n for _, n in STATES)} frames -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
