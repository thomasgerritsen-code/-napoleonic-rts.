#!/usr/bin/env python3
"""Render a light cavalryman (horse and rider) for the Graphics Lab iso scene.

Same camera, sun and 30° view as the infantry (render-iso-infantry.py).
- horse: procedural body, neck, head, mane, tail and four two-jointed legs,
  saddle with a coloured shabraque, bridle and rolled cloak; coat colours bay
  (variant 1) and black / grey (variant 2);
- rider: the fusilier body as a chasseur à cheval (French green with red) or a
  light dragoon (British blue with buff), without pack or musket, with a sabre.
States in 8 directions, 224x192 cells with the hooves' centre at (112,152):
  cavalry:  idle 2, walk 6, gallop 6
  cavfight: slash 3, rear 2, die 4 (horse and rider go down together)

  python scripts/render-iso-cavalry.py --side france --out art/frames/iso-proof
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

CELL, PIVOT = (224, 192), (112, 152)
STATES = [("idle", 2), ("walk", 6), ("gallop", 6), ("slash", 3), ("rear", 2), ("die", 4)]
COATS = {1: ("#6b3f22", "#1c1410"), 2: ("#2a2420", "#121010")}   # (coat, mane/tail/lower legs)
GREY = ("#b9b4aa", "#5a5652")
UNIFORM = {
    # Chasseur à cheval: green with scarlet facings, green plume.
    "france": {"coat": "#1f4a2c", "lapel": "#1f4a2c", "collar": "#b3262b", "cuff": "#b3262b",
               "turnback": "#b3262b", "breeches": "#1f4a2c", "pompom": "#1f4a2c", "strap": "#1f4a2c",
               "cloth": "#1f4a2c", "lace": "#e9e2cc"},
    # Light dragoon: blue with buff facings, grey overalls.
    "britain": {"coat": "#24315c", "lapel": "#24315c", "collar": "#d8c38a", "cuff": "#d8c38a",
                "turnback": "#d8c38a", "breeches": "#8c9095", "pompom": "#f1ebdd", "strap": "#24315c",
                "cloth": "#24315c", "lace": "#d8c38a"},
}
RECOLOUR = {"coat": ("coat", "chest", "tails", "upperarm", "forearm"), "lapel": ("lapel",), "collar": ("collar",),
            "cuff": ("cuff",), "turnback": ("turnback",), "breeches": ("waist", "thigh"),
            "pompom": ("pompom", "plume"), "lace": ("lace",), "strap": ("strap",)}
STRIPPED = ("pack", "packstrap", "roll", "messtin", "cartridge", "canteen", "tuft", "haversack", "belt", "beltplate",
            "scabbard")
LEGS = {"FR": (0.16, 0.5), "FL": (-0.16, 0.5), "HR": (0.16, -0.55), "HL": (-0.16, -0.55)}
HIP_Z = 1.02


def hide_tree(obj, hidden=True) -> None:
    obj.hide_render = hidden
    for child in obj.children:
        hide_tree(child, hidden)


def build_horse(side: str, variant: int) -> dict:
    coat_hex, dark_hex = GREY if (side == "britain" and variant == 2) else COATS[variant]
    coat = material(coat_hex, 0.55, pattern="skin")
    dark = material(dark_hex, 0.6, pattern="skin")
    hoof = material("#1a1714", 0.5, pattern="plain")
    leather = material("#3a2414", 0.5, pattern="plain")
    colours = UNIFORM[side]
    cloth = material(colours["cloth"], 0.85, pattern="cloth")
    lace = material(colours["lace"], 0.7, pattern="plain")
    steel = material("#c7ccd0", 0.25, 0.9, pattern="plain")

    root = empty("root")
    fall = empty("fall", root)          # whole horse and rider topple through this
    body = empty("body", fall, (0, 0, HIP_Z))   # pitch (gallop/rear) about the hips
    part("ball", (0.36, 0.9, 2.05, 1.0), (0, 0.0, 0.2), coat, body, name="barrel", segments=24)
    part("ball", (0.33,), (0, 0.55, 0.18), coat, body, name="chestball", segments=20)
    part("ball", (0.34,), (0, -0.55, 0.22), coat, body, name="rump", segments=20)
    # Neck and head, with an empty so the head can toss.
    neck = empty("neck", body, (0, 0.72, 0.36), (-38, 0, 0))
    part("cyl", (0.19, 0.72, 0.12), (0, 0, 0.32), coat, neck, name="neckmesh", segments=18)
    part("box", (0.05, 0.12, 0.7), (0, -0.1, 0.34), dark, neck, rot=(4, 0, 0), name="mane")
    head = empty("head", neck, (0, 0.02, 0.68), (128, 0, 0))
    part("cyl", (0.11, 0.6, 0.075), (0, 0, 0.27), coat, head, name="headmesh", segments=16)
    for x in (0.06, -0.06):
        part("cyl", (0.03, 0.13, 0.0), (x, -0.07, -0.02), coat, head, rot=(-150, 0, 0), name="ear", segments=8)
        part("ball", (0.022,), (x * 1.5, 0.05, 0.12), material("#111111", 0.3, pattern="plain"), head, name="eye",
             segments=8)
    # Bridle: browband, noseband and reins hanging toward the rider's hands.
    part("box", (0.24, 0.02, 0.03), (0, 0.02, 0.06), leather, head, name="browband")
    part("box", (0.17, 0.17, 0.03), (0, 0, 0.43), leather, head, name="noseband")
    part("box", (0.012, 0.012, 0.7), (0, 0.18, 0.2), leather, neck, rot=(-25, 0, 0), name="reins")
    tail = empty("tail", body, (0, -0.86, 0.36), (165, 0, 0))
    part("cyl", (0.1, 0.8, 0.05), (0, 0, 0.4), dark, tail, name="tailmesh", segments=12)
    # Saddle on a shabraque with a lace border, holsters and a rolled cloak.
    part("box", (0.72, 1.0, 0.03), (0, -0.05, 0.56), lace, body, name="shabraque_lace")
    part("box", (0.68, 0.94, 0.035), (0, -0.05, 0.565), cloth, body, name="shabraque")
    # Shabraque falls over the flanks behind the rider's legs, pointed at the back.
    for x in (0.355, -0.355):
        part("box", (0.02, 0.55, 0.32), (x, -0.32, 0.42), cloth, body, rot=(0, 0, 0), name="shabraque_side")
        part("box", (0.022, 0.57, 0.035), (x, -0.32, 0.27), lace, body, name="shabraque_border")
    part("box", (0.36, 0.5, 0.1), (0, -0.02, 0.62), leather, body, name="saddle")
    part("cyl", (0.08, 0.5), (0, -0.45, 0.66), cloth, body, rot=(0, 90, 0), name="cloak")
    for x in (0.16, -0.16):
        part("cyl", (0.05, 0.22), (x, 0.38, 0.6), leather, body, rot=(-60, 0, 0), name="holster")
    legs = {}
    for key, (x, y) in LEGS.items():
        hip = empty("hip" + key, body, (x, y, 0.02 - HIP_Z + HIP_Z))
        part("cyl", (0.1, 0.5, 0.065), (0, 0, -0.25), coat, hip, name="upperleg", segments=12)
        knee = empty("knee" + key, hip, (0, 0, -0.5))
        part("cyl", (0.05, 0.4, 0.04), (0, 0, -0.2), dark if key[0] == "F" else coat, knee, name="cannon", segments=10)
        part("ball", (0.055,), (0, 0, -0.02), coat, knee, name="joint", segments=10)
        fetlock = empty("fetlock" + key, knee, (0, 0, -0.4))
        part("cyl", (0.045, 0.08, 0.04), (0, 0.01, -0.04), dark, fetlock, name="pastern", segments=10)
        part("cyl", (0.06, 0.07, 0.065), (0, 0.025, -0.085), hoof, fetlock, name="hoof", segments=12)
        legs[key] = (hip, knee, fetlock)
    saddle = empty("saddle", body, (0, -0.02, 0.67))
    return {"root": root, "fall": fall, "body": body, "neck": neck, "head": head, "tail": tail, "legs": legs,
            "saddle": saddle, "steel": steel, "leather": leather}


def build_rider(side: str, horse: dict) -> dict:
    rig = infantry.build_soldier(side, 1)
    hide_tree(rig["musket"])
    rig["armed"] = False
    for obj in bpy.data.objects:
        if obj.name.split(".")[0] in STRIPPED:
            obj.hide_render = True
    mats = {k: material(v, 0.8, pattern="cloth") for k, v in UNIFORM[side].items()}
    for obj in bpy.data.objects:
        base = obj.name.split(".")[0]
        for key, names in RECOLOUR.items():
            if base in names and obj.type == "MESH" and key in mats:
                obj.data.materials[0] = mats[key]
    # Riding boots up to the knee instead of gaiters.
    boot = material("#141414", 0.3, pattern="plain")
    for obj in bpy.data.objects:
        if obj.name.split(".")[0] in ("shin", "gaitertop") and obj.type == "MESH":
            obj.data.materials[0] = boot
    # Sit the rider's hips on the saddle.
    rig["root"].parent = horse["saddle"]
    rig["root"].location = (0, 0, -0.95)
    torso = rig["torso"]
    _, el_r, _, _ = rig["joints"]["R"]
    part("box", (0.04, 0.27, 0.66), (0, 0, 0.3), mats["lace"], torso, rot=(0, 38, 0), name="sabrebelt")
    part("cyl", (0.02, 0.85, 0.012), (-0.22, -0.1, -0.3), material("#2a2a2a", 0.4, 0.5, pattern="plain"), torso,
         rot=(70, 0, 0), name="sheath")
    sabre = empty("sabre", el_r, (0, 0.01, -0.29))
    part("cyl", (0.014, 0.85, 0.004), (0, 0.03, -0.44), horse["steel"], sabre, rot=(4, 0, 0), name="blade")
    part("box", (0.06, 0.03, 0.02), (0, 0, -0.03), material("#c9a33c", 0.3, 0.85, pattern="plain"), sabre,
         name="hilt")
    rig["sabre"] = sabre
    return rig


def leg(horse, key, upper, lower, fet=0.0):
    hip, knee, fetlock = horse["legs"][key]
    hip.rotation_euler = Euler((math.radians(upper), 0, 0))
    knee.rotation_euler = Euler((math.radians(lower), 0, 0))
    fetlock.rotation_euler = Euler((math.radians(fet), 0, 0))


def gait(horse, t, phases, swing, lift):
    """Each leg swings sinusoidally with its own phase; the joint folds while the hoof travels forward."""
    for key, phase in phases.items():
        a = math.tau * (t + phase)
        fore = key[0] == "F"
        upper = swing * math.sin(a)
        fold = lift * max(0.0, math.cos(a))
        # Fore knees fold backward (negative), hocks forward of the cannon.
        leg(horse, key, upper, -fold if fore else fold * 0.8, fold * 0.5 if fore else -fold * 0.4)


def pose(horse, rider, state, frame, frames, direction) -> None:
    rad = math.radians
    t = frame / max(1, frames)
    infantry.pose(rider, "idle", 0, 2, direction)
    body, neck, head, tail, fall = horse["body"], horse["neck"], horse["head"], horse["tail"], horse["fall"]
    body.rotation_euler = Euler((0, 0, 0))
    body.location = (0, 0, HIP_Z)
    fall.rotation_euler = Euler((0, 0, 0))
    fall.location = (0, 0, 0)
    neck.rotation_euler = Euler((rad(-38), 0, 0))
    head.rotation_euler = Euler((rad(128), 0, 0))
    tail.rotation_euler = Euler((rad(165), 0, 0))
    for key in LEGS:
        leg(horse, key, 0, 0)
    sh_r, el_r, th_r, kn_r = rider["joints"]["R"]
    sh_l, el_l, th_l, kn_l = rider["joints"]["L"]
    # Seat: thighs forward and apart around the horse, lower legs down along its flanks.
    th_r.rotation_euler = Euler((rad(58), rad(-34), 0))
    th_l.rotation_euler = Euler((rad(58), rad(34), 0))
    kn_r.rotation_euler = kn_l.rotation_euler = Euler((rad(-78), 0, 0))
    rider["hips"].location.z = 0.95
    # Left hand holds the reins; sabre sloped against the right shoulder.
    sh_l.rotation_euler = Euler((rad(38), rad(-8), 0))
    el_l.rotation_euler = Euler((rad(58), 0, 0))
    sh_r.rotation_euler = Euler((rad(24), rad(10), 0))
    el_r.rotation_euler = Euler((rad(92), 0, 0))
    rider["sabre"].rotation_euler = Euler((rad(78), 0, 0))
    torso = rider["torso"]
    if state == "idle":
        # Head lowered and raised, tail swish.
        neck.rotation_euler = Euler((rad((-38, -46)[frame]), 0, 0))
        tail.rotation_euler = Euler((rad(165), rad((-10, 10)[frame]), 0))
        leg(horse, "HL", 4, 6, -4)
        return
    if state == "walk":
        # Four-beat walk: left hind, left fore, right hind, right fore.
        gait(horse, t, {"HL": 0.0, "FL": 0.25, "HR": 0.5, "FR": 0.75}, 18, 38)
        neck.rotation_euler = Euler((rad(-38 - 4 * math.sin(t * math.tau * 2)), 0, 0))
        body.location = (0, 0, HIP_Z - 0.02 * abs(math.sin(t * math.tau * 2)))
        return
    if state == "gallop":
        # Transverse gallop with suspension: hinds, then fores; the body rocks.
        gait(horse, t, {"HL": 0.0, "HR": 0.12, "FL": 0.42, "FR": 0.54}, 38, 75)
        pitch = 6 * math.sin(t * math.tau)
        body.rotation_euler = Euler((rad(pitch), 0, 0))
        body.location = (0, 0, HIP_Z + 0.06 * max(0.0, math.sin(t * math.tau + 1.2)))
        neck.rotation_euler = Euler((rad(-28 - 8 * math.sin(t * math.tau)), 0, 0))
        tail.rotation_euler = Euler((rad(135), 0, 0))
        # Rider leans forward, sabre levelled at the enemy.
        torso.rotation_euler = Euler((rad(22 - pitch), 0, 0))
        sh_r.rotation_euler = Euler((rad(92), rad(4), 0))
        el_r.rotation_euler = Euler((rad(4), 0, 0))
        rider["sabre"].rotation_euler = Euler((rad(-4), 0, 0))
        return
    if state == "slash":
        # Cut: sabre raised, swept across, down; the horse stamps.
        leg(horse, "FR", (10, 26, 4)[frame], (-30, -60, -10)[frame])
        torso.rotation_euler = Euler((rad((6, 18, 30)[frame]), 0, rad((20, 0, -24)[frame])))
        sh_r.rotation_euler = Euler((rad((170, 120, 60)[frame]), rad((20, 0, -10)[frame]), 0))
        el_r.rotation_euler = Euler((rad((30, 10, 0)[frame]), 0, 0))
        rider["sabre"].rotation_euler = Euler((rad((40, 0, -20)[frame]), 0, 0))
        return
    if state == "rear":
        # Rearing on the hind legs, fore legs folded, rider standing in the stirrups.
        up = (16, 26)[frame]
        body.rotation_euler = Euler((rad(up), 0, 0))
        body.location = (0, -0.1, HIP_Z + 0.05)
        for key in ("FR", "FL"):
            leg(horse, key, (40, 55)[frame] - (10 if key == "FL" else 0), -95, 20)
        for key in ("HR", "HL"):
            leg(horse, key, -up + 6, 10, -6)
        neck.rotation_euler = Euler((rad(-20 - up / 2), 0, 0))
        torso.rotation_euler = Euler((rad(18), 0, 0))
        sh_r.rotation_euler = Euler((rad(150), rad(16), 0))
        el_r.rotation_euler = Euler((rad(20), 0, 0))
        return
    if state == "die":
        # Stumble, knees buckle, roll onto the side and lie still; the rider goes down with him.
        # Roll away from the camera (screen up) so the fallen horse stays in the cell.
        heading = rad(-45 * direction - 90)
        side = -1 if math.sin(heading) < -1e-6 else 1
        roll = (0, 12, 55, 84)[frame] * side
        drop = (0, 0.25, 0.45, 0.55)[frame]
        body.rotation_euler = Euler((rad((-10, -14, -6, 0)[frame]), 0, 0))
        fall.rotation_euler = Euler((0, rad(roll), 0))
        fall.location = (-0.42 * math.sin(rad(roll)), 0, -drop * (1 - frame / 6))
        for key in ("FR", "FL"):
            leg(horse, key, (10, 40, 30, 22)[frame], (-30, -110, -70, -40)[frame])
        for key in ("HR", "HL"):
            leg(horse, key, (-6, -30, -20, -12)[frame], (10, 60, 30, 18)[frame])
        neck.rotation_euler = Euler((rad((-50, -70, -30, 10)[frame]), 0, 0))
        torso.rotation_euler = Euler((rad((10, 30, 10, -20)[frame]), 0, 0))
        sh_r.rotation_euler = Euler((rad((60, 110, 140, 160)[frame]), rad(20), 0))
        sh_l.rotation_euler = Euler((rad((40, 80, 120, 100)[frame]), rad(-20), 0))
        return
    raise ValueError(state)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--side", choices=sorted(infantry.PALETTES), required=True)
    ap.add_argument("--variant", type=int, choices=sorted(COATS), default=1)
    ap.add_argument("--out", default="art/frames/iso-proof")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--states", nargs="*", help="render only these states (review)")
    ap.add_argument("--supersample", type=int, default=2)
    args = ap.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render(args.samples)
    ss = args.supersample
    camera(CELL[0] * ss, CELL[1] * ss, SPRITE_PX_PER_M * ss, (PIVOT[0] * ss, PIVOT[1] * ss))
    shadow_catcher("ground", [(1.6 * math.cos(a / 32 * math.tau), 1.6 * math.sin(a / 32 * math.tau)) for a in range(32)])
    horse = build_horse(args.side, args.variant)
    rider = build_rider(args.side, horse)
    suffix = "" if args.variant == 1 else str(args.variant)
    prefix = ("fr" if args.side == "france" else "br") + "c" + suffix
    out = Path(args.out).resolve() / "cavalry" / f"{args.side}{suffix}"
    out.mkdir(parents=True, exist_ok=True)
    for d, name in enumerate(infantry.DIRECTIONS):
        horse["root"].rotation_euler = Euler((0, 0, math.radians(-45 * d - 90)))
        for state, frames in STATES:
            if args.states and state not in args.states:
                continue
            for f in range(frames):
                pose(horse, rider, state, f, frames, d)
                bpy.context.view_layer.update()
                bpy.context.scene.render.filepath = str(out / f"{prefix}_iso_{state}_{name}_{f + 1:02d}.png")
                bpy.ops.render.render(write_still=True)
    print(f"{args.side} cavalry {args.variant}: {len(infantry.DIRECTIONS) * sum(n for _, n in STATES)} frames -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
