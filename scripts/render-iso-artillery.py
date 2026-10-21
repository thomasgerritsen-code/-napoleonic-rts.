#!/usr/bin/env python3
"""Render a field gun and its gunners for the Graphics Lab iso scene.

Same camera, sun and 30° view as the infantry (render-iso-infantry.py).
- gun: a 6-pounder on its carriage (French Gribeauval olive green, British
  grey), bronze barrel, spoked wheels; idle 1, fire 2 (muzzle flash, kick)
  and roll 4 (wheels turning) in 8 directions, 256x176 cells with the axle
  on the ground at (128,112). muzzle.json holds the muzzle pixel per direction.
- gunner: the fusilier body in artillery uniform (French blue with red,
  British blue with red facings and yellow lace), without pack or musket,
  with the tool each drill step needs: sponge/rammer, cartridge, handspike or
  linstock. States: idle 2, ram 4, load 2, aim 2, ready 2, touch 2, haul 4,
  march 6 and the three falls (4 each) in 176x128 cells like the infantry.

  python scripts/render-iso-artillery.py --side france --piece gun --out art/frames/iso-proof
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from iso_blender_common import (SPRITE_PX_PER_M, camera, empty, material, part,  # noqa: E402
                                screen_up, setup_render, shadow_catcher)

_spec = importlib.util.spec_from_file_location("iso_infantry", HERE / "render-iso-infantry.py")
infantry = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(infantry)

GUN_CELL, GUN_PIVOT = (256, 176), (128, 112)
GUN_STATES = [("idle", 1), ("fire", 2), ("roll", 4)]
GUNNER_STATES = [("idle", 2), ("ram", 4), ("load", 2), ("aim", 2), ("ready", 2), ("touch", 2), ("haul", 4),
                 ("march", 6), ("die", 4), ("diefwd", 4), ("dieside", 4)]
PREFIX = {"gun": "g", "gunner": "a"}
CARRIAGE = {"france": "#5d6a3a", "britain": "#7b8790"}
WHEEL_R, AXLE_Z, BARREL_Z = 0.68, 0.68, 1.0
MUZZLE_Y = 1.45
# Artillery uniforms: (coat, facings, cuffs, turnbacks, breeches, lace, pompom)
UNIFORM = {
    "france": {"coat": "#232c4f", "lapel": "#232c4f", "collar": "#232c4f", "cuff": "#a62222",
               "turnback": "#a62222", "breeches": "#232c4f", "pompom": "#a62222", "strap": "#a62222"},
    "britain": {"coat": "#1f2944", "lapel": "#1f2944", "collar": "#b3262b", "cuff": "#b3262b",
                "turnback": "#ece8db", "breeches": "#d8d4c8", "pompom": "#ece8db", "lace": "#d8b44a",
                "strap": "#1f2944"},
}
# Part names coloured by each uniform key.
RECOLOUR = {"coat": ("coat", "chest", "tails", "upperarm", "forearm"), "lapel": ("lapel",), "collar": ("collar",),
            "cuff": ("cuff",), "turnback": ("turnback",), "breeches": ("waist", "thigh"), "pompom": ("pompom", "plume"),
            "lace": ("lace",), "strap": ("strap",)}
STRIPPED = ("pack", "packstrap", "roll", "messtin", "cartridge", "canteen", "tuft")


def hide_tree(obj, hidden=True) -> None:
    obj.hide_render = hidden
    for child in obj.children:
        hide_tree(child, hidden)


# --- Gun -----------------------------------------------------------------------

def wheel(name, parent, x, wood, iron):
    hub = empty(name, parent, (x, 0, AXLE_Z), (0, 0, 0))
    spin = empty(name + "spin", hub)
    # Felloes as 16 short segments, iron tyre outside, 12 spokes, nave.
    for k in range(16):
        a = k / 16 * math.tau
        r = WHEEL_R - 0.05
        part("box", (0.07, 0.29, 0.1), (0, math.cos(a) * r, math.sin(a) * r), wood, spin,
             rot=(math.degrees(a) + 90, 0, 0), name="felloe")
        part("box", (0.075, 0.28, 0.02), (0, math.cos(a) * (WHEEL_R - 0.002), math.sin(a) * (WHEEL_R - 0.002)), iron, spin,
             rot=(math.degrees(a) + 90, 0, 0), name="tyre")
    for k in range(12):
        a = k / 12 * math.tau
        r = (WHEEL_R - 0.08) / 2
        part("box", (0.035, 0.035, WHEEL_R - 0.1), (0, math.cos(a) * r, math.sin(a) * r), wood, spin,
             rot=(math.degrees(a) + 90, 0, 0), name="spoke")
    part("cyl", (0.09, 0.24, 0.07), (0, 0, 0), wood, spin, rot=(0, 90, 0), name="nave")
    part("cyl", (0.05, 0.27), (0, 0, 0), iron, spin, rot=(0, 90, 0), name="hubcap")
    return spin


def build_gun(side: str) -> dict:
    wood = material(CARRIAGE[side], 0.7, pattern="planks", scale=3)
    iron = material("#2a2a2a", 0.45, 0.6, pattern="plain")
    bronze = material("#b08d4a", 0.35, 0.85, pattern="plain")
    root = empty("root")
    kick = empty("kick", root)            # rocks the whole gun about the trail end on firing
    spins = [wheel("wheelR", kick, 0.78, wood, iron), wheel("wheelL", kick, -0.78, wood, iron)]
    part("box", (1.5, 0.11, 0.11), (0, 0, AXLE_Z), iron, kick, name="axle")
    # Two cheeks sloping from above the axle down to the trail end on the ground.
    length, drop = 2.75, AXLE_Z + 0.2 - 0.12
    tilt = math.degrees(math.atan2(drop, length))
    for x in (0.17, -0.17):
        part("box", (0.08, length, 0.3), (x, 0.35 - length / 2, (AXLE_Z + 0.2 + 0.12) / 2), wood, kick,
             rot=(-tilt, 0, 0), name="cheek")
    for y, z in ((0.25, 0.86), (-0.9, 0.56), (-1.8, 0.33)):
        part("box", (0.42, 0.12, 0.1), (0, y, z), wood, kick, rot=(-tilt, 0, 0), name="transom")
    part("box", (0.4, 0.22, 0.08), (0, -2.3, 0.08), iron, kick, name="trailplate")
    part("box", (0.05, 0.05, 0.3), (0, -2.15, 0.22), iron, kick, rot=(20, 0, 0), name="ring")
    # Bronze barrel on its trunnions just ahead of the axle, cascabel at the breech.
    barrel = empty("barrel", kick, (0, 0.12, BARREL_Z), (-2, 0, 0))
    part("cyl", (0.125, 1.9, 0.085), (0, 0.33, 0), bronze, barrel, rot=(-90, 0, 0), name="tube", segments=24)
    for y, r in ((-0.48, 0.135), (0.05, 0.13), (0.62, 0.11), (1.22, 0.098)):
        part("cyl", (r, 0.05), (0, y, 0), bronze, barrel, rot=(-90, 0, 0), name="reinforce", segments=24)
    part("cyl", (0.105, 0.12, 0.1), (0, MUZZLE_Y - 0.12 - 0.12, 0), bronze, barrel, rot=(-90, 0, 0), name="swell", segments=24)
    part("cyl", (0.045, 0.06), (0, MUZZLE_Y - 0.12 + 0.005, 0), material("#1a1a1a", 0.6, pattern="plain"), barrel,
         rot=(-90, 0, 0), name="bore", segments=16)
    part("ball", (0.07,), (0, -0.66, 0), bronze, barrel, name="cascabel")
    part("cyl", (0.045, 0.42), (0, 0, 0), bronze, barrel, rot=(0, 90, 0), name="trunnion")
    for x in (0.07, -0.07):
        part("box", (0.03, 0.12, 0.05), (x, 0.0, 0.13), bronze, barrel, name="dolphin")
    part("box", (0.16, 0.24, 0.1), (0, -0.55, -0.16), wood, kick, name="quoin")
    part("cyl", (0.03, 0.25), (0, -0.62, 0.84), iron, kick, name="screw")
    # Bucket hanging under the trail.
    part("cyl", (0.09, 0.2, 0.11), (0.26, -1.2, 0.28), material("#3a2a1a", 0.7, pattern="planks"), kick, name="bucket")
    flash = part("ball", (0.17, 1, 1.8, 1), (0, MUZZLE_Y + 0.25, 0), infantry.glow("#ffb347", 4), barrel, name="flash")
    flame = part("cyl", (0.13, 0.75, 0.0), (0, MUZZLE_Y + 0.6, 0), infantry.glow("#ff6a1a", 3.5), barrel,
                 rot=(-90, 0, 0), name="flame")
    return {"root": root, "kick": kick, "barrel": barrel, "spins": spins, "flash": [flash, flame]}


def pose_gun(rig: dict, state: str, frame: int) -> None:
    for obj in rig["flash"]:
        obj.hide_render = not (state == "fire" and frame == 0)
    # Fire frame 2: the recoil lifts the muzzle about the trail end.
    rig["kick"].rotation_euler = Euler((math.radians(-2.5 if state == "fire" and frame == 1 else 0), 0, 0))
    # Twelve spokes repeat every 30°; the roll frames step 6° so none matches idle.
    spin = 6 * (frame + 1) if state == "roll" else 0
    for s in rig["spins"]:
        s.rotation_euler = Euler((math.radians(-spin), 0, 0))


# --- Gunner --------------------------------------------------------------------

def build_gunner(side: str) -> dict:
    rig = infantry.build_soldier(side, 1)
    hide_tree(rig["musket"])
    rig["armed"] = False
    for obj in bpy.data.objects:
        if obj.name.split(".")[0] in STRIPPED:
            obj.hide_render = True
    colours = UNIFORM[side]
    mats = {k: material(v, 0.8, pattern="cloth") for k, v in colours.items()}
    for obj in bpy.data.objects:
        base = obj.name.split(".")[0]
        for key, names in RECOLOUR.items():
            if key in mats and base in names and obj.type == "MESH":
                obj.data.materials[0] = mats[key]
    torso = rig["torso"]
    sh_r, el_r, _, _ = rig["joints"]["R"]
    if side == "france":
        # Red fringed epaulettes and red shako cords of the foot artillery.
        for x in (0.2, -0.2):
            part("cyl", (0.08, 0.05, 0.1), (x, 0, 0.575), mats["cuff"], torso, name="epaulette")
    wood = material("#6a4322", 0.6, pattern="bark", scale=2.5)
    sponge_m = material("#2b2620", 0.95, pattern="cloth")
    tools = {}
    # Sponge and rammer staff, carried across the body (along local X).
    rammer = empty("rammer", torso, (0, 0.3, 0.22))
    part("cyl", (0.018, 2.2), (0, 0, 0), wood, rammer, rot=(0, 90, 0), name="staff")
    part("cyl", (0.06, 0.22), (-1.15, 0, 0), sponge_m, rammer, rot=(0, 90, 0), name="sponge")
    part("cyl", (0.055, 0.12), (1.14, 0, 0), wood, rammer, rot=(0, 90, 0), name="ramhead")
    tools["rammer"] = rammer
    # Cartridge (powder bag and ball) in the right hand.
    cartridge = empty("cartridgebag", el_r, (0, 0.06, -0.31))
    part("cyl", (0.05, 0.2), (0, 0.06, 0), material("#e6dcc0", 0.9, pattern="cloth"), cartridge, rot=(-90, 0, 0),
         name="bag")
    part("ball", (0.05,), (0, 0.18, 0), material("#262626", 0.5, 0.4, pattern="plain"), cartridge, name="shot")
    tools["cartridge"] = cartridge
    # Handspike to traverse the trail.
    spike = empty("handspike", torso, (0, 0.42, -0.25), (-55, 0, 0))
    part("cyl", (0.025, 1.4, 0.016), (0, 0, 0.1), wood, spike, name="spike")
    tools["handspike"] = spike
    # Linstock with a glowing slow match at the top, held in the right hand.
    linstock = empty("linstock", el_r, (0, 0.01, -0.3))
    part("cyl", (0.014, 1.05), (0, 0, 0.3), wood, linstock, name="stock")
    part("box", (0.07, 0.012, 0.012), (0, 0, 0.83), material("#2a2a2a", 0.5, 0.6, pattern="plain"), linstock,
         name="fork")
    part("ball", (0.022,), (0.03, 0, 0.86), infantry.glow("#ff7a2a", 6), linstock, name="match")
    tools["linstock"] = linstock
    rig["tools"] = tools
    return rig


def pose_gunner(rig: dict, state: str, frame: int, frames: int, direction: int) -> None:
    rad = math.radians
    base = {"march": "march", "die": "die", "diefwd": "diefwd", "dieside": "dieside"}.get(state, "idle")
    infantry.pose(rig, base, frame if base != "idle" else frame % 2, frames if base != "idle" else 2, direction)
    for tool in rig["tools"].values():
        hide_tree(tool)
    set_arms, set_legs = infantry.set_arms, infantry.set_legs
    torso = rig["torso"]
    t = frame / max(1, frames)
    if state in ("die", "diefwd", "dieside"):
        return
    if state == "march":
        swing = math.sin(t * math.tau)
        set_arms(rig, (22 * swing, 8, 18), (-22 * swing, -8, 18))
        return
    if state == "idle":
        set_arms(rig, (6, 10, 14 + 4 * frame), (6, -10, 14))
        return
    if state == "ram":
        # Sponge/ram stroke: the staff slides out to his left into the bore and back.
        stroke = (0.0, 0.4, 0.85, 0.45)[frame]
        rammer = rig["tools"]["rammer"]
        hide_tree(rammer, False)
        # Staff mostly to his right when drawn out, pushed across to his left into the bore.
        rammer.location = (0.7 - 0.85 * stroke, 0.32, 0.18)
        torso.rotation_euler = Euler((rad(10 + 6 * stroke), 0, 0))
        set_legs(rig, (14, -12), (-10, -8), 0.92)
        set_arms(rig, (72, 8 - 34 * stroke, 28), (76, -24 - 24 * stroke, 22))
        return
    if state == "load":
        hide_tree(rig["tools"]["cartridge"], False)
        torso.rotation_euler = Euler((rad((10, 22)[frame]), 0, 0))
        set_legs(rig, (10, -8), (-6, -6), 0.93)
        set_arms(rig, ((78, 96)[frame], 6, (24, 6)[frame]), (62, -14, 30))
        return
    if state == "aim":
        # Crouched over the trail, levering it round with the handspike.
        spike = rig["tools"]["handspike"]
        hide_tree(spike, False)
        spike.rotation_euler = Euler((rad(-55), 0, rad((-8, 10)[frame])))
        torso.rotation_euler = Euler((rad(32), 0, 0))
        set_legs(rig, (52, -82), (38, -66), 0.72)
        set_arms(rig, (58, (6, 20)[frame], 18), (54, (-20, -6)[frame], 22))
        return
    if state in ("ready", "touch"):
        linstock = rig["tools"]["linstock"]
        hide_tree(linstock, False)
        if state == "ready":
            # Linstock held upright beside him, the match smouldering.
            set_arms(rig, (18, 14, 78 + 6 * frame), (6, -10, 14))
            linstock.rotation_euler = Euler((rad(-78 - 6 * frame), 0, 0))
            rig["head"].rotation_euler = Euler((0, 0, rad((0, 12)[frame])))
        else:
            # Reaching the match to the vent, then leaning away from the recoil.
            torso.rotation_euler = Euler((rad((26, -6)[frame]), 0, 0))
            set_legs(rig, (18, -12), (-14, -6), 0.92)
            set_arms(rig, ((70, 54)[frame], 10, (10, 46)[frame]), ((20, 40)[frame], -16, 30))
            linstock.rotation_euler = Euler((rad((-160, -120)[frame]), 0, 0))
        return
    if state == "haul":
        # Running the gun back up: leaning into the wheel, hands on the spokes.
        right, left, hips = infantry.running(t, 22, 0.9)
        set_legs(rig, right, left, hips)
        torso.rotation_euler = Euler((rad(24), 0, 0))
        set_arms(rig, (84, 16, 22), (84, -16, 22))
        return
    raise ValueError(state)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--side", choices=sorted(infantry.PALETTES), required=True)
    ap.add_argument("--piece", choices=sorted(PREFIX), required=True)
    ap.add_argument("--out", default="art/frames/iso-proof")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--states", nargs="*", help="render only these states (review)")
    ap.add_argument("--supersample", type=int, default=2)
    args = ap.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render(args.samples)
    ss = args.supersample
    gun = args.piece == "gun"
    (cw, ch), (px, py) = (GUN_CELL, GUN_PIVOT) if gun else ((infantry.FRAME_W, infantry.FRAME_H), infantry.PIVOT)
    camera(cw * ss, ch * ss, SPRITE_PX_PER_M * ss, (px * ss, py * ss))
    if gun:
        # Shadow catcher under the whole gun, centred between muzzle and trail.
        shadow_catcher("ground", [(2.1 * math.cos(a / 32 * math.tau), -0.4 + 2.1 * math.sin(a / 32 * math.tau))
                                  for a in range(32)])
    else:
        shadow_catcher("ground", [(0.2 + 0.85 * math.cos(a / 24 * math.tau), 0.05 + 0.85 * math.sin(a / 24 * math.tau))
                                  for a in range(24)])
    rig = build_gun(args.side) if gun else build_gunner(args.side)
    prefix = ("fr" if args.side == "france" else "br") + PREFIX[args.piece]
    out = Path(args.out).resolve() / "artillery" / f"{args.side}_{args.piece}"
    out.mkdir(parents=True, exist_ok=True)
    muzzle = {}
    states = GUN_STATES if gun else GUNNER_STATES
    for d, name in enumerate(infantry.DIRECTIONS):
        if gun:
            # Shadow catcher must turn with the gun so it stays under the trail.
            bpy.data.objects["ground"].rotation_euler = Euler((0, 0, math.radians(-45 * d - 90)))
        rig["root"].rotation_euler = Euler((0, 0, math.radians(-45 * d - 90)))
        for state, frames in states:
            if args.states and state not in args.states:
                continue
            for f in range(frames):
                if gun:
                    pose_gun(rig, state, f)
                else:
                    pose_gunner(rig, state, f, frames, d)
                bpy.context.view_layer.update()
                if gun and state == "fire" and f == 0:
                    p = rig["barrel"].matrix_world @ Vector((0, MUZZLE_Y, 0))
                    muzzle[name] = {"x": round(px + p.x * SPRITE_PX_PER_M, 1),
                                    "y": round(py - screen_up(p) * SPRITE_PX_PER_M, 1)}
                bpy.context.scene.render.filepath = str(out / f"{prefix}_iso_{state}_{name}_{f + 1:02d}.png")
                bpy.ops.render.render(write_still=True)
    if muzzle:
        (out / "muzzle.json").write_text(json.dumps({"fire": muzzle}, indent=1) + "\n")
    print(f"{args.side} {args.piece}: {len(infantry.DIRECTIONS) * sum(n for _, n in states)} frames -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
