#!/usr/bin/env python3
"""Render the battlefield's wildlife for the iso view: red deer and rabbits.

Same camera, sun and 30-degree view as the soldiers (render-iso-infantry.py).
- stag / hind: a red deer (the stag with antlers), slender legs with knees and
  hocks, a white rump patch and tail. States in 8 directions, 176x176 cells with
  the feet at (88,140) (room for the antlers and the long shadow):
    idle 2 (ears and head), graze 2 (head down to the grass), walk 6, run 6 (bounding).
- rabbit: a brown rabbit with long ears and a white scut, in 64x48 cells with
  the feet at (32,40):
    idle 2 (sitting up, ears turning), graze 2 (nose down), hop 4.

  python scripts/render-iso-wildlife.py --kind stag --out art/frames/iso-proof
"""
from __future__ import annotations

import argparse
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from iso_blender_common import (SPRITE_PX_PER_M, camera, empty, material, part,  # noqa: E402
                                setup_render, shadow_catcher)

_spec = importlib.util.spec_from_file_location("iso_infantry", HERE / "render-iso-infantry.py")
infantry = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(infantry)

DEER_STATES = [("idle", 2), ("graze", 2), ("walk", 6), ("run", 6)]
RABBIT_STATES = [("idle", 2), ("graze", 2), ("hop", 4)]
KINDS = {"stag": ("wds", DEER_STATES, (176, 176), (88, 140)), "hind": ("wdh", DEER_STATES, (176, 176), (88, 140)),
         "rabbit": ("wrb", RABBIT_STATES, (64, 48), (32, 40))}
rad = math.radians


# --- red deer --------------------------------------------------------------------
def build_deer(stag: bool) -> dict:
    coat = material("#8b5a33", 0.7, pattern="skin")
    belly = material("#c9a27a", 0.7, pattern="skin")
    dark = material("#2a1d14", 0.6, pattern="plain")
    white = material("#eee8dc", 0.8, pattern="skin")
    antler = material("#bfa88a", 0.6, pattern="plain")
    root = empty("root")
    body = empty("body", root, (0, 0, 0.95))
    part("ball", (0.22, 0.85, 2.0, 0.95), (0, 0, 0.05), coat, body, name="barrel", segments=22)
    part("ball", (0.2, 0.85, 1.0, 1.15), (0, 0.38, 0.06), coat, body, name="chest", segments=18)
    part("ball", (0.2, 0.9, 1.0, 1.05), (0, -0.36, 0.08), coat, body, name="rump", segments=18)
    part("ball", (0.17, 0.9, 1.7, 0.5), (0, 0, -0.1), belly, body, name="belly", segments=16)
    part("ball", (0.12, 1.1, 0.5, 1.0), (0, -0.52, 0.12), white, body, name="rumppatch", segments=12)
    tail = empty("tail", body, (0, -0.55, 0.2), (150, 0, 0))
    part("cyl", (0.035, 0.12, 0.02), (0, 0, 0.06), white, tail, name="tailmesh", segments=8)
    neck = empty("neck", body, (0, 0.4, 0.18), (-35, 0, 0))
    part("cyl", (0.1, 0.62, 0.07), (0, 0, 0.3), coat, neck, name="neckmesh", segments=14)
    head = empty("head", neck, (0, 0, 0.62), (-95, 0, 0))
    part("ball", (0.08, 1.0, 1.0, 1.1), (0, 0, 0.03), coat, head, name="skull", segments=14)
    part("ball", (0.06, 0.9, 0.9, 2.0), (0, -0.02, 0.17), coat, head, name="face", segments=12)
    part("ball", (0.028,), (0, -0.04, 0.3), dark, head, name="nose", segments=8)
    for x in (0.06, -0.06):
        part("cyl", (0.035, 0.13, 0.005), (x * 1.3, 0.05, -0.04), coat, head, rot=(-150, math.copysign(35, x), 0), name="ear", segments=8)
        part("ball", (0.014,), (x * 1.1, -0.05, 0.08), dark, head, name="eye", segments=6)
    if stag:
        for x in (1, -1):
            beam = empty("beam", head, (x * 0.05, 0.03, -0.06), (-150, x * 25, 0))
            part("cyl", (0.018, 0.5, 0.01), (0, 0, 0.25), antler, beam, name="antler", segments=6)
            for z, a in ((0.12, 50), (0.28, 40), (0.42, 35)):
                part("cyl", (0.012, 0.18, 0.006), (0, 0.06, z + 0.06), antler, beam, rot=(-a, 0, 0), name="tine", segments=6)
    legs = {}
    for key, (x, y) in {"FR": (0.1, 0.36), "FL": (-0.1, 0.36), "HR": (0.1, -0.36), "HL": (-0.1, -0.36)}.items():
        hip = empty("hip" + key, body, (x, y, -0.05))
        part("cyl", (0.055 if key[0] == "F" else 0.075, 0.42, 0.035), (0, 0, -0.21), coat, hip, name="upper", segments=10)
        knee = empty("knee" + key, hip, (0, 0, -0.42))
        part("cyl", (0.025, 0.48, 0.02), (0, 0, -0.24), coat, knee, name="lower", segments=8)
        part("cyl", (0.03, 0.06, 0.026), (0, 0.01, -0.5), dark, knee, name="hoof", segments=8)
        legs[key] = (hip, knee)
    return {"root": root, "body": body, "neck": neck, "head": head, "tail": tail, "legs": legs}


def leg(rig, key, upper, lower):
    hip, knee = rig["legs"][key]
    hip.rotation_euler = Euler((rad(upper), 0, 0))
    knee.rotation_euler = Euler((rad(lower), 0, 0))


def pose_deer(rig, state, frame, frames):
    t = frame / max(1, frames)
    body, neck, head = rig["body"], rig["neck"], rig["head"]
    body.location = (0, 0, 0.95)
    body.rotation_euler = Euler((0, 0, 0))
    neck.rotation_euler = Euler((rad(-35), 0, 0))
    head.rotation_euler = Euler((rad(-95), 0, 0))
    rig["tail"].rotation_euler = Euler((rad(150), 0, 0))
    for key in rig["legs"]:
        leg(rig, key, 0, 0)
    if state == "idle":
        neck.rotation_euler = Euler((rad((-35, -28)[frame]), 0, 0))
        head.rotation_euler = Euler((rad((-95, -100)[frame]), rad((0, 12)[frame]), 0))
        rig["tail"].rotation_euler = Euler((rad((150, 165)[frame]), 0, 0))
    elif state == "graze":
        # Head down to the grass, nibbling.
        neck.rotation_euler = Euler((rad((-118, -124)[frame]), 0, 0))
        head.rotation_euler = Euler((rad((-40, -30)[frame]), 0, 0))
        leg(rig, "FR", 8, -6)
        leg(rig, "FL", -4, 4)
    elif state == "walk":
        for key, ph in {"HL": 0.0, "FL": 0.25, "HR": 0.5, "FR": 0.75}.items():
            a = (t + ph) * math.tau
            fore = key[0] == "F"
            leg(rig, key, 20 * math.sin(a), (-30 if fore else 30) * max(0.0, math.cos(a)))
        neck.rotation_euler = Euler((rad(-35 - 4 * math.sin(t * math.tau * 2)), 0, 0))
        body.location = (0, 0, 0.95 - 0.015 * abs(math.sin(t * math.tau * 2)))
    elif state == "run":
        # Bounding: fore and hind legs together, the body pitching over each leap.
        reach = math.sin(t * math.tau)
        for key in rig["legs"]:
            fore = key[0] == "F"
            # The legs gather and stretch out of step with the leap (cos), so no two frames match.
            swing = (40 if fore else -40) * reach + (14 if fore else -14) * math.cos(t * math.tau)
            leg(rig, key, swing + (8 if key[1] == "R" else 0), (-70 if fore else 70) * max(0.0, -reach))
        body.rotation_euler = Euler((rad(-10 * reach), 0, 0))
        body.location = (0, 0, 0.95 + 0.22 * max(0.0, math.sin(t * math.tau + 0.6)))
        neck.rotation_euler = Euler((rad(-48), 0, 0))
        rig["tail"].rotation_euler = Euler((rad(110), 0, 0))


# --- rabbit --------------------------------------------------------------------------
def build_rabbit() -> dict:
    fur = material("#8a7258", 0.85, pattern="skin")
    pale = material("#d8cbb6", 0.85, pattern="skin")
    dark = material("#1d1712", 0.5, pattern="plain")
    root = empty("root")
    body = empty("body", root, (0, 0, 0.14))
    part("ball", (0.11, 0.85, 1.5, 0.9), (0, -0.02, 0.0), fur, body, name="barrel", segments=16)
    part("ball", (0.075, 1.0, 1.0, 0.8), (0, -0.18, -0.03), fur, body, name="haunch", segments=12)
    part("ball", (0.035,), (0, -0.21, 0.03), pale, body, name="scut", segments=8)
    head = empty("head", body, (0, 0.15, 0.08))
    part("ball", (0.06, 0.9, 1.25, 0.9), (0, 0.02, 0.0), fur, head, name="headmesh", segments=12)
    part("ball", (0.012,), (0, 0.09, -0.005), dark, head, name="nose", segments=6)
    ears = []
    for x in (0.025, -0.025):
        ear = empty("ear", head, (x, -0.01, 0.04), (-15, math.copysign(8, x), 0))
        part("ball", (0.022, 0.8, 0.45, 3.2), (0, 0, 0.06), fur, ear, name="earmesh", segments=8)
        ears.append(ear)
        part("ball", (0.009,), (x * 1.6, 0.04, 0.015), dark, head, name="eye", segments=6)
    legs = {}
    for key, (x, y, z, length) in {"FR": (0.035, 0.09, -0.07, 0.08), "FL": (-0.035, 0.09, -0.07, 0.08),
                                   "HR": (0.05, -0.13, -0.06, 0.1), "HL": (-0.05, -0.13, -0.06, 0.1)}.items():
        hip = empty("hip" + key, body, (x, y, z))
        part("cyl", (0.018, length, 0.014), (0, 0.0 if key[0] == "F" else 0.03, -length / 2), fur, hip, name="leg", segments=6)
        legs[key] = hip
    return {"root": root, "body": body, "head": head, "ears": ears, "legs": legs}


def pose_rabbit(rig, state, frame, frames):
    body, head = rig["body"], rig["head"]
    body.location = (0, 0, 0.14)
    body.rotation_euler = Euler((rad(-12), 0, 0))
    head.rotation_euler = Euler((0, 0, 0))
    for ear in rig["ears"]:
        ear.rotation_euler = Euler((rad(-15), 0, 0))
    for key, hip in rig["legs"].items():
        hip.rotation_euler = Euler((0, 0, 0))
    if state == "idle":
        # Sitting up, the ears turning to listen.
        body.rotation_euler = Euler((rad(-22), 0, 0))
        for i, ear in enumerate(rig["ears"]):
            ear.rotation_euler = Euler((rad((-15, -5)[frame]), 0, rad((0, 25 if i else -25)[frame])))
    elif state == "graze":
        body.rotation_euler = Euler((rad(5), 0, 0))
        head.rotation_euler = Euler((rad((28, 34)[frame]), 0, 0))
        for ear in rig["ears"]:
            ear.rotation_euler = Euler((rad(-40), 0, 0))
    elif state == "hop":
        # A hop: hind legs push, the body flies forward and lands on the fore legs.
        up = (0.0, 0.07, 0.09, 0.03)[frame]
        body.location = (0, 0, 0.14 + up)
        body.rotation_euler = Euler((rad((-20, 4, 10, -4)[frame]), 0, 0))
        for key, hip in rig["legs"].items():
            fore = key[0] == "F"
            hip.rotation_euler = Euler((rad(((10, 50, 40, -10) if fore else (-20, -70, -40, 20))[frame]), 0, 0))
        for ear in rig["ears"]:
            ear.rotation_euler = Euler((rad((-20, -40, -45, -25)[frame]), 0, 0))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=sorted(KINDS), required=True)
    ap.add_argument("--out", default="art/frames/iso-proof")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--supersample", type=int, default=2)
    ap.add_argument("--states", nargs="*", help="render only these states (review)")
    ap.add_argument("--dirs", nargs="*", help="render only these directions (review)")
    args = ap.parse_args(argv)
    prefix, states, (cw, ch), (px, py) = KINDS[args.kind]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render(args.samples)
    ss = args.supersample
    camera(cw * ss, ch * ss, SPRITE_PX_PER_M * ss, (px * ss, py * ss))
    r = 1.05 if args.kind != "rabbit" else 0.3
    shadow_catcher("ground", [(r * math.cos(a / 24 * math.tau), r * math.sin(a / 24 * math.tau)) for a in range(24)])
    deer = args.kind != "rabbit"
    rig = build_deer(args.kind == "stag") if deer else build_rabbit()
    out = Path(args.out).resolve() / "wildlife" / args.kind
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    for d, name in enumerate(infantry.DIRECTIONS):
        if args.dirs and name not in args.dirs:
            continue
        rig["root"].rotation_euler = Euler((0, 0, math.radians(-45 * d - 90)))
        bpy.data.objects["ground"].rotation_euler = Euler((0, 0, math.radians(-45 * d - 90)))
        for state, frames in states:
            if args.states and state not in args.states:
                continue
            for f in range(frames):
                (pose_deer if deer else pose_rabbit)(rig, state, f, frames)
                bpy.context.view_layer.update()
                bpy.context.scene.render.filepath = str(out / f"{prefix}_iso_{state}_{name}_{f + 1:02d}.png")
                bpy.ops.render.render(write_still=True)
                n += 1
    print(f"{args.kind}: {n} frames -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
