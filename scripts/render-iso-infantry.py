#!/usr/bin/env python3
"""Render the isometric Blender infantry (Graphics Lab iso proof, v323 model).

Builds an original, script-generated 1809 line fusilier from primitives (no
third-party model), poses it per frame and renders 8 directions x (2 idle +
6 march + 2 aim + 3 fire + 4 reload + 3 x 4 fall) frames with the shared iso camera and sun (iso_blender_common.py).
The same rig produces the French and the British soldier; only uniform
details and colours differ.

Requires Blender's Python module (``pip install bpy``, Blender 5.x):
  python scripts/render-iso-infantry.py --side france --out art/frames/iso-proof
Then pack with scripts/pack-iso-atlas.py.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from iso_blender_common import (SPRITE_PX_PER_M, camera, empty, material, part,  # noqa: E402
                                screen_up, setup_render, shadow_catcher)

FRAME_W, FRAME_H = 176, 128   # output cell, px (wide enough for a levelled musket)
PIVOT = (88, 108)             # feet on screen, px
DIRECTIONS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"]  # clockwise on screen
STATES = [("idle", 2), ("march", 6), ("aim", 2), ("fire", 3), ("reload", 4),
          ("die", 4), ("diefwd", 4), ("dieside", 4),
          ("kaim", 2), ("kfire", 3), ("misfire", 3), ("charge", 6), ("thrust", 3),
          ("rout", 6), ("crawl", 4), ("cheer", 2),
          ("look", 4), ("adjust", 4), ("lean", 2)]

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


# Three looks per nation so a regiment is not a row of clones: skin, hair,
# facial hair, height and the colour of the rolled blanket/greatcoat.
VARIANTS = {
    1: {},
    # Campaign overalls instead of breeches and gaiters, oilcloth shako cover.
    2: {"skin": "#bf8a62", "hair": "#1f1712", "roll": "#5d6a7e", "height": 0.96, "moustache": True,
        "breeches": "#8a8070", "gaiter": "#7d7465", "cover": True},
    # Brown blanket roll with a tin mess kettle on the pack.
    3: {"skin": "#e2b793", "hair": "#a5713a", "roll": "#6b5b47", "sideburns": True,
        "messtin": True},
    # Elite companies: grenadiers (French red epaulettes and plume, British
    # white plume and wings) and voltigeurs / the British light company.
    4: {"company": "grenadier", "moustache": True, "skin": "#c99470"},
    5: {"company": "light", "hair": "#3a2a1c"},
}


def build_soldier(side: str, variant: int = 1) -> dict:
    look = dict(VARIANTS[variant])
    if side == "britain" and "breeches" in look:
        look.update(breeches="#5f646b", gaiter="#585d63")
    p = {**PALETTES[side], **COMMON, **{k: v for k, v in look.items() if isinstance(v, str) and k != "company"}}
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
    root.scale = (look.get("height", 1.0),) * 3
    # The whole body topples about the feet through this pivot when hit.
    fall = empty("fall", root)
    hips = empty("hips", fall, (0, 0, 0.95))
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
    if look.get("messtin"):
        part("cyl", (0.07, 0.09), (0, -0.2, 0.67), material("#c9ccc8", 0.3, 0.8, pattern="plain"), torso, name="messtin")
    part("cyl", (0.078, 0.075), (0, 0, 0.6), M["collar"], torso, name="collar")

    head = empty("head", torso, (0, 0, 0.72))
    part("ball", (0.104, 1, 1.02, 1.05), (0, 0.01, 0), M["skin"], head, name="face")
    part("ball", (0.106, 1, 0.95, 0.9), (0, -0.025, 0.02), M["hair"], head, name="hair")
    part("cyl", (0.022, 0.05, 0.004), (0, 0.115, -0.01), M["skin"], head, rot=(-90, 0, 0), name="nose", segments=8)
    if look.get("moustache"):
        part("box", (0.07, 0.025, 0.018), (0, 0.105, -0.045), M["hair"], head, name="moustache")
    if look.get("sideburns"):
        for x in (0.095, -0.095):
            part("box", (0.02, 0.05, 0.07), (x, 0.03, -0.02), M["hair"], head, name="sideburn")
    for x in (0.1, -0.1):
        part("ball", (0.022,), (x, 0, 0), M["skin"], head, name="ear", segments=8)
    company = look.get("company")
    if company:
        british_colours = {"grenadier": ("#f1ebdd", "#b3262b"), "light": ("#2f5a33", "#b3262b")}
        french_colours = {"grenadier": ("#b02a2e", "#b02a2e"), "light": ("#d9b43a", "#3e6b34")}
        plume, shoulder = (british_colours if british else french_colours)[company]
        pm, sm = material(plume, 0.8, pattern="cloth"), material(shoulder, 0.8, pattern="cloth")
        for x in (0.2, -0.2):
            if british:
                # Shoulder wings with white lace.
                part("box", (0.1, 0.16, 0.05), (x, 0, 0.56), sm, torso, name="wing")
                part("box", (0.1, 0.165, 0.012), (x, 0, 0.535), M["turnback"], torso, name="winglace")
            else:
                part("cyl", (0.08, 0.05, 0.1), (x, 0, 0.575), sm, torso, name="epaulette")
                for k in range(6):
                    a = k / 6 * math.tau
                    part("cyl", (0.012, 0.06), (x + math.cos(a) * 0.085, math.sin(a) * 0.085, 0.53), sm, torso,
                         name="fringe", segments=6)
        if company == "light" and not british:
            part("cyl", (0.08, 0.075), (0, 0, 0.6), material("#d9b43a", 0.8, pattern="cloth"), torso, name="collar")
    if look.get("cover"):
        # Campaign oilcloth cover: glossy black, hides plate, cords and pompom.
        oil = material("#121212", 0.28, pattern="plain")
        part("cyl", (0.1, 0.21, 0.115), (0, 0, 0.165), oil, head, name="shako")
        part("cyl", (0.117, 0.02), (0, 0, 0.272), oil, head, name="lid")
        part("box", (0.13, 0.06, 0.014), (0, 0.1, 0.075), M["shako"], head, rot=(-12, 0, 0), name="visor")
    else:
        part("cyl", (0.097, 0.2, 0.112), (0, 0, 0.16), M["shako"], head, name="shako")
        part("cyl", (0.114, 0.02), (0, 0, 0.265), M["shako"], head, name="lid")
        part("box", (0.13, 0.06, 0.014), (0, 0.1, 0.075), M["shako"], head, rot=(-12, 0, 0), name="visor")
        part("box", (0.075, 0.012, 0.075), (0, 0.108, 0.16), M["plate"], head, rot=(0, 45, 0), name="plate")
        for x in (0.1, -0.1):
            part("box", (0.01, 0.03, 0.1), (x * 1.02, -0.005, 0.04), M["plate"], head, rot=(10, 0, 0), name="chinscale")
        if company:
            # Tall company plume instead of the fusilier pompom.
            part("cyl", (0.03, 0.2, 0.04), (0, 0.07, 0.36), pm, head, name="plume")
            if not british:
                part("box", (0.012, 0.012, 0.09), (0.06, 0.1, 0.12), pm, head, rot=(0, 40, 0), name="cord")
        elif british:
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
    musket = empty("musket", torso, *CARRY)
    part("box", (0.045, 0.1, 0.3), (0, 0, 0.15), M["wood"], musket, name="butt")
    part("cyl", (0.024, 0.95, 0.018), (0, 0.01, 0.75), M["wood"], musket, name="stock")
    part("cyl", (0.011, 1.05), (0, 0.032, 0.85), M["steel"], musket, name="barrel")
    part("box", (0.012, 0.03, 0.07), (0.022, 0.02, 0.42), M["steel"], musket, name="lock")
    for z in (0.62, 0.9, 1.15):
        part("cyl", (0.027, 0.022), (0, 0.015, z), M["steel"], musket, name="band")
    part("box", (0.008, 0.012, 0.8), (0, -0.03, 0.55), M["belt"], musket, rot=(4, 0, 0), name="sling")
    part("cyl", (0.009, 0.34, 0.002), (0, 0.04, 1.5), M["steel"], musket, name="bayonet")
    # Ramrod drawn above the muzzle while loading; muzzle flash only on firing.
    ramrod = part("cyl", (0.007, 0.9), (0, 0.032, 1.75), M["steel"], musket, name="ramrod")
    flash = part("ball", (0.11, 1, 1, 1.9), (0, 0.032, MUZZLE_Z + 0.2), glow("#ffc45c", 7), musket, name="flash")
    flame = part("cyl", (0.06, 0.32, 0.0), (0, 0.032, MUZZLE_Z + 0.36), glow("#ff7f24", 6), musket, name="flame")
    pan = part("ball", (0.05,), (0.04, 0.03, 0.44), glow("#ffd27a", 6), musket, name="panflash")
    return {"root": root, "fall": fall, "hips": hips, "torso": torso, "head": head, "joints": joints, "musket": musket,
            "ramrod": ramrod, "flash": [flash, flame], "pan": pan}


def glow(hex_color: str, strength: float):
    m = material(hex_color, 0.5, pattern="plain")
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Emission Color"].default_value = bsdf.inputs["Base Color"].default_value
    bsdf.inputs["Emission Strength"].default_value = strength
    return m


MUZZLE_Z = 1.375
# Musket placements on the torso: (location, rotation degrees).
CARRY = ((-0.25, 0.1, -0.05), (-22, -6, 0))
READY = ((0.02, 0.22, -0.2), (-12, 0, 8))          # vertical before the chest
PRESENT = ((0.1, 0.0, 0.47), (-87, 0, 4))          # levelled at the right shoulder
RECOIL = ((0.1, -0.04, 0.5), (-80, 0, 4))
LOWER = ((0.06, 0.1, 0.3), (-58, 0, 6))
PRIME = ((0.0, 0.18, -0.12), (-48, 0, 10))         # half-cock at the waist
RAM = ((-0.04, 0.26, -0.93), (-8, 0, 0))           # butt on the ground
SHOULDER = ((-0.16, 0.16, -0.12), (-6, -4, 0))

# Per state and frame: musket placement, right/left shoulder + elbow (deg),
# torso lean, flash, ramrod offset along the barrel (None = stowed).
DRILL = {
    "aim": [(READY, (38, 18, 70), (52, -12, 55), 2, 0, None),
            (PRESENT, (72, 22, 48), (84, -14, 12), 4, 0, None)],
    # The big flash sits on fire frame 2: unit-animation-config's muzzleEvent.
    # Frame 1: priming powder flashes in the pan (flash code 3), then the shot.
    "fire": [(PRESENT, (72, 22, 48), (84, -14, 12), 5, 3, None),
             (RECOIL, (66, 22, 50), (80, -14, 16), -3, 2, None),
             (LOWER, (52, 20, 60), (66, -12, 30), 0, 0, None)],
    "reload": [(PRIME, (44, 18, 78), (48, -10, 42), 6, 0, None),
               (RAM, (150, 10, 30), (40, -16, 38), 3, 0, 0.0),
               (RAM, (122, 12, 52), (40, -16, 38), 3, 0, -0.42),
               (SHOULDER, (30, 14, 70), (24, -10, 46), 1, 0, None)],
}


# Three ways to fall, each four frames. Per frame: (tilt, twist fraction, lift,
# hips height, thigh, knee, right/left shoulder (x, y), elbow, torso lean,
# musket placement). "axis" is the topple axis (x: backwards/forwards, y: onto
# the right side) and "head" the ground angle the head ends up pointing to,
# relative to the facing; fall_twist() turns that so the body lies across the
# screen. Final poses keep the arms down: no corpse lies with its arms raised.
DEATHS = {
    "die": {"axis": "x", "head": 180, "frames": [   # shot in the chest, falls back
        (12, 0.0, 0.0, 0.95, 0, -4, (-40, 24), (20, -34), 34, -22, ((-0.24, 0.14, -0.1), (-46, -6, 0))),
        (16, 0.3, 0.0, 0.74, 34, -66, (4, 14), (8, -18), 22, 14, ((-0.2, 0.22, -0.3), (-62, 0, 10))),
        (54, 0.7, 0.04, 0.84, 18, -36, (62, 30), (46, -30), 30, 6, ((-0.3, 0.12, -0.38), (-100, 0, 30))),
        (86, 1.0, 0.16, 0.95, 4, -10, (14, 24), (10, -26), 18, 0, ((-0.44, 0.06, 0.5), (180, 0, 8))),
    ]},
    "diefwd": {"axis": "x", "head": 0, "frames": [    # doubles over, crumples on his face
        (-6, 0.0, 0.0, 0.93, 0, -10, (30, 10), (30, -10), 50, 28, ((-0.2, 0.25, -0.2), (-40, 0, 10))),
        (-12, 0.3, 0.0, 0.7, 40, -75, (20, 10), (15, -10), 40, 30, ((-0.15, 0.4, -0.5), (-70, 0, 10))),
        (-50, 0.7, 0.03, 0.8, 20, -40, (70, 20), (70, -20), 20, 10, ((0.36, 0.18, 0.3), (150, 0, 15))),
        (-86, 1.0, 0.14, 0.95, 2, -12, (10, 30), (25, -35), 35, 0, ((0.46, 0.0, 0.5), (180, 0, -8))),
    ]},
    "dieside": {"axis": "y", "head": -90, "frames": [  # hit in the shoulder, spins onto his side
        (8, 0.0, 0.0, 0.95, 0, -6, (-20, 30), (40, -10), 30, -6, ((-0.25, 0.15, -0.1), (-40, -6, 0))),
        (18, 0.3, 0.0, 0.78, 30, -60, (40, 20), (30, -10), 50, 8, ((-0.3, 0.3, -0.45), (-80, 0, 15))),
        (55, 0.7, 0.04, 0.82, 45, -70, (60, 30), (50, -20), 60, 12, ((-0.4, 0.35, -0.3), (-95, 0, 30))),
        (86, 1.0, 0.17, 0.95, 55, -90, (70, 20), (60, -10), 80, 15, ((-0.1, 0.42, 0.3), (180, 0, 0))),
    ]},
}


def fall_twist(direction: int, head: float = 180) -> float:
    """Twist (deg) that keeps the fallen body as level across the screen as possible."""
    def cost(t):
        angle = math.radians(-45 * direction + head + t)
        return abs(math.sin(angle)) + 0.004 * abs(t)
    return min((-70, -55, -40, -25, 25, 40, 55, 70), key=cost)


CHARGE = ((0.12, 0.16, 0.12), (-92, 0, 6))         # bayonet levelled at the hip
THRUST_BACK = ((0.12, -0.04, 0.16), (-92, 0, 6))
THRUST_OUT = ((0.12, 0.26, 0.1), (-94, 0, 4))
TRAIL = ((0.22, 0.05, -0.3), (-40, 0, -10))         # musket trailed while running away


def set_legs(rig, right, left, hips_z):
    """right/left: (thigh, knee) degrees."""
    rad = math.radians
    _, _, th_r, kn_r = rig["joints"]["R"]
    _, _, th_l, kn_l = rig["joints"]["L"]
    th_r.rotation_euler = Euler((rad(right[0]), 0, 0))
    kn_r.rotation_euler = Euler((rad(right[1]), 0, 0))
    th_l.rotation_euler = Euler((rad(left[0]), 0, 0))
    kn_l.rotation_euler = Euler((rad(left[1]), 0, 0))
    rig["hips"].location.z = hips_z


def set_arms(rig, right, left):
    """right/left: (shoulder x, shoulder y, elbow) degrees."""
    rad = math.radians
    sh_r, el_r, _, _ = rig["joints"]["R"]
    sh_l, el_l, _, _ = rig["joints"]["L"]
    sh_r.rotation_euler = Euler((rad(right[0]), rad(right[1]), 0))
    el_r.rotation_euler = Euler((rad(right[2]), 0, 0))
    sh_l.rotation_euler = Euler((rad(left[0]), rad(left[1]), 0))
    el_l.rotation_euler = Euler((rad(left[2]), 0, 0))


def running(t, stride, lean_hips=0.9):
    """Leg angles for a running cycle at phase t (0..1)."""
    sw = math.sin(t * math.tau)
    right = (stride * sw, -55 * max(0.0, -math.cos(t * math.tau)) - 10)
    left = (-stride * sw, -55 * max(0.0, math.cos(t * math.tau)) - 10)
    return right, left, lean_hips - 0.04 * abs(sw)


KNEEL = ((0, -92), (84, -86), 0.53)                  # right knee on the ground


def pose_extra(rig: dict, state: str, frame: int, frames: int, direction: int = 0) -> bool:
    """Combat, morale and idle-variety poses added in v330."""
    rad = math.radians
    t = frame / frames
    musket, torso, head = rig["musket"], rig["torso"], rig["head"]
    if state in ("kaim", "kfire"):
        # The front rank kneels to fire so the rank behind can fire over it.
        drill = DRILL["aim" if state == "kaim" else "fire"][frame]
        place(musket, drill[0])
        set_arms(rig, drill[1], drill[2])
        torso.rotation_euler = Euler((rad(drill[3]), 0, 0))
        set_legs(rig, *KNEEL)
        flash = drill[4]
        if flash == 3:
            rig["pan"].hide_render = False
        elif flash:
            for obj in rig["flash"]:
                obj.hide_render = False
                obj.scale = (1, 1, 1) if flash == 2 else (0.55, 0.55, 0.55)
        return True
    if state == "misfire":
        # Flash in the pan, no shot: the man lowers his musket and looks at the lock.
        place(musket, (PRESENT, PRESENT, LOWER)[frame])
        set_arms(rig, ((72, 22, 48), (70, 22, 50), (52, 20, 60))[frame], ((84, -14, 12), (82, -14, 14), (66, -12, 30))[frame])
        torso.rotation_euler = Euler((rad((5, 2, 0)[frame]), 0, 0))
        head.rotation_euler = Euler((rad((0, 6, 14)[frame]), 0, rad((0, 8, 18)[frame])))
        set_legs(rig, (-14, -6), (9, -8), 0.94)
        if frame == 0:
            rig["pan"].hide_render = False
        return True
    if state == "charge":
        right, left, hips = running(t, 40)
        set_legs(rig, right, left, hips)
        place(musket, CHARGE)
        set_arms(rig, (28, 16, 72), (72, -12, 24))
        torso.rotation_euler = Euler((rad(16), 0, 0))
        return True
    if state == "thrust":
        place(musket, (THRUST_BACK, THRUST_OUT, CHARGE)[frame])
        set_arms(rig, ((20, 16, 80), (46, 14, 30), (28, 16, 72))[frame], ((60, -12, 40), (88, -12, 6), (72, -12, 24))[frame])
        torso.rotation_euler = Euler((rad((-4, 20, 10)[frame]), 0, 0))
        set_legs(rig, ((-10, -10), (-28, -6), (-16, -10))[frame], ((10, -12), (40, -30), (20, -16))[frame],
                 (0.93, 0.86, 0.9)[frame])
        return True
    if state == "rout":
        right, left, hips = running(t, 46)
        set_legs(rig, right, left, hips)
        place(musket, TRAIL)
        swing = math.sin(t * math.tau)
        set_arms(rig, (-30 * swing + 10, 10, 60), (30 * swing + 10, -10, 60))
        torso.rotation_euler = Euler((rad(20), 0, 0))
        head.rotation_euler = Euler((rad(-8), 0, rad(20 * swing)))
        return True
    if state == "crawl":
        # Wounded, crawling on the belly with the musket left behind.
        hide_render_tree(musket, True)
        # Prone along the crawl direction (the lab moves him that way).
        rig["fall"].rotation_euler = Euler((rad(-84), 0, 0))
        # Centre the prone body on the feet pivot so it stays inside the cell.
        # plus 0.6 m further from the camera (screen up) so the feet-side reach clears the cell bottom.
        h = math.radians(-45 * direction - 90)
        rig["fall"].location = (0.6 * math.sin(h), -0.95 + 0.6 * math.cos(h), 0.14)
        reach = math.sin(t * math.tau)
        set_legs(rig, (15 + 20 * reach, -40 - 25 * max(0, reach)), (15 - 20 * reach, -40 - 25 * max(0, -reach)), 0.95)
        set_arms(rig, (125 + 20 * reach, 30, 50 - 20 * reach), (125 - 20 * reach, -30, 50 + 20 * reach))
        head.rotation_euler = Euler((rad(-30), 0, 0))
        return True
    if state == "cheer":
        place(musket, RAM)
        set_arms(rig, ((165, 20, 12), (140, 28, 40))[frame], (38, -14, 36))
        set_legs(rig, (0, 0), (0, 0), 0.95)
        head.rotation_euler = Euler((rad(-14), 0, 0))
        return True
    if state in ("look", "adjust", "lean"):
        breath = math.cos(t * math.tau)
        set_legs(rig, (0, 0), (0, 0), 0.95 + 0.004 * breath)
        if state == "lean":
            place(musket, RAM)
            set_arms(rig, (48, 18, 22), (52, -16, 20))
            torso.rotation_euler = Euler((rad(6 + 1.5 * breath), 0, 0))
            return True
        place(musket, CARRY)
        if state == "look":
            head.rotation_euler = Euler((0, 0, rad((16, 40, -16, -40)[frame])))
            set_arms(rig, (4, 6, 10), (18, -8, 42))
        else:
            # Right hand goes up to set the shako straight.
            set_arms(rig, ((30, 10, 60), (110, 20, 110), (140, 24, 120), (70, 16, 70))[frame], (18, -8, 42))
            head.rotation_euler = Euler((0, rad((0, -4, -6, -2)[frame]), 0))
        return True
    return False


def hide_render_tree(obj, hidden: bool) -> None:
    obj.hide_render = hidden
    for child in obj.children:
        hide_render_tree(child, hidden)


def place(obj, placement):
    loc, rot = placement
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])


def pose(rig: dict, state: str, frame: int, frames: int, direction: int = 0) -> None:
    sh_r, el_r, th_r, kn_r = rig["joints"]["R"]
    sh_l, el_l, th_l, kn_l = rig["joints"]["L"]
    rad = math.radians
    for obj in rig["flash"]:
        obj.hide_render = True
    rig["pan"].hide_render = True
    rig["ramrod"].hide_render = True
    rig["torso"].rotation_euler = Euler((0, 0, 0))
    rig["head"].rotation_euler = Euler((0, 0, 0))
    rig["fall"].rotation_euler = Euler((0, 0, 0))
    rig["fall"].location = (0, 0, 0)
    if rig.get("armed", True):
        for name in ("butt", "stock", "barrel", "lock", "band", "sling", "bayonet"):
            for obj in rig["musket"].children:
                if obj.name.split(".")[0] == name:
                    obj.hide_render = False
    if pose_extra(rig, state, frame, frames, direction):
        return
    if state in DEATHS:
        death = DEATHS[state]
        tilt, twist, lift, hips_z, thigh, knee, (rx, ry), (lx, ly), elbow, lean, musket = death["frames"][frame]
        turn = rad(twist * fall_twist(direction, death["head"]))
        topple = (rad(tilt), 0, turn) if death["axis"] == "x" else (0, rad(tilt), turn)
        rig["fall"].rotation_euler = Euler(topple)
        rig["fall"].location.z = lift
        rig["hips"].location.z = hips_z
        for th, kn in ((th_r, kn_r), (th_l, kn_l)):
            th.rotation_euler = Euler((rad(thigh), 0, 0))
            kn.rotation_euler = Euler((rad(knee), 0, 0))
        sh_r.rotation_euler = Euler((rad(rx), rad(ry), 0))
        sh_l.rotation_euler = Euler((rad(lx), rad(ly), 0))
        el_r.rotation_euler = el_l.rotation_euler = Euler((rad(elbow), 0, 0))
        rig["torso"].rotation_euler = Euler((rad(lean), 0, 0))
        place(rig["musket"], musket)
        return
    if state in DRILL:
        musket, (rx, ry, re), (lx, ly, le), lean, flash, ram = DRILL[state][frame]
        place(rig["musket"], musket)
        sh_r.rotation_euler = Euler((rad(rx), rad(ry), 0))
        el_r.rotation_euler = Euler((rad(re), 0, 0))
        sh_l.rotation_euler = Euler((rad(lx), rad(ly), 0))
        el_l.rotation_euler = Euler((rad(le), 0, 0))
        rig["torso"].rotation_euler = Euler((rad(lean), 0, 0))
        # Firing stance: right foot drawn back, knees soft.
        rig["hips"].location.z = 0.94
        th_r.rotation_euler = Euler((rad(-14), 0, 0))
        th_l.rotation_euler = Euler((rad(9), 0, 0))
        kn_r.rotation_euler = Euler((rad(-6), 0, 0))
        kn_l.rotation_euler = Euler((rad(-8), 0, 0))
        if flash == 3:
            rig["pan"].hide_render = False
        elif flash:
            for obj in rig["flash"]:
                obj.hide_render = False
                obj.scale = (1, 1, 1) if flash == 2 else (0.55, 0.55, 0.55)
        if ram is not None:
            rig["ramrod"].hide_render = False
            rig["ramrod"].location.z = 1.75 + ram
        return
    place(rig["musket"], CARRY)
    # Left arm holds the musket butt while carrying.
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
    ap.add_argument("--variant", type=int, choices=sorted(VARIANTS), default=1)
    ap.add_argument("--out", default="art/frames/iso-proof")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--states", nargs="*", help="render only these states (review)")
    ap.add_argument("--supersample", type=int, default=2,
                    help="render N x larger; pack-iso-atlas.py averages back down for cleaner edges")
    args = ap.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render(args.samples)
    ss = args.supersample
    camera(FRAME_W * ss, FRAME_H * ss, SPRITE_PX_PER_M * ss, (PIVOT[0] * ss, PIVOT[1] * ss))
    # Small shadow catcher under the feet: its edge stays inside the frame.
    shadow_catcher("ground", [(0.2 + 0.85 * math.cos(a / 24 * math.tau), 0.05 + 0.85 * math.sin(a / 24 * math.tau)) for a in range(24)])
    rig = build_soldier(args.side, args.variant)
    # Variant 1 keeps the original names; others get their own folder/prefix.
    suffix = "" if args.variant == 1 else str(args.variant)
    out = Path(args.out).resolve() / (args.side + suffix)
    out.mkdir(parents=True, exist_ok=True)
    prefix = ("fr" if args.side == "france" else "br") + suffix
    muzzle = {"fire": {}, "kfire": {}}
    for d, name in enumerate(DIRECTIONS):
        # Model faces +Y; screen direction d is clockwise from east.
        rig["root"].rotation_euler = Euler((0, 0, math.radians(-45 * d - 90)))
        for state, frames in STATES:
            if args.states and state not in args.states:
                continue
            for f in range(frames):
                pose(rig, state, f, frames, d)
                bpy.context.view_layer.update()
                if state in muzzle and f == 1:
                    # Screen pixel of the muzzle (output scale), so the lab spawns smoke exactly there.
                    p = rig["musket"].matrix_world @ Vector((0, 0.032, MUZZLE_Z))
                    muzzle[state][name] = {"x": round(PIVOT[0] + p.x * SPRITE_PX_PER_M, 1),
                                           "y": round(PIVOT[1] - screen_up(p) * SPRITE_PX_PER_M, 1)}
                bpy.context.scene.render.filepath = str(out / f"{prefix}_iso_{state}_{name}_{f + 1:02d}.png")
                bpy.ops.render.render(write_still=True)
    if any(muzzle.values()):
        previous = json.loads((out / "muzzle.json").read_text()) if (out / "muzzle.json").exists() else {}
        previous.update({k: v for k, v in muzzle.items() if v})
        (out / "muzzle.json").write_text(json.dumps(previous, indent=1) + "\n")
    print(f"{args.side}: {len(DIRECTIONS) * sum(n for _, n in STATES)} frames -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
