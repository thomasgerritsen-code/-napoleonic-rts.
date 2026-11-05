#!/usr/bin/env python3
"""Render a light cavalryman (horse and rider) for the Graphics Lab iso scene.

Same camera, sun and 30° view as the infantry (render-iso-infantry.py).
- horse: procedural anatomy — chest, withers, barrel and rounded hindquarters
  with haunch and shoulder muscles, an arched neck with crest and mane, a head
  carried forward and down (cranium, cheeks, tapering face, muzzle, nostrils,
  ears, eyes, forelock, bridle and bit), legs with forearm/gaskin, knee and
  hock, slim cannons with tendons, fetlocks, sloping pasterns and hooves, and
  black points on bays and blacks; a shaped saddle on a draped shabraque with
  lace border, holsters and rolled cloak; coat colours bay (variant 1) and
  black / grey (variant 2);
- rider: the fusilier body as a chasseur à cheval (French green with red) or a
  light dragoon (British blue with buff), without pack or musket, with a sabre.
States in 8 directions, 224x192 cells with the hooves' centre at (112,152):
  cavalry:  idle 2, walk 6, trot 6
  cavfight: gallop 6, slash 3, rear 2, die 4 (horse and rider go down together)
--role officer / trumpeter renders the squadron's officer and trumpeter.
--kind renders a period regiment instead of the light trooper:
  cuirassier (France): steel cuirass, crested helmet with horsehair mane, black horse;
  lancer (France): Polish lancer of the Guard in a czapka, with a pennoned lance;
  greys (Britain): Royal North British Dragoons in bearskins on grey horses.

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
STATES = [("idle", 2), ("walk", 6), ("trot", 6), ("gallop", 6), ("slash", 3), ("rear", 2), ("die", 4)]
# Squadron roles: the officer has gold lace and epaulettes; the trumpeter rides a
# grey in reversed colours and sounds the charge instead of cutting.
ROLES = {"trooper": "", "officer": "o", "trumpeter": "t"}
GOLD = "#d4ad45"
TRUMPETER_COAT = {"france": "#8f1d2c", "britain": "#b3262b"}
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
# Period regiments (--kind): uniform overrides, horse coat and the folder suffix.
KINDS = {
    "light": {"suffix": ""},
    "cuirassier": {"side": "france", "suffix": "k", "horse": COATS[2],
                   "uniform": {"coat": "#1f2b55", "lapel": "#1f2b55", "collar": "#b3262b", "cuff": "#b3262b",
                               "turnback": "#b3262b", "breeches": "#e9e2cf", "strap": "#1f2b55",
                               "cloth": "#1f2b55", "lace": "#e9e2cc", "pompom": "#b3262b"}},
    "lancer": {"side": "france", "suffix": "l", "horse": COATS[1],
               "uniform": {"coat": "#1d2650", "lapel": "#a3203a", "collar": "#a3203a", "cuff": "#a3203a",
                           "turnback": "#a3203a", "breeches": "#1d2650", "strap": "#1d2650",
                           "cloth": "#1d2650", "lace": "#a3203a", "pompom": "#f1ebdd"}},
    "greys": {"side": "britain", "suffix": "g", "horse": GREY,
              "uniform": {"coat": "#b3262b", "lapel": "#b3262b", "collar": "#24315c", "cuff": "#24315c",
                          "turnback": "#24315c", "breeches": "#8c9095", "strap": "#b3262b",
                          "cloth": "#24315c", "lace": "#d8b54a", "pompom": "#f1ebdd"}},
}
HEADGEAR = ("shako", "lid", "visor", "plate", "chinscale", "plume", "band", "pompom", "cord")
HIP_Z = 1.02
HEAD_TILT = -112   # head relative to the neck, degrees about X


def hide_tree(obj, hidden=True) -> None:
    obj.hide_render = hidden
    for child in obj.children:
        hide_tree(child, hidden)


def draped(name, rx, rz, angle, y0, y1, mat, parent, point=0.0, zc=0.2):
    """Cloth sheet following the horse's back: an elliptic arc from -angle to +angle
    (degrees from the top) around the barrel axis, from y0 (rear) to y1; the rear
    edge comes to a point `point` metres further back at the lower corners."""
    rows, cols = 6, 16
    verts, faces = [], []
    for i in range(rows + 1):
        u = i / rows
        for j in range(cols + 1):
            a = math.radians(-angle + 2 * angle * j / cols)
            edge = abs(j / cols - 0.5) * 2
            y = y0 - point * edge if i == 0 else y0 + (y1 - y0) * u
            verts.append((rx * math.sin(a), y, zc + rz * math.cos(a)))
    for i in range(rows):
        for j in range(cols):
            k = i * (cols + 1) + j
            faces.append((k, k + 1, k + cols + 2, k + cols + 1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj.parent = parent
    return obj


def build_horse(side: str, variant: int, role: str = "trooper", kind: str = "light") -> dict:
    coat_hex, dark_hex = GREY if (side == "britain" and variant == 2) or role == "trumpeter" else COATS[variant]
    if "horse" in KINDS[kind]:
        coat_hex, dark_hex = KINDS[kind]["horse"]
    coat = material(coat_hex, 0.55, pattern="skin")
    dark = material(dark_hex, 0.6, pattern="skin")
    hoof = material("#1a1714", 0.5, pattern="plain")
    leather = material("#3a2414", 0.5, pattern="plain")
    colours = KINDS[kind].get("uniform", UNIFORM[side])
    cloth = material(colours["cloth"], 0.85, pattern="cloth")
    lace = material(GOLD if role == "officer" else colours["lace"], 0.4 if role == "officer" else 0.7,
                    0.7 if role == "officer" else 0.0, pattern="plain")
    steel = material("#c7ccd0", 0.25, 0.9, pattern="plain")

    # Black points (lower legs, mane, tail) on bays and blacks; a grey keeps its coat.
    points = coat if coat_hex == GREY[0] else dark
    root = empty("root")
    fall = empty("fall", root)          # whole horse and rider topple through this
    body = empty("body", fall, (0, 0, HIP_Z))   # pitch (gallop/rear) about the hips
    # Trunk: chest and shoulders, barrel, withers and the rounder hindquarters.
    part("ball", (0.33, 0.85, 1.9, 1.0), (0, 0.0, 0.12), coat, body, name="barrel", segments=28)
    part("ball", (0.3, 0.86, 1.0, 1.2), (0, 0.5, 0.12), coat, body, rot=(-18, 0, 0), name="chestball", segments=24)
    part("ball", (0.13, 1.0, 2.1, 1.0), (0, 0.32, 0.43), coat, body, rot=(-12, 0, 0), name="withers", segments=16)
    part("ball", (0.33, 0.92, 1.12, 1.0), (0, -0.48, 0.2), coat, body, name="rump", segments=24)
    for x in (0.16, -0.16):
        # Hind thigh muscle and the point of the shoulder.
        part("ball", (0.14, 1.0, 1.5, 2.1), (x, -0.56, -0.02), coat, body, rot=(14, 0, 0), name="haunch", segments=16)
        part("ball", (0.12, 1.0, 1.2, 1.6), (x, 0.56, 0.02), coat, body, rot=(-20, 0, 0), name="shoulder", segments=16)
    # Arched neck with a crest and a mane falling to the right.
    neck = empty("neck", body, (0, 0.6, 0.36), (-38, 0, 0))
    part("cyl", (0.2, 0.78, 0.115), (0, 0, 0.34), coat, neck, name="neckmesh", segments=20)
    part("ball", (0.1, 0.8, 1.0, 4.0), (0, -0.07, 0.38), coat, neck, rot=(5, 0, 0), name="crest", segments=14)
    for i in range(7):
        part("box", (0.03, 0.06, 0.13), (0.035, -0.12 + i * 0.006, 0.08 + i * 0.1), points, neck,
             rot=(4, 18 + (i % 2) * 8, 0), name="mane")
    # Head: cranium, cheeks, a long tapering face and the muzzle with nostrils.
    # Head carried forward and down (face about 55° below horizontal): its +z runs
    # from the poll to the muzzle, -y is the front of the face, +y the jaw side.
    head = empty("head", neck, (0, 0.0, 0.74), (HEAD_TILT, 0, 0))
    part("ball", (0.11, 1.0, 1.05, 1.15), (0, 0.0, 0.05), coat, head, name="cranium", segments=16)
    part("ball", (0.12, 0.85, 1.1, 1.15), (0, 0.045, 0.14), coat, head, name="cheek", segments=16)
    part("ball", (0.08, 0.95, 1.0, 2.6), (0, -0.03, 0.32), coat, head, name="face", segments=16)
    part("ball", (0.075, 1.0, 1.0, 0.95), (0, 0.0, 0.5), points if coat_hex != GREY[0] else coat, head,
         name="muzzle", segments=14)
    for x in (0.04, -0.04):
        part("ball", (0.017,), (x, -0.05, 0.53), material("#0e0c0b", 0.4, pattern="plain"), head, name="nostril",
             segments=8)
    for x in (0.055, -0.055):
        part("cyl", (0.032, 0.15, 0.004), (x, -0.02, -0.09), coat, head, rot=(-150, math.copysign(10, x), 0),
             name="ear", segments=8)
        part("ball", (0.02,), (x * 1.6, -0.02, 0.1), material("#111111", 0.3, pattern="plain"), head, name="eye",
             segments=8)
    part("box", (0.05, 0.03, 0.1), (0, -0.08, 0.02), points, head, rot=(20, 0, 0), name="forelock")
    # Bridle: headpiece, browband, noseband, bit and the reins to the rider's hands.
    part("box", (0.24, 0.02, 0.03), (0, -0.03, 0.0), leather, head, name="browband")
    part("box", (0.17, 0.16, 0.03), (0, -0.005, 0.4), leather, head, name="noseband")
    for x in (0.1, -0.1):
        part("box", (0.012, 0.012, 0.42), (x, 0.0, 0.22), leather, head, name="cheekpiece")
    part("cyl", (0.012, 0.2), (0, 0.03, 0.47), material("#9aa0a4", 0.3, 0.8, pattern="plain"), head, rot=(0, 90, 0),
         name="bit")
    part("box", (0.012, 0.012, 0.7), (0, 0.17, 0.22), leather, neck, rot=(-25, 0, 0), name="reins")
    # Tail: dock from the croup, then a full switch that tapers to the tips.
    tail = empty("tail", body, (0, -0.84, 0.4), (170, 0, 0))
    part("cyl", (0.055, 0.24, 0.045), (0, 0, 0.1), points if coat_hex != GREY[0] else dark, tail, name="tailroot",
         segments=12)
    part("ball", (0.075, 0.9, 0.75, 4.6), (0, 0.02, 0.52), dark, tail, name="tailmesh", segments=14)
    part("ball", (0.05, 1.0, 1.0, 3.0), (0, -0.02, 0.85), dark, tail, rot=(6, 0, 0), name="tailtip", segments=10)
    # Saddle cloth (shabraque) draped over the back and down the flanks, with a
    # lace border and a pointed rear corner; a shaped saddle, rolled cloak and holsters.
    draped("shabraque_lace", 0.296, 0.352, 74, -0.66, 0.16, lace, body, point=0.1, zc=0.12)
    draped("shabraque", 0.3, 0.356, 70, -0.63, 0.13, cloth, body, point=0.1, zc=0.12)
    part("box", (0.28, 0.42, 0.05), (0, -0.03, 0.49), leather, body, name="saddle")
    part("box", (0.22, 0.07, 0.13), (0, 0.2, 0.53), leather, body, rot=(-15, 0, 0), name="pommel")
    part("box", (0.28, 0.06, 0.15), (0, -0.26, 0.54), leather, body, rot=(12, 0, 0), name="cantle")
    for x in (0.26, -0.26):
        part("box", (0.02, 0.3, 0.28), (x, 0.0, 0.36), leather, body, rot=(0, math.copysign(18, x), 0), name="flap")
    part("cyl", (0.065, 0.48), (0, -0.37, 0.56), material("#a9a59c", 0.85, pattern="cloth"), body, rot=(0, 90, 0),
         name="cloak")
    for x in (0.18, -0.18):
        part("cyl", (0.045, 0.2), (x, 0.38, 0.44), leather, body, rot=(-60, 0, 0), name="holster")
    legs = {}
    for key, (x, y) in LEGS.items():
        fore = key[0] == "F"
        # Pivot at the elbow / stifle; the legs reach the ground with the hooves flat.
        hip = empty("hip" + key, body, (x, y, -0.08 if fore else -0.06))
        # Hind legs: the gaskin slopes back to the hock, the cannon stands upright.
        slope = 0 if fore else 18
        rest = empty("rest" + key, hip, (0, 0, 0), (-slope, 0, 0))
        upper = 0.42 if fore else 0.43
        part("cyl", (0.088 if fore else 0.1, upper, 0.055), (0, 0, -upper / 2), coat, rest, name="upperleg", segments=14)
        knee = empty("knee" + key, rest, (0, 0, -upper))
        straight = empty("straight" + key, knee, (0, 0, 0), (slope, 0, 0))
        part("ball", (0.052, 1.1, 0.95, 1.0), (0, 0.005, 0), points if not fore else coat, straight, name="joint",
             segments=12)
        if not fore:
            part("ball", (0.04,), (0, -0.06, 0.03), coat, straight, name="hockpoint", segments=10)
        cannon = 0.35 if fore else 0.38
        part("cyl", (0.04, cannon, 0.036), (0, -0.006, -cannon / 2), points, straight, name="cannon", segments=12)
        part("box", (0.03, 0.03, cannon * 0.8), (0, -0.03, -cannon / 2), points, straight, name="tendon")
        fetlock = empty("fetlock" + key, straight, (0, 0, -cannon))
        part("ball", (0.048, 1.0, 1.1, 0.9), (0, -0.01, 0), points, fetlock, name="fetlockjoint", segments=12)
        part("cyl", (0.036, 0.15, 0.04), (0, 0.04, -0.065), points, fetlock, rot=(30, 0, 0), name="pastern", segments=12)
        part("cyl", (0.05, 0.08, 0.066), (0, 0.085, -0.13), hoof, fetlock, name="hoof", segments=14)
        legs[key] = (hip, knee, fetlock)
    saddle = empty("saddle", body, (0, -0.02, 0.56))
    return {"root": root, "fall": fall, "body": body, "neck": neck, "head": head, "tail": tail, "legs": legs,
            "saddle": saddle, "steel": steel, "leather": leather}


def build_rider(side: str, horse: dict, role: str = "trooper", kind: str = "light") -> dict:
    rig = infantry.build_soldier(side, 1)
    hide_tree(rig["musket"])
    rig["armed"] = False
    for obj in bpy.data.objects:
        if obj.name.split(".")[0] in STRIPPED:
            obj.hide_render = True
    colours = dict(KINDS[kind].get("uniform", UNIFORM[side]))
    if role == "trumpeter":
        colours["coat"] = colours["lapel"] = TRUMPETER_COAT[side]
    mats = {k: material(v, 0.8, pattern="cloth") for k, v in colours.items()}
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
    gold = material(GOLD, 0.35, 0.8, pattern="plain")
    sh_r, _, _, _ = rig["joints"]["R"]
    if role == "officer":
        sh_l = rig["joints"]["L"][0]
        for sh in (sh_r, sh_l):
            part("cyl", (0.075, 0.05, 0.09), (0, 0, 0.0), gold, sh, name="epaulette")
        part("cyl", (0.1, 0.03, 0.105), (0, 0, 0.245), gold, rig["head"], name="shakoband")
        part("cyl", (0.17, 0.1, 0.16), (0, 0, 0.02), material("#c9a33c" if side == "france" else "#8f1d2c", 0.7,
             pattern="cloth"), torso, name="sash")
    head = rig["head"]
    if kind != "light":
        for obj in bpy.data.objects:
            if obj.name.split(".")[0] in HEADGEAR and obj.parent == head:
                obj.hide_render = True
    if kind == "cuirassier":
        # Steel cuirass (breast and back plates) and the crested helmet with a
        # black horsehair mane and a red plume.
        steel = horse["steel"]
        brass = material("#c9a33c", 0.3, 0.85, pattern="plain")
        part("ball", (0.2, 1.08, 0.82, 1.15), (0, 0.035, 0.38), steel, torso, name="cuirass", segments=20)
        part("box", (0.36, 0.05, 0.03), (0, 0.0, 0.62), brass, torso, name="cuirassrim")
        part("ball", (0.112, 1.0, 1.05, 0.9), (0, -0.005, 0.13), steel, head, name="helmet", segments=18)
        part("cyl", (0.122, 0.035), (0, 0, 0.07), material("#2a2018", 0.8, pattern="cloth", scale=3), head, name="turban")
        part("box", (0.025, 0.2, 0.08), (0, -0.01, 0.25), brass, head, name="crest")
        part("box", (0.03, 0.08, 0.36), (0, -0.13, 0.08), material("#141210", 0.9, pattern="cloth"), head,
             rot=(-14, 0, 0), name="horsehair")
        part("cyl", (0.022, 0.2, 0.034), (-0.1, 0.02, 0.24), material("#b3262b", 0.8, pattern="cloth"), head,
             name="kplume")
        part("box", (0.13, 0.05, 0.012), (0, 0.105, 0.075), brass, head, rot=(-12, 0, 0), name="kvisor")
    elif kind == "lancer":
        # Czapka: the Polish cap with its square top, white plume; and the lance with
        # a red-over-white pennant (the sabre blade is hidden, the lance takes its place).
        crimson = material("#a3203a", 0.8, pattern="cloth")
        part("cyl", (0.098, 0.13, 0.085), (0, 0, 0.12), material("#171717", 0.4, pattern="plain"), head, name="czapka")
        part("cyl", (0.085, 0.04, 0.06), (0, 0, 0.2), crimson, head, name="czapkawaist")
        part("box", (0.19, 0.19, 0.07), (0, 0, 0.255), crimson, head, rot=(0, 0, 45), name="czapkatop")
        part("cyl", (0.025, 0.18, 0.038), (-0.07, 0.04, 0.37), material("#f1ebdd", 0.8, pattern="cloth"), head,
             name="lplume")
        part("box", (0.13, 0.06, 0.014), (0, 0.1, 0.075), material("#171717", 0.4, pattern="plain"), head,
             rot=(-12, 0, 0), name="lvisor")
        for obj in rig["sabre"].children:
            obj.hide_render = True
        lance = empty("lance", rig["sabre"])
        part("cyl", (0.016, 2.3), (0, 0.03, -0.25), material("#5d3d22", 0.6, pattern="bark", scale=2.5), lance,
             name="pole", segments=8)
        part("cyl", (0.02, 0.16, 0.003), (0, 0.03, -1.47), horse["steel"], lance, rot=(180, 0, 0), name="lancetip",
             segments=8)
        part("box", (0.006, 0.22, 0.06), (0, 0.15, -1.27), material("#b3262b", 0.85, pattern="cloth"), lance,
             name="pennant")
        part("box", (0.006, 0.22, 0.06), (0, 0.15, -1.21), material("#f1ebdd", 0.85, pattern="cloth"), lance,
             name="pennant")
    elif kind == "greys":
        # Scots Greys: the tall bearskin with a white plume on the left.
        fur = material("#141210", 0.95, pattern="cloth", scale=3)
        part("cyl", (0.108, 0.36, 0.126), (0, -0.01, 0.2), fur, head, name="bearskin", segments=20)
        part("ball", (0.126, 1, 1, 0.45), (0, -0.01, 0.38), fur, head, name="bearskintop")
        part("cyl", (0.028, 0.24, 0.036), (-0.1, 0.02, 0.36), material("#f1ebdd", 0.8, pattern="cloth"), head,
             name="gplume")
        part("box", (0.012, 0.012, 0.14), (0.07, 0.09, 0.2), material("#d8b54a", 0.4, 0.6, pattern="plain"), head,
             rot=(0, 40, 0), name="gcord")
    rig["kind"] = kind
    rig["trumpets"] = []
    if role == "trumpeter":
        brass = material("#d9b45a", 0.3, 0.85, pattern="plain")
        for name, parent, loc, rot in (("trumpet_hip", torso, (0.24, 0.02, -0.12), (0, 10, 0)),
                                       ("trumpet_play", el_r, (0, 0.02, -0.3), (0, 0, 0))):
            t = empty(name, parent, loc, rot)
            part("cyl", (0.013, 0.5), (0, 0, 0.25), brass, t, name="tube", segments=10)
            part("cyl", (0.012, 0.16, 0.06), (0, 0, 0.56), brass, t, name="bell", segments=16)
            part("cyl", (0.016, 0.05), (0, 0, -0.01), brass, t, name="mouthpiece", segments=8)
            rig["trumpets"].append(t)
    rig["role"] = role
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
    head.rotation_euler = Euler((rad(HEAD_TILT), 0, 0))
    tail.rotation_euler = Euler((rad(170), 0, 0))
    for key in LEGS:
        leg(horse, key, 0, 0)
    sh_r, el_r, th_r, kn_r = rider["joints"]["R"]
    sh_l, el_l, th_l, kn_l = rider["joints"]["L"]
    # Seat: thighs forward and apart around the horse, lower legs down along its flanks.
    th_r.rotation_euler = Euler((rad(58), rad(-22), 0))
    th_l.rotation_euler = Euler((rad(58), rad(22), 0))
    kn_r.rotation_euler = kn_l.rotation_euler = Euler((rad(-78), 0, 0))
    rider["hips"].location.z = 0.95
    # Left hand holds the reins; sabre sloped against the right shoulder.
    sh_l.rotation_euler = Euler((rad(38), rad(-8), 0))
    el_l.rotation_euler = Euler((rad(58), 0, 0))
    sh_r.rotation_euler = Euler((rad(24), rad(10), 0))
    el_r.rotation_euler = Euler((rad(92), 0, 0))
    rider["sabre"].rotation_euler = Euler((rad(78), 0, 0))
    torso = rider["torso"]
    # The trumpeter carries the trumpet at his hip and blows it in the charge.
    blowing = rider["role"] == "trumpeter" and state in ("gallop", "slash")
    if rider["trumpets"]:
        hide_tree(rider["trumpets"][0], blowing)
        hide_tree(rider["trumpets"][1], not blowing)
        hide_tree(rider["sabre"], rider["role"] == "trumpeter")
    if state == "idle":
        # Head lowered and raised, tail swish.
        neck.rotation_euler = Euler((rad((-38, -46)[frame]), 0, 0))
        tail.rotation_euler = Euler((rad(170), rad((-10, 10)[frame]), 0))
        leg(horse, "HL", 4, 6, -4)
        return
    if state == "walk":
        # Four-beat walk: left hind, left fore, right hind, right fore.
        gait(horse, t, {"HL": 0.0, "FL": 0.25, "HR": 0.5, "FR": 0.75}, 18, 38)
        neck.rotation_euler = Euler((rad(-38 - 4 * math.sin(t * math.tau * 2)), 0, 0))
        body.location = (0, 0, HIP_Z - 0.02 * abs(math.sin(t * math.tau * 2)))
        return
    if state == "trot":
        # Two-beat trot on diagonal pairs; the body bounces twice per stride and
        # the rider rises to the trot.
        gait(horse, t, {"FL": 0.0, "HR": 0.0, "FR": 0.5, "HL": 0.5}, 26, 58)
        body.location = (0, 0, HIP_Z + 0.03 * math.cos(t * math.tau * 2))
        neck.rotation_euler = Euler((rad(-34), 0, 0))
        tail.rotation_euler = Euler((rad(160), 0, 0))
        rider["hips"].location.z = 0.95 + (0.06 if math.sin(t * math.tau) > 0 else 0.0)
        torso.rotation_euler = Euler((rad(8), 0, 0))
        return
    if state == "gallop":
        # Transverse gallop with suspension: hinds, then fores; the body rocks.
        gait(horse, t, {"HL": 0.0, "HR": 0.12, "FL": 0.42, "FR": 0.54}, 38, 75)
        pitch = 6 * math.sin(t * math.tau)
        body.rotation_euler = Euler((rad(pitch), 0, 0))
        body.location = (0, 0, HIP_Z + 0.06 * max(0.0, math.sin(t * math.tau + 1.2)))
        neck.rotation_euler = Euler((rad(-28 - 8 * math.sin(t * math.tau)), 0, 0))
        tail.rotation_euler = Euler((rad(140), 0, 0))
        # Rider leans forward, sabre levelled at the enemy (the trumpeter sounds the charge).
        torso.rotation_euler = Euler((rad(22 - pitch), 0, 0))
        if blowing:
            trumpet_to_lips(rider, rad)
            return
        sh_r.rotation_euler = Euler((rad(92), rad(4), 0))
        el_r.rotation_euler = Euler((rad(4), 0, 0))
        rider["sabre"].rotation_euler = Euler((rad(-4), 0, 0))
        return
    if state == "slash":
        # Cut: sabre raised, swept across, down; the horse stamps.
        leg(horse, "FR", (10, 26, 4)[frame], (-30, -60, -10)[frame])
        if blowing:
            torso.rotation_euler = Euler((rad((20, 22, 24)[frame]), 0, 0))
            trumpet_to_lips(rider, rad)
            return
        if rider.get("kind") == "lancer":
            # Thrust: the lance drawn back, driven forward, recovered.
            torso.rotation_euler = Euler((rad((10, 26, 18)[frame]), 0, rad((12, -6, 0)[frame])))
            sh_r.rotation_euler = Euler((rad((70, 96, 88)[frame]), rad(4), 0))
            el_r.rotation_euler = Euler((rad((40, 2, 14)[frame]), 0, 0))
            rider["sabre"].rotation_euler = Euler((rad((-10, -4, -6)[frame]), 0, 0))
            return
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
        if rider.get("kind") == "lancer":
            return
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


def trumpet_to_lips(rider, rad) -> None:
    """Right hand at the mouth, trumpet pointing forward and a little up."""
    sh_r, el_r, _, _ = rider["joints"]["R"]
    sh_r.rotation_euler = Euler((rad(62), rad(26), 0))
    el_r.rotation_euler = Euler((rad(118), 0, 0))
    rider["trumpets"][1].rotation_euler = Euler((rad(-150), 0, 0))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--side", choices=sorted(infantry.PALETTES), required=True)
    ap.add_argument("--variant", type=int, choices=sorted(COATS), default=1)
    ap.add_argument("--role", choices=sorted(ROLES), default="trooper")
    ap.add_argument("--kind", choices=sorted(KINDS), default="light")
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
    if KINDS[args.kind].get("side", args.side) != args.side:
        ap.error(f"{args.kind} rides for {KINDS[args.kind]['side']}")
    horse = build_horse(args.side, args.variant, args.role, args.kind)
    rider = build_rider(args.side, horse, args.role, args.kind)
    suffix = KINDS[args.kind]["suffix"] or ROLES[args.role] or ("" if args.variant == 1 else str(args.variant))
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
