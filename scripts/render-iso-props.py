#!/usr/bin/env python3
"""Render isometric buildings and nature props for the Graphics Lab iso scene.

Every prop is an original model built from primitives in this script and
rendered once with the shared iso camera/sun (iso_blender_common.py) at the
soldier sprite scale, with its own short contact shadow. Output: one PNG per
prop type plus props.json with size and ground pivot.

  python scripts/render-iso-props.py --out graphics-lab/assets/iso/props
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from infantry_atlas_png import read_rgba, write_rgba  # noqa: E402
from iso_blender_common import (RIGHT, SPRITE_PX_PER_M, camera, empty, material, part,  # noqa: E402
                                prism, screen_up, setup_render, shadow_catcher)

SHADOW = Vector((0.707, -0.707)) * 0.49   # ground shadow offset per metre of height
ALPHA_FLOOR = 16


def M(hex_color, pattern="cloth", rough=0.85, scale=1.0, alt=None, metal=0.0):
    return material(hex_color, rough, metal, pattern=pattern, scale=scale, alt=alt)


# --- building kit ---------------------------------------------------------------
def windows(root, width, depth, z_rows, count, frame="#e9e4d6", glass="#283036", shutters=None, gable=1):
    for z in z_rows:
        # Gable-end windows so a corner view shows two finished facades.
        for gx, sgn in ((-width / 2, -1), (width / 2, 1)):
            for j in range(gable):
                y = -depth / 2 + depth * (j + 0.5) / gable
                part("box", (0.06, 0.95, 1.25), (gx + sgn * 0.02, y, z), M(frame, "plain", 0.6), root, name="frame")
                part("box", (0.07, 0.75, 1.05), (gx + sgn * 0.035, y, z), M(glass, "plain", 0.25), root, name="glass")
        for i in range(count):
            x = -width / 2 + width * (i + 0.5) / count
            for y, sgn in ((-depth / 2, -1), (depth / 2, 1)):
                part("box", (0.95, 0.06, 1.25), (x, y + sgn * 0.02, z), M(frame, "plain", 0.6), root, name="frame")
                part("box", (0.75, 0.07, 1.05), (x, y + sgn * 0.035, z), M(glass, "plain", 0.25), root, name="glass")
                part("box", (0.06, 0.08, 1.05), (x, y + sgn * 0.04, z), M(frame, "plain", 0.6), root, name="mullion")
                if shutters:
                    for sx in (-0.62, 0.62):
                        part("box", (0.36, 0.06, 1.15), (x + sx, y + sgn * 0.03, z), M(shutters, "planks", 0.8), root, name="shutter")


def house(root, width, depth, height, wall, roof, roof_pat="tiles", roof_h=None, plinth="#8f897b",
          wall_pat="plaster", chimneys=(), overhang=0.45):
    part("box", (width + 0.2, depth + 0.2, 0.7), (0, 0, 0.35), M(plinth, "wall", 0.9, alt="#6e695e"), root, name="plinth")
    part("box", (width, depth, height - 0.7), (0, 0, 0.7 + (height - 0.7) / 2), M(wall, wall_pat, 0.92, alt="#8c8578"), root, name="walls")
    rh = roof_h or depth * 0.55
    prism("roof", width + overhang * 2, depth + overhang * 2, rh, M(roof, roof_pat, 0.8), (0, 0, height), root)
    part("box", (width + overhang * 2 + 0.1, 0.22, 0.18), (0, 0, height + rh - 0.02), M(roof, "plain", 0.8), root, name="ridge")
    for cx in chimneys:
        part("box", (0.7, 0.7, rh + 1.1), (cx, 0.4, height + (rh + 1.1) / 2), M("#8a5a44", "wall", 0.9, scale=2.5, alt="#6b5a4c"), root, name="chimney")
        part("box", (0.85, 0.85, 0.15), (cx, 0.4, height + rh + 1.15), M("#5d4a3e", "plain"), root, name="cap")
    return rh


def door(root, x, y, w=1.2, h=2.2, color="#4d3322"):
    part("box", (w + 0.3, 0.1, h + 0.25), (x, y - 0.03, h / 2 + 0.6), M("#d9d2bf", "plain"), root, name="doorframe")
    part("box", (w, 0.12, h), (x, y - 0.05, h / 2 + 0.6), M(color, "planks", 0.75), root, name="door")


def flag(root, x, y, colors, union=False):
    part("cyl", (0.06, 9.5, 0.04), (x, y, 4.75), M("#d8d2c4", "plain", 0.5), root, name="pole")
    part("ball", (0.12,), (x, y, 9.55), M("#c9a33c", "plain", 0.3, metal=0.9), root, name="finial")
    fw, fh = 2.2, 1.45
    if union:
        part("box", (fw, 0.05, fh), (x + fw / 2, y, 8.6), M("#22336b", "cloth", 0.9), root, name="flag")
        for a in (33, -33):
            part("box", (2.5, 0.06, 0.18), (x + fw / 2, y, 8.6), M("#f2efe6", "cloth"), root, rot=(0, a, 0), name="saltire")
        part("box", (fw, 0.07, 0.34), (x + fw / 2, y, 8.6), M("#f2efe6", "cloth"), root, name="cross")
        part("box", (0.34, 0.07, fh), (x + fw / 2, y, 8.6), M("#f2efe6", "cloth"), root, name="cross")
        part("box", (fw, 0.08, 0.2), (x + fw / 2, y, 8.6), M("#c0282d", "cloth"), root, name="cross")
        part("box", (0.2, 0.08, fh), (x + fw / 2, y, 8.6), M("#c0282d", "cloth"), root, name="cross")
    else:
        for i, c in enumerate(colors):
            part("box", (fw / 3, 0.05, fh), (x + fw / 6 + i * fw / 3, y, 8.6), M(c, "cloth", 0.9), root, name="stripe")


def build_barracks(root, side):
    w, d, h = 15.0, 7.0, 6.6
    french = side == "fr"
    wall = "#d9cfb6" if french else "#9c4c38"
    house(root, w, d, h, wall, "#58606c", roof_pat="slate", roof_h=3.0,
          wall_pat="plaster" if french else "wall", chimneys=(-4.5, 4.5))
    if not french:
        for x in (-w / 2, w / 2):
            part("box", (0.5, d + 0.1, h - 0.7), (x, 0, 0.7 + (h - 0.7) / 2), M("#cfc6b0", "wall", scale=2), root, name="quoin")
    part("box", (w + 0.1, d + 0.1, 0.25), (0, 0, 3.6), M("#cfc6b0", "plain", 0.8), root, name="cornice")
    windows(root, w, d, (2.3, 4.9), 6, shutters="#3f5a46" if french else None)
    door(root, 0, -d / 2 - 0.05, 1.6, 2.4)
    flag(root, 0, -d / 2 - 1.3, ("#24315c", "#efeee8", "#b02a2e"), union=not french)


def build_farmhouse(root):
    w, d, h = 9.0, 6.0, 4.4
    house(root, w, d, h, "#e3d8bf", "#9e4b2f", roof_h=3.4, chimneys=(2.6,))
    # Dark half-timber frame on the long walls.
    for y in (-d / 2 - 0.03, d / 2 + 0.03):
        for x in (-w / 2 + 0.15, -1.5, 1.5, w / 2 - 0.15):
            part("box", (0.22, 0.08, h - 0.7), (x, y, 0.7 + (h - 0.7) / 2), M("#4b3424", "planks", 0.8), root, name="post")
        part("box", (w, 0.08, 0.22), (0, y, h - 0.1), M("#4b3424", "planks", 0.8), root, name="beam")
        part("box", (w, 0.08, 0.22), (0, y, 2.5), M("#4b3424", "planks", 0.8), root, name="beam")
    windows(root, w, d, (1.8, 3.4), 3, frame="#d8cfb8", shutters="#5f3b2b")
    door(root, -3.0, -d / 2 - 0.08, 1.1, 2.0)


def build_barn(root):
    w, d, h = 10.0, 7.0, 4.6
    house(root, w, d, h, "#6f4b2d", "#a38c55", roof_pat="thatch", roof_h=4.0, wall_pat="planks", plinth="#7d776a")
    part("box", (3.4, 0.12, 3.4), (0, -d / 2 - 0.06, 2.4), M("#4f3420", "planks", 0.8), root, name="bigdoor")
    for a in (40, -40):
        part("box", (4.4, 0.14, 0.18), (0, -d / 2 - 0.12, 2.4), M("#3b2717", "planks"), root, rot=(0, a, 0), name="brace")


def build_cottage(root):
    w, d, h = 6.5, 5.0, 3.4
    house(root, w, d, h, "#a59e90", "#a69058", roof_pat="thatch", roof_h=3.2, wall_pat="wall", chimneys=(-2.0,), overhang=0.6)
    windows(root, w, d, (1.9,), 2, frame="#d7cfbb", shutters="#3e5a6b")
    door(root, 0.9, -d / 2 - 0.08, 1.0, 1.9)


def build_well(root):
    part("cyl", (1.0, 0.9), (0, 0, 0.45), M("#99928a", "wall", 0.9, scale=3), root, name="ring", segments=20)
    part("cyl", (0.82, 0.92), (0, 0, 0.48), M("#1e2427", "plain", 0.2), root, name="water", segments=20)
    for x in (-0.9, 0.9):
        part("box", (0.14, 0.14, 2.0), (x, 0, 1.4), M("#5a3c25", "bark", 0.9), root, name="post")
    prism("wellroof", 2.4, 1.8, 0.8, M("#8c4630", "tiles", 0.8, scale=2), (0, 0, 2.35), root)
    part("cyl", (0.1, 1.7), (0, 0, 1.9), M("#5a3c25", "bark"), root, rot=(0, 90, 0), name="winch")


def build_haystack(root):
    straw = M("#bca35d", "straw", 0.95)
    part("cyl", (1.3, 1.3, 1.45), (0, 0, 0.65), straw, root, name="stack", segments=20)
    part("cyl", (1.5, 1.7, 0.12), (0, 0, 2.15), M("#ad9452", "straw", 0.95), root, name="top", segments=20)
    part("cyl", (0.06, 0.6), (0, 0, 3.1), M("#5a3c25", "bark"), root, name="pole", segments=6)


def blob(root, r, loc, color, alt, strength=0.75):
    obj = part("ico", (r,), loc, M(color, "leaves", 0.9, alt=alt), root, name="leaves")
    tex = bpy.data.textures.get("leafnoise") or bpy.data.textures.new("leafnoise", "CLOUDS")
    tex.noise_scale = 0.28
    tex.noise_depth = 3
    mod = obj.modifiers.new("disp", "DISPLACE")
    mod.texture = tex
    mod.strength = strength
    mod.texture_coords = "GLOBAL"
    # Subdivide first so the cloud displacement shapes leafy clumps, not facets.
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    bpy.ops.object.modifier_move_to_index(modifier="sub", index=0)
    return obj


def build_oak(root):
    part("cyl", (0.42, 3.4, 0.3), (0, 0, 1.7), M("#5b4430", "bark", 0.95, scale=1.5), root, name="trunk", segments=12)
    for rot, length in ((40, 1.8), (-35, 1.6), (15, 1.5)):
        part("cyl", (0.2, length, 0.1), (0.3 * math.copysign(1, rot), 0, 3.4), M("#5b4430", "bark"), root, rot=(0, rot, 0), name="limb", segments=8)
    clusters = (((0, 0, 5.4), 2.2), ((1.8, 0.4, 4.6), 1.6), ((-1.8, -0.2, 4.7), 1.7),
                ((0.4, 1.5, 4.9), 1.5), ((-0.3, -1.5, 4.5), 1.5), ((1.0, -0.6, 6.4), 1.3), ((-1.1, 0.7, 6.2), 1.3),
                ((2.4, -0.9, 5.4), 1.1), ((-2.4, 1.0, 5.6), 1.1), ((0.2, 0.2, 7.1), 1.1), ((1.5, 1.3, 3.9), 1.0),
                ((-1.4, -1.3, 3.9), 1.0))
    for i, (loc, r) in enumerate(clusters):
        dark = i % 3 == 0
        blob(root, r, loc, "#3f5d28" if dark else "#4c6b2f", "#6d8a3a")


def build_poplar(root):
    part("cyl", (0.22, 2.4, 0.16), (0, 0, 1.2), M("#5f4a36", "bark"), root, name="trunk", segments=10)
    for z, r in ((3.2, 1.25), (4.8, 1.15), (6.3, 0.95), (7.6, 0.7), (8.6, 0.45)):
        blob(root, r, (0, 0, z), "#4d6a31", "#68853a", 0.3).scale = (1, 1, 1.25)


def build_bush(root):
    for loc, r in (((0, 0, 0.7), 0.95), ((0.8, 0.3, 0.55), 0.7), ((-0.7, -0.2, 0.55), 0.7)):
        blob(root, r, loc, "#506f31", "#6a873b", 0.25)


# --- more vegetation: broadleaves, conifers, bushes ----------------------------------
def build_beech(root):
    """A beech: a smooth grey trunk and a broad, dense dome of dark leaves."""
    part("cyl", (0.36, 3.0, 0.26), (0, 0, 1.5), M("#8a877d", "plain", 0.6, alt="#6f6c63"), root, name="trunk", segments=12)
    for rot in (35, -30, 10):
        part("cyl", (0.16, 1.7, 0.08), (0.25 * math.copysign(1, rot), 0, 3.0), M("#8a877d", "plain", 0.6), root, rot=(0, rot, 0), name="limb", segments=8)
    for i, (loc, r) in enumerate((((0, 0, 5.0), 2.4), ((1.9, 0.5, 4.4), 1.7), ((-1.9, -0.3, 4.5), 1.7), ((0.5, 1.7, 4.6), 1.6),
                                  ((-0.4, -1.7, 4.3), 1.6), ((0.9, -0.5, 6.2), 1.5), ((-1.0, 0.6, 6.0), 1.4), ((0, 0, 6.9), 1.2))):
        blob(root, r, loc, "#2f4f22" if i % 2 else "#3b5c27", "#55772f")


def build_birch(root):
    """A birch: a slender white trunk marked black and a light, airy crown."""
    bark = M("#e7e3d8", "bark", 0.8, scale=3, alt="#2c2a26")
    part("cyl", (0.17, 5.2, 0.1), (0, 0, 2.6), bark, root, name="trunk", segments=10)
    part("cyl", (0.08, 1.8, 0.04), (0.35, 0, 4.4), bark, root, rot=(0, 30, 0), name="limb", segments=6)
    for i, (loc, r) in enumerate((((0, 0, 5.6), 1.2), ((0.8, 0.3, 4.8), 0.9), ((-0.8, -0.2, 5.0), 0.9), ((0.2, 0.7, 6.4), 0.8),
                                  ((-0.3, -0.6, 6.6), 0.7), ((0.5, -0.4, 4.2), 0.7), ((0, 0, 7.2), 0.6))):
        blob(root, r, loc, "#5d7d30" if i % 2 else "#6c8c38", "#8aa84a", 0.45)


def build_pine(root):
    """A Scots pine: a tall trunk, orange-red above, and a flat umbrella of dark needles up high."""
    part("cyl", (0.3, 4.5, 0.2), (0, 0, 2.25), M("#5c4433", "bark", 0.95, scale=1.5), root, name="trunk", segments=10)
    part("cyl", (0.2, 3.2, 0.12), (0.1, 0, 6.0), M("#b0603a", "bark", 0.8, scale=2), root, rot=(0, 4, 0), name="upper", segments=10)
    for i, (loc, r) in enumerate((((0, 0, 7.6), 1.6), ((1.3, 0.3, 7.2), 1.2), ((-1.2, -0.2, 7.0), 1.2), ((0.3, 1.1, 7.4), 1.0),
                                  ((-0.2, -1.1, 7.3), 1.0), ((0.4, 0, 8.4), 1.0))):
        blob(root, r, loc, "#2a4626" if i % 2 else "#33522b", "#4a6b39", 0.4).scale = (1, 1, 0.6)


def build_spruce(root):
    """A spruce: a dark green cone of drooping tiers on a straight trunk."""
    part("cyl", (0.22, 2.0, 0.18), (0, 0, 1.0), M("#4d3a2b", "bark", 0.95), root, name="trunk", segments=10)
    needles = M("#213b25", "leaves", 0.9, alt="#35553a")
    for z, r, h in ((1.6, 2.1, 2.2), (3.0, 1.75, 2.0), (4.3, 1.4, 1.8), (5.5, 1.05, 1.6), (6.6, 0.7, 1.4), (7.5, 0.35, 1.0)):
        part("cyl", (r, h, 0.05), (0, 0, z + h / 2), needles, root, name="tier", segments=14)


def build_willow(root):
    """A willow: a short, thick, leaning trunk and a silvery crown hanging down."""
    part("cyl", (0.48, 2.4, 0.36), (0.2, 0, 1.2), M("#5a4c3c", "bark", 0.95, scale=1.2), root, rot=(0, 8, 0), name="trunk", segments=12)
    for i, (loc, r) in enumerate((((0.4, 0, 4.0), 1.9), ((1.8, 0.4, 3.4), 1.4), ((-1.3, -0.3, 3.5), 1.4), ((0.6, 1.4, 3.3), 1.3),
                                  ((0.2, -1.4, 3.2), 1.3), ((0.5, 0, 5.1), 1.2))):
        blob(root, r, loc, "#5d7449" if i % 2 else "#6b8256", "#8a9d72", 0.5).scale = (1, 1, 1.35)


def build_hawthorn(root):
    """A hawthorn bush: a tangle of small dark leaves, red haws among them."""
    for loc, r in (((0, 0, 0.9), 1.0), ((0.8, 0.4, 0.7), 0.75), ((-0.7, -0.3, 0.7), 0.75), ((0.1, 0.6, 1.4), 0.6)):
        blob(root, r, loc, "#3e5b29", "#577a34", 0.35)
    berries = M("#9e1c1c", "plain", 0.5)
    for k in range(14):
        a = k * 2.39
        part("ball", (0.06,), (math.cos(a) * (0.6 + (k % 3) * 0.25), math.sin(a) * (0.5 + (k % 2) * 0.3), 0.7 + (k % 4) * 0.25), berries, root, name="haw")


def build_hazel(root):
    """A hazel: a clump of thin upright stems and a loose, rounded leafy top."""
    for k in range(6):
        a = k / 6 * math.tau
        part("cyl", (0.04, 2.0, 0.02), (math.cos(a) * 0.25, math.sin(a) * 0.25, 1.0), M("#6b5a45", "bark"), root,
             rot=(math.sin(a) * 12, math.cos(a) * 12, 0), name="stem", segments=6)
    for loc, r in (((0, 0, 2.0), 1.05), ((0.7, 0.3, 1.6), 0.8), ((-0.7, -0.2, 1.7), 0.8), ((0.1, -0.6, 2.3), 0.7)):
        blob(root, r, loc, "#5a7a32", "#7a9a42", 0.4)


def build_fern(root):
    """A patch of bracken: low fronds fanning out from the ground."""
    frond = M("#5f8a2e", "leaves", 0.85, alt="#86a83e")
    for k in range(11):
        a = k / 11 * math.tau + (k % 2) * 0.2
        part("box", (0.12, 0.85, 0.02), (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.32), frond, root,
             rot=(30 * math.cos(a), -30 * math.sin(a), math.degrees(a) + 90), name="frond")


def build_fence(root):
    for x in (-3, -1.5, 0, 1.5, 3):
        part("box", (0.13, 0.13, 1.25), (x, 0, 0.62), M("#6a5038", "bark", 0.95), root, name="post")
    for z in (0.5, 0.98):
        part("box", (6.1, 0.07, 0.12), (0, 0, z), M("#7a5c40", "planks", 0.95), root, name="rail")


def build_bridge(root):
    """Stone arch bridge along X: abutments, a ring of voussoirs over the water,
    spandrels, and a straight deck with a dirt road and parapets with coping."""
    stone = M("#9a9182", "wall", 0.9, 1.2, alt="#7d766a")
    dark = M("#6f685d", "wall", 0.9, 1.2, alt="#5d574e")
    road = M("#a68b5e", "dirt", 0.95, alt="#8e7651")
    span, width, rise, length, deck = 4.2, 4.8, 1.25, 11.6, 1.55
    for x in (-span / 2 - 1.6, span / 2 + 1.6):
        part("box", (3.2, width, deck - 0.1), (x, 0, (deck - 0.1) / 2), stone, root, name="abutment")
    # Arch ring: voussoirs laid along a half-ellipse, each tangent to the curve.
    n = 15
    for k in range(n):
        a = math.pi * (k + 0.5) / n
        x, z = -math.cos(a) * span / 2, math.sin(a) * rise
        dx, dz = math.sin(a) * span / 2, math.cos(a) * rise
        part("box", (span * 1.6 / n, width + 0.04, 0.36), (x, 0, z), dark if k % 2 else stone, root,
             rot=(0, -math.degrees(math.atan2(dz, dx)), 0), name="voussoir")
    # Spandrels fill the faces between the arch and the deck at the haunches.
    for x in (-span / 2 + 0.35, span / 2 - 0.35):
        part("box", (0.8, width, 0.9), (x, 0, deck - 0.55), stone, root, name="spandrel")
    part("box", (length, width, 0.25), (0, 0, deck), stone, root, name="deck")
    part("box", (length, width - 0.9, 0.04), (0, 0, deck + 0.14), road, root, name="roadway")
    for y in (width / 2 - 0.2, -width / 2 + 0.2):
        part("box", (length, 0.4, 0.75), (0, y, deck + 0.5), stone, root, name="parapet")
        part("box", (length + 0.1, 0.5, 0.1), (0, y, deck + 0.92), dark, root, name="coping")
    for x in (-length / 2, length / 2):
        for y in (width / 2 - 0.2, -width / 2 + 0.2):
            part("box", (0.5, 0.55, 1.05), (x, y, deck + 0.62), dark, root, name="endpost")


def bridge_profile(length, deck, ramp):
    """Deck height along the bridge: flat over the water, ramps down at both ends."""
    return lambda x: deck * max(0.0, min(1.0, (length / 2 - abs(x)) / ramp))


def along(root, xs, height, y, size, mat, lift=0.0, name="beam"):
    """Boxes from post to post along x, following the deck's slope."""
    for a, b in zip(xs, xs[1:]):
        za, zb = height(a) + lift, height(b) + lift
        run = math.hypot(b - a, zb - za)
        part("box", (run + 0.04, size[0], size[1]), ((a + b) / 2, y, (za + zb) / 2), mat, root,
             rot=(0, -math.degrees(math.atan2(zb - za, b - a)), 0), name=name)


def ramp_wedge(root, x0, x1, z0, z1, width, mat, name="ramp"):
    """A solid ramp from (x0, z0) to (x1, z1), ground to top, width across y."""
    w = width / 2
    verts = [(x0, -w, 0), (x1, -w, 0), (x1, w, 0), (x0, w, 0), (x0, -w, z0), (x1, -w, z1), (x1, w, z1), (x0, w, z0)]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.parent = root
    return ob


# Game bridges (src/systems/rendering/iso-view-v1.js scales them to each crossing's length):
# deck height and ramp length are read back by the view to lift men onto the deck.
BRIDGE_DECKS = {"bridge_stone": (12.8, 1.25, 2.6), "bridge_wood": (12.0, 1.0, 2.2)}


def build_bridge_stone(root):
    """Stone arch bridge for the game's crossings: one arch over the water, solid
    approach ramps between wing walls, a dirt roadway and parapets with coping."""
    stone = M("#9a9182", "wall", 0.9, 1.2, alt="#7d766a")
    dark = M("#6f685d", "wall", 0.9, 1.2, alt="#5d574e")
    road = M("#a68b5e", "dirt", 0.95, alt="#8e7651")
    length, deck, ramp = BRIDGE_DECKS["bridge_stone"]
    width, span, rise = 4.8, 4.6, 0.95
    height = bridge_profile(length, deck, ramp)
    flat = length / 2 - ramp
    # Arch ring over the water and the spandrel walls up to the deck.
    n = 15
    for k in range(n):
        a = math.pi * (k + 0.5) / n
        x, z = -math.cos(a) * span / 2, math.sin(a) * rise
        dx, dz = math.sin(a) * span / 2, math.cos(a) * rise
        part("box", (span * 1.6 / n, width + 0.04, 0.32), (x, 0, z), dark if k % 2 else stone, root,
             rot=(0, -math.degrees(math.atan2(dz, dx)), 0), name="voussoir")
    for x in (-span / 2 + 0.4, span / 2 - 0.4):
        part("box", (0.9, width, deck - rise), (x, 0, (deck + rise) / 2 - 0.1), stone, root, name="spandrel")
    for side in (-1, 1):
        part("box", (flat - span / 2, width, deck), (side * (flat + span / 2) / 2, 0, deck / 2), stone, root, name="abutment")
        ramp_wedge(root, side * flat, side * length / 2, deck, 0.05, width, stone)
        ramp_wedge(root, side * flat, side * length / 2, deck + 0.02, 0.07, width - 0.9, road, name="roadramp")
        # Cutwater-like quoins at the springing of the arch.
        part("box", (0.5, width + 0.3, deck * 0.7), (side * (span / 2 + 0.25), 0, deck * 0.35), dark, root, name="quoin")
    part("box", (2 * flat, width, 0.22), (0, 0, deck - 0.1), stone, root, name="deck")
    part("box", (2 * flat, width - 0.9, 0.04), (0, 0, deck + 0.02), road, root, name="roadway")
    xs = [-length / 2 + 0.3, -flat, flat, length / 2 - 0.3]
    for y in (width / 2 - 0.2, -width / 2 + 0.2):
        along(root, xs, height, y, (0.4, 0.7), stone, lift=0.35, name="parapet")
        along(root, xs, height, y, (0.5, 0.1), dark, lift=0.74, name="coping")
        for x in (xs[0], xs[-1]):
            part("box", (0.5, 0.55, 0.95), (x, y, height(x) + 0.47), dark, root, name="endpost")


def build_bridge_wood(root):
    """Timber trestle bridge along X: pile bents standing in the water, stringers,
    a plank deck that ramps down at both ends, edge beams and post-and-rail parapets."""
    post = M("#5a4630", "bark", 0.95)
    timber = M("#5f4a31", "planks", 0.9, alt="#4b3a26")
    planks = [M(c, "planks", 0.9, alt=a) for c, a in (("#8a6c4b", "#73593c"), ("#7a6243", "#644f35"), ("#937a59", "#7b6447"))]
    length, deck, ramp = BRIDGE_DECKS["bridge_wood"]
    width = 4.4
    height = bridge_profile(length, deck, ramp)
    # Bents: three piles, a cap beam and a cross brace.
    for x in (-3.0, -1.0, 1.0, 3.0):
        top = height(x) - 0.2
        for y in (-1.8, 0.0, 1.8):
            part("box", (0.26, 0.26, top + 0.4), (x, y, (top - 0.4) / 2), post, root, name="pile")
        part("box", (0.3, width - 0.2, 0.2), (x, 0, top - 0.1), timber, root, name="cap")
        part("box", (0.1, 3.9, 0.14), (x + 0.15, 0, top / 2), timber, root, rot=(math.degrees(math.atan2(top, 3.6)), 0, 0), name="brace")
    # Stringers, then planks across them with a hand's gap between.
    xs = [-length / 2, -length / 2 + ramp, length / 2 - ramp, length / 2]
    for y in (-1.6, -0.55, 0.55, 1.6):
        along(root, xs, height, y, (0.22, 0.22), timber, lift=-0.16, name="stringer")
    x, k = -length / 2 + 0.14, 0
    while x < length / 2 - 0.1:
        z = height(x)
        slope = 0 if abs(x) < length / 2 - ramp else math.degrees(math.atan2(deck, ramp)) * (-1 if x < 0 else 1)
        part("box", (0.24, width - 0.1 * (k % 3 == 1), 0.07), (x, 0.03 * (k % 2), max(0.04, z - 0.04)),
             planks[(k * 7) % 3], root, rot=(0, slope, 0), name="plank")
        x += 0.29
        k += 1
    # Edge beams and parapets: posts every 1.5 m, hand rail and mid rail along the deck.
    posts = [-length / 2 + 0.2 + i * (length - 0.4) / 8 for i in range(9)]
    for y in (width / 2 - 0.08, -width / 2 + 0.08):
        along(root, xs, height, y, (0.16, 0.3), timber, lift=-0.05, name="edge")
        for px in posts:
            part("box", (0.16, 0.16, 1.0), (px, y, height(px) + 0.5), post, root, name="railpost")
        along(root, posts, height, y, (0.1, 0.1), timber, lift=0.95, name="rail")
        along(root, posts, height, y, (0.08, 0.08), timber, lift=0.5, name="rail")


def build_tower(root, side):
    """A defensive musketry tower: rubble-stone base with loopholes, a jettied
    timber fighting room with firing slits and musket barrels poking out, a
    pyramid roof and the nation's flag on a short mast."""
    french = side == "fr"
    stone = M("#a39b8b", "wall", 0.92, scale=2.2, alt="#7d766a")
    timber = M("#6b4a2d", "planks", 0.8)
    dark = M("#3b2717", "planks", 0.8)
    slit = M("#16130f", "plain", 0.4)
    b, base_h = 4.6, 4.4
    part("box", (b + 0.5, b + 0.5, 0.6), (0, 0, 0.3), M("#837c6f", "wall", 0.9, alt="#6a645a"), root, name="plinth")
    # Battered (slightly tapering) stone base.
    part("cyl", (b * 0.74, base_h, b * 0.7), (0, 0, base_h / 2 + 0.3), stone, root, rot=(0, 0, 45), name="base", segments=4, smooth=False)
    part("box", (b + 0.3, b + 0.3, 0.28), (0, 0, base_h + 0.3), M("#cfc6b0", "plain", 0.8), root, name="course")
    for sgn_x, sgn_y in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        for k in (-0.9, 0.9):
            x = sgn_x * (b / 2 - 0.12) + (k if sgn_y else 0)
            y = sgn_y * (b / 2 - 0.12) + (k if sgn_x else 0)
            part("box", (0.14 if sgn_x else 0.16, 0.16 if sgn_x else 0.14, 0.7), (x, y, 2.8), slit, root, name="loophole")
    door(root, 0, -b / 2 + 0.05, 1.1, 2.0, color="#3d2a1a")
    # Jettied timber fighting room on corbels.
    u, up_h, z0 = b + 1.1, 2.8, base_h + 0.45
    for x in (-u / 2 + 0.4, 0, u / 2 - 0.4):
        for y in (-1, 1):
            part("box", (0.3, 0.9, 0.3), (x, y * (b / 2 + 0.2), z0 - 0.1), dark, root, name="corbel")
            part("box", (0.9, 0.3, 0.3), (y * (b / 2 + 0.2), x, z0 - 0.1), dark, root, name="corbel")
    part("box", (u, u, up_h), (0, 0, z0 + up_h / 2), timber, root, name="room")
    for x in (-u / 2, u / 2):
        for y in (-u / 2, u / 2):
            part("box", (0.3, 0.3, up_h + 0.1), (x, y, z0 + up_h / 2), dark, root, name="post")
    part("box", (u + 0.12, u + 0.12, 0.22), (0, 0, z0 + 0.15), dark, root, name="sill")
    part("box", (u + 0.12, u + 0.12, 0.22), (0, 0, z0 + up_h - 0.1), dark, root, name="plate")
    # Firing slits, three a side, with barrels poking out on the two faces the camera sees.
    for i in (-1, 0, 1):
        for face, (nx, ny) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0))):
            x = nx * (u / 2 + 0.02) + (i * 1.5 if ny else 0)
            y = ny * (u / 2 + 0.02) + (i * 1.5 if nx else 0)
            part("box", (0.75 if ny else 0.06, 0.06 if ny else 0.75, 0.32), (x, y, z0 + 1.55), slit, root, name="slit")
            if face < 2 and i != 0:
                part("cyl", (0.03, 1.1), (x + nx * 0.5, y + ny * 0.5, z0 + 1.52), M("#2b2b2b", "plain", 0.4, metal=0.6), root,
                     rot=(90 if ny else 0, 90 if nx else 0, 0), name="barrel")
    # Pyramid roof of shingles, a little overhang, with a mast and the flag.
    rz = z0 + up_h
    part("cyl", ((u + 1.0) * 0.72, 2.6, 0.08), (0, 0, rz + 1.3), M("#55504a", "slate", 0.8), root, rot=(0, 0, 45), name="roof",
         segments=4, smooth=False)
    part("cyl", (0.06, 3.0, 0.04), (0, 0, rz + 2.6 + 1.3), M("#d8d2c4", "plain", 0.5), root, name="pole")
    part("ball", (0.12,), (0, 0, rz + 2.6 + 2.85), M("#c9a33c", "plain", 0.3, metal=0.9), root, name="finial")
    fw, fh, fz = 1.8, 1.2, rz + 2.6 + 2.2
    if french:
        for i, c in enumerate(("#24315c", "#efeee8", "#b02a2e")):
            part("box", (fw / 3, 0.05, fh), (fw / 6 + i * fw / 3, 0, fz), M(c, "cloth", 0.9), root, name="stripe")
    else:
        part("box", (fw, 0.05, fh), (fw / 2, 0, fz), M("#22336b", "cloth", 0.9), root, name="flag")
        for a in (33, -33):
            part("box", (2.05, 0.06, 0.15), (fw / 2, 0, fz), M("#f2efe6", "cloth"), root, rot=(0, a, 0), name="saltire")
        part("box", (fw, 0.07, 0.3), (fw / 2, 0, fz), M("#f2efe6", "cloth"), root, name="cross")
        part("box", (0.3, 0.07, fh), (fw / 2, 0, fz), M("#f2efe6", "cloth"), root, name="cross")
        part("box", (fw, 0.08, 0.17), (fw / 2, 0, fz), M("#c0282d", "cloth"), root, name="cross")
        part("box", (0.17, 0.08, fh), (fw / 2, 0, fz), M("#c0282d", "cloth"), root, name="cross")


# --- field hospital ------------------------------------------------------------------
def ridge_tent(root, x, y, length, width, height, canvas, dark, open_front=True):
    """A ridge tent: a canvas prism with its gables, ridge pole and guy ropes."""
    # Two canvas slopes from the ridge down to the ground, and the gables.
    half = width / 2
    slant, tilt = math.hypot(half, height), math.degrees(math.atan2(height, half))
    for sy in (-1, 1):
        part("box", (length, slant, 0.05), (x, y + sy * half / 2, height / 2), canvas, root, rot=(-sy * tilt, 0, 0), name="slope")
    for ex in (-1, 1):
        # A three-sided cone is a triangle: turned to stand across the tent, its point up.
        gable = empty("gable", root, (x + ex * length / 2, y, 0), (90, 0, 0))
        tri = part("cyl", (1.0, 0.04), (0, height / 3, 0), canvas, gable, rot=(0, 90, 0), name="gable", segments=3, smooth=False)
        tri.scale = (half / 0.866, 2 * height / 3, 1)
    part("cyl", (0.05, length + 0.4), (x, y, height + 0.02), dark, root, rot=(0, 90, 0), name="ridge")
    for ex in (-1, 1):
        part("cyl", (0.05, height + 0.2), (x + ex * (length / 2 + 0.05), y, (height + 0.2) / 2), dark, root, name="pole")
    if open_front:
        # The near gable stands open: a dark doorway with the flaps tied back.
        part("box", (0.04, width * 0.42, height * 0.62), (x - length / 2 - 0.03, y, height * 0.31), M("#2a241c", "plain", 0.9), root,
             name="door")
        for sy in (-1, 1):
            part("box", (0.05, width * 0.18, height * 0.6), (x - length / 2 - 0.08, y + sy * width * 0.27, height * 0.3), canvas, root,
                 rot=(0, 0, sy * 25), name="flap")
    for sx in (-1, 1):
        for sy in (-1, 1):
            part("cyl", (0.012, 1.6), (x + sx * length * 0.38, y + sy * (width / 2 + 0.55), 0.55), M("#8a7a5c", "plain", 0.8), root,
                 rot=(sy * 48, 0, 0), name="guy")
            part("box", (0.06, 0.06, 0.25), (x + sx * length * 0.38, y + sy * (width / 2 + 1.05), 0.1), dark, root, name="peg")


def build_hospital(root, side):
    """A field hospital (an ambulance, after Larrey): two canvas tents, a light
    two-wheeled ambulance wagon, stretchers laid out, chests and a water cask,
    and the nation's flag on a pole."""
    canvas = M("#e6e0cf", "cloth", 0.95, scale=2, alt="#d6cfba")
    dark = M("#5a4026", "planks", 0.8)
    ridge_tent(root, 0, 0, 5.2, 3.6, 2.8, canvas, dark)
    ridge_tent(root, 0.6, 3.6, 3.4, 2.6, 2.2, canvas, dark, open_front=False)
    # The wagon: a box body with a canvas tilt on two wheels and its shafts down.
    wagon = empty("wagon", root, (-4.4, -0.6, 0), (0, 0, 70))
    body = M("#4d5a3a" if side == "fr" else "#5d646b", "planks", 0.8)
    part("box", (1.1, 2.0, 0.6), (0, 0, 1.0), body, wagon, name="wagonbody")
    part("cyl", (0.62, 2.0, 0.62), (0, 0, 1.3), canvas, wagon, rot=(90, 0, 0), name="tilt", segments=16).scale = (1, 1, 0.7)
    for x in (-0.68, 0.68):
        part("cyl", (0.62, 0.08), (x, 0.2, 0.62), dark, wagon, rot=(0, 90, 0), name="wheel", segments=18)
        part("cyl", (0.1, 0.12), (x, 0.2, 0.62), M("#2a2a2a", "plain", 0.5, metal=0.5), wagon, rot=(0, 90, 0), name="hub")
    for x in (-0.4, 0.4):
        part("box", (0.07, 2.2, 0.07), (x, -2.0, 0.45), dark, wagon, rot=(-18, 0, 0), name="shaft")
    # Stretchers on the ground before the tent: two poles and the canvas between.
    for i, (x, y) in enumerate(((-3.4, 2.2), (-3.2, 3.4))):
        st = empty("stretcher", root, (x, y, 0.12), (0, 0, 8 * (1 - 2 * i)))
        for sy in (-0.28, 0.28):
            part("cyl", (0.035, 2.3), (0, sy, 0), dark, st, rot=(0, 90, 0), name="handle")
        part("box", (1.8, 0.52, 0.03), (0, 0, 0.01), M("#cfc6ae", "cloth", 0.95), st, name="sling")
    for x, y, r in ((2.9, -1.4, 10), (3.4, -0.6, -20)):
        part("box", (0.8, 0.55, 0.5), (x, y, 0.25), dark, root, rot=(0, 0, r), name="chest")
    part("cyl", (0.32, 0.8, 0.28), (3.2, 0.6, 0.4), M("#6b4a2d", "planks", 0.8), root, name="cask")
    # The flag on its pole beside the tent.
    fx, fy, fz = 2.6, 2.0, 4.6
    part("cyl", (0.05, 5.0, 0.035), (fx, fy, 2.5), M("#d8d2c4", "plain", 0.5), root, name="pole")
    fw, fh = 1.5, 1.0
    if side == "fr":
        for i, c in enumerate(("#24315c", "#efeee8", "#b02a2e")):
            part("box", (fw / 3, 0.05, fh), (fx + fw / 6 + i * fw / 3, fy, fz), M(c, "cloth", 0.9), root, name="stripe")
    else:
        part("box", (fw, 0.05, fh), (fx + fw / 2, fy, fz), M("#22336b", "cloth", 0.9), root, name="flag")
        part("box", (fw, 0.07, 0.24), (fx + fw / 2, fy, fz), M("#f2efe6", "cloth"), root, name="cross")
        part("box", (0.24, 0.07, fh), (fx + fw / 2, fy, fz), M("#f2efe6", "cloth"), root, name="cross")
        part("box", (fw, 0.08, 0.13), (fx + fw / 2, fy, fz), M("#c0282d", "cloth"), root, name="cross")
        part("box", (0.13, 0.08, fh), (fx + fw / 2, fy, fz), M("#c0282d", "cloth"), root, name="cross")


# --- field-work kit (trenches) ---------------------------------------------------
# --- work sites -------------------------------------------------------------------
def pennant(root, x, y, colors, height=3.2):
    """A small camp flag on a staff, the side's colours (fr tricolour, br red/blue)."""
    part("cyl", (0.045, height, 0.035), (x, y, height / 2), M("#6b4a2e", "bark"), root, name="staff", segments=8)
    fw, fh = 0.95, 0.6
    for i, c in enumerate(colors):
        part("box", (fw / len(colors), 0.04, fh), (x + fw / len(colors) * (i + 0.5), y, height - fh / 2 - 0.08),
             M(c, "cloth", 0.9), root, name="pennant")


def log(root, length, r, loc, rot=(0, 90, 0), name="log"):
    part("cyl", (r, length), loc, M("#6a4a2f", "bark", 0.9, scale=1.4), root, rot=rot, name=name, segments=12)
    # Pale cut ends.
    axis = Vector((1, 0, 0)) if rot[1] else Vector((0, 1, 0))
    for sgn in (-1, 1):
        end = Vector(loc) + axis * sgn * (length / 2 + 0.005)
        part("cyl", (r * 0.92, 0.02), tuple(end), M("#c9a774", "plain", 0.8), root, rot=rot, name="cut", segments=12)


def build_lumbercamp(root, side):
    """A woodcutters' camp: an open lean-to shed over split wood, a pile of
    trunks, a chopping block with its axe, a sawhorse and chips on the ground."""
    rng = random.Random(41)
    # A trodden patch of bare earth (round-edged, not a slab).
    part("cyl", (1.0, 0.03), (0, 0.2, 0.015), M("#7a6347", "dirt", 0.95, alt="#6f6a45"), root, name="yard", segments=28)
    bpy.context.object.scale = (3.2, 2.35, 1.0)
    # The shed: four posts, a plank roof sloping to the front.
    wood = M("#6e4c2e", "planks", 0.85)
    for x in (-1.7, 1.7):
        part("box", (0.16, 0.16, 2.5), (x, 1.75, 1.25), wood, root, name="post")
        part("box", (0.16, 0.16, 1.9), (x, 0.35, 0.95), wood, root, name="post")
    part("box", (3.9, 1.75, 0.08), (0, 1.05, 2.22), M("#7b5636", "planks", 0.85, scale=1.4), root, rot=(-12, 0, 0), name="roof")
    # Split wood stacked under it, end out.
    for row in range(4):
        for k in range(11):
            x = -1.45 + k * 0.29 + (0.14 if row % 2 else 0)
            if x > 1.5:
                continue
            part("box", (0.25, 1.1, 0.2), (x, 1.15, 0.14 + row * 0.21), M("#b48a58" if (k + row) % 3 else "#9c7448", "plain", 0.85),
                 root, rot=(0, 0, rng.uniform(-4, 4)), name="split")
    # A pile of trunks in front, three, two and one.
    for row, count in enumerate((3, 2, 1)):
        for k in range(count):
            y = -0.95 + (k - (count - 1) / 2) * 0.42
            log(root, 2.8, 0.2, (-1.5, y, 0.22 + row * 0.36), name="trunk")
    # Chopping block with the axe in it, and chips about.
    part("cyl", (0.32, 0.55), (1.35, -0.85, 0.3), M("#7a5a3a", "bark", 0.9), root, name="block", segments=14)
    part("cyl", (0.3, 0.02), (1.35, -0.85, 0.585), M("#c9a774", "plain", 0.8), root, name="blocktop", segments=14)
    part("box", (0.05, 0.05, 0.8), (1.45, -0.85, 0.95), M("#8a6a44", "plain", 0.7), root, rot=(0, 28, 0), name="haft")
    part("box", (0.26, 0.04, 0.14), (1.3, -0.85, 0.63), M("#6d7378", "plain", 0.35, metal=0.8), root, rot=(0, 28, 0), name="axehead")
    for i in range(14):
        part("box", (0.12, 0.05, 0.02), (1.35 + rng.uniform(-0.8, 0.8), -0.85 + rng.uniform(-0.7, 0.6), 0.05),
             M("#c7a46f", "plain", 0.85), root, rot=(0, 0, rng.uniform(0, 180)), name="chip")
    # A sawhorse with a trunk across it.
    for x in (0.35, 1.25):
        for a in (22, -22):
            part("box", (0.08, 0.08, 0.95), (x, 0.0 + (0.12 if a > 0 else -0.12), 0.44), wood, root, rot=(a, 0, 0), name="leg")
    log(root, 1.9, 0.16, (0.8, 0.0, 0.92), name="sawlog")
    pennant(root, 2.6, 1.9, ("#24315c", "#efeee8", "#b02a2e") if side == "fr" else ("#c0282d", "#22336b"))


FIELD_W, FIELD_D = 155.44 / 22.5, 117.92 / 22.5    # the game's farm footprint in metres


def build_field(root, stage):
    """A grain field on the farm's footprint: ploughed furrows, green shoots or
    ripe wheat; a low wattle fence along the far sides and a scarecrow."""
    rng = random.Random(7)
    w, d = FIELD_W, FIELD_D
    part("box", (w, d, 0.05), (0, 0, 0.025), M("#6b5236", "dirt", 0.95, alt="#5d4a33"), root, name="soil")
    rows = 13
    for i in range(rows):
        y = -d / 2 + 0.3 + i * (d - 0.6) / (rows - 1)
        part("box", (w - 0.35, 0.16, 0.07), (0, y, 0.07), M("#7d6142", "dirt", 0.95, alt="#6e5539"), root, name="furrow")
        if stage != "young":
            continue
        n = 24
        for k in range(n):
            x = -w / 2 + 0.3 + k * (w - 0.6) / (n - 1) + rng.uniform(-0.05, 0.05)
            if stage == "young":
                part("ico", (0.11, 1.0, 1.0, 0.7), (x, y + rng.uniform(-0.03, 0.03), 0.16),
                     M("#6f9a3e" if rng.random() < 0.7 else "#86ab4a", "leaves", 0.9), root, name="shoot")
    if stage == "ripe":
        # Ripe wheat: a golden band along each furrow, its ears nodding on top.
        for i in range(rows):
            y = -d / 2 + 0.3 + i * (d - 0.6) / (rows - 1)
            part("box", (w - 0.45, 0.3, 0.42), (0, y, 0.27), M("#c9a14e", "straw", 0.95), root, name="wheat")
            for k in range(46):
                x = -w / 2 + 0.3 + k * (w - 0.6) / 45 + rng.uniform(-0.04, 0.04)
                part("ball", (0.05, 1.0, 1.0, 1.7), (x, y + rng.uniform(-0.1, 0.1), 0.5 + rng.uniform(-0.03, 0.05)),
                     M("#dcbd6c" if rng.random() < 0.7 else "#cda75a", "straw", 0.95), root, name="ear", segments=6)
    # Wattle fence along the far and the left side.
    fence = M("#6a4a2c", "bark", 0.9)
    for x in [(-w / 2) + k * w / 8 for k in range(9)]:
        part("cyl", (0.05, 0.75), (x, d / 2 + 0.1, 0.37), fence, root, name="stake", segments=6)
    for y in [(-d / 2) + k * d / 6 for k in range(7)]:
        part("cyl", (0.05, 0.75), (-w / 2 - 0.1, y, 0.37), fence, root, name="stake", segments=6)
    for z in (0.35, 0.6):
        part("box", (w, 0.06, 0.06), (0, d / 2 + 0.1, z), fence, root, name="rail")
        part("box", (0.06, d, 0.06), (-w / 2 - 0.1, 0, z), fence, root, name="rail")
    # A scarecrow in the far corner.
    sx, sy = w / 2 - 0.8, d / 2 - 0.7
    part("cyl", (0.04, 1.7), (sx, sy, 0.85), fence, root, name="pole", segments=6)
    part("box", (0.9, 0.05, 0.05), (sx, sy, 1.35), fence, root, name="arms")
    part("box", (0.36, 0.2, 0.55), (sx, sy, 1.25), M("#7b3b2a", "cloth"), root, name="coat")
    part("ball", (0.14,), (sx, sy, 1.66), M("#c9b07a", "straw"), root, name="head", segments=10)
    part("cyl", (0.26, 0.05, 0.26), (sx, sy, 1.79), M("#4b3a27", "straw"), root, name="brim", segments=12)
    part("cyl", (0.12, 0.16, 0.08), (sx, sy, 1.88), M("#4b3a27", "straw"), root, name="crown", segments=10)


def build_gabion(root):
    """A gabion: a wicker basket of upright stakes and woven withies, filled
    with earth, as set along the inside of a parapet."""
    r, h = 0.33, 0.9
    withy = (M("#7d6440", "bark", 0.9, scale=4), M("#94784c", "bark", 0.9, scale=4))
    for i in range(9):
        part("cyl", (r, 0.075, r), (0, 0, 0.06 + i * 0.1), withy[i % 2], root, name="weave", segments=18)
    for i in range(10):
        a = i / 10 * math.tau
        part("cyl", (0.018, h + 0.12), (math.cos(a) * (r + 0.012), math.sin(a) * (r + 0.012), (h + 0.12) / 2), M("#5b4429", "bark", 0.9), root,
             name="stake", segments=6)
    part("cyl", (r * 0.97, 0.12, r * 0.6), (0, 0, h + 0.04), M("#5f4a31", "dirt", 0.95), root, name="earth", segments=18)


def build_sandbags(root):
    """A short course of sandbags: three below, two on top."""
    bag = (M("#93805a", "cloth", 0.95, scale=3), M("#857250", "cloth", 0.95, scale=3))
    for i, x in enumerate((-0.52, 0.0, 0.52)):
        part("ball", (0.27, 1.0, 0.62, 0.42), (x, 0, 0.12), bag[i % 2], root, rot=(0, 0, (i - 1) * 6), name="bag")
    for i, x in enumerate((-0.26, 0.26)):
        part("ball", (0.27, 1.0, 0.62, 0.42), (x, 0.03, 0.33), bag[(i + 1) % 2], root, rot=(0, 0, (i - 0.5) * 8), name="bag")


def build_fascine_wall(root, length=8.0, height=1.2):
    """The revetment of a trench wall: fascines (bundles of brushwood) laid on
    top of each other, held by stakes and ties at 1 m spacing, so a 4 m strip
    repeats seamlessly."""
    twig = (M("#6e5535", "bark", 0.9, scale=6), M("#836644", "bark", 0.9, scale=6), M("#5a4529", "bark", 0.9, scale=6))
    rows = int(height / 0.24)
    rng = random.Random(7)
    # Earth behind, so no light shows between the bundles.
    part("box", (length, 0.1, height + 0.1), (0, 0.16, height / 2), M("#3a2d1e", "dirt", 0.95), root, name="earth")
    for row in range(rows):
        z = 0.12 + row * 0.24
        part("cyl", (0.09, length), (0, 0.03, z), M("#33281a", "bark", 0.9, scale=6), root, rot=(0, 90, 0), name="core", segments=8)
        # Brushwood: thin crooked sticks of mixed length and tone, repeated
        # every 4 m so the strip tiles without a seam.
        for k in range(34):
            a, d = rng.uniform(0, math.tau), rng.uniform(0.04, 0.11)
            ln, cx = rng.uniform(0.9, 2.6), rng.uniform(-2, 2)
            mat = M(rng.choice(("#6e5535", "#836644", "#5a4529", "#9a7b51", "#4d3b24")), "bark", 0.9, scale=7)
            rot = (0, 90 + rng.uniform(-3, 3), rng.uniform(-4, 4))
            r = rng.uniform(0.01, 0.022)
            for shift in (-4, 0, 4):
                part("cyl", (r, ln), (cx + shift, math.cos(a) * d - 0.02, z + math.sin(a) * d), mat, root, rot=rot, name="twig", segments=5)
        for x in range(-int(length / 2), int(length / 2) + 1):
            part("cyl", (0.122, 0.05), (x + 0.5 * (row % 2), 0, z), M("#2f2416", "plain", 0.9), root, rot=(0, 90, 0), name="tie", segments=10)
    for x in range(-int(length / 2), int(length / 2) + 1):
        part("cyl", (0.04, height + 0.25), (x, -0.13, (height + 0.25) / 2), M("#4f3b24", "bark", 0.9), root, name="stake", segments=6)


BUILDERS = {
    "gabion": build_gabion, "sandbags": build_sandbags,
    "tower_fr": lambda r: build_tower(r, "fr"),
    "tower_br": lambda r: build_tower(r, "br"),
    "hospital_fr": lambda r: build_hospital(r, "fr"),
    "hospital_br": lambda r: build_hospital(r, "br"),
    "barracks_fr": lambda r: build_barracks(r, "fr"),
    "barracks_br": lambda r: build_barracks(r, "br"),
    "farmhouse": build_farmhouse, "barn": build_barn, "cottage": build_cottage, "well": build_well,
    "haystack": build_haystack, "oak": build_oak, "poplar": build_poplar, "bush": build_bush, "fence": build_fence,
    "beech": build_beech, "birch": build_birch, "pine": build_pine, "spruce": build_spruce, "willow": build_willow,
    "hawthorn": build_hawthorn, "hazel": build_hazel, "fern": build_fern,
    "bridge": build_bridge, "bridge_stone": build_bridge_stone, "bridge_wood": build_bridge_wood,
    "lumbercamp_fr": lambda r: build_lumbercamp(r, "fr"),
    "lumbercamp_br": lambda r: build_lumbercamp(r, "br"),
    "field_bare": lambda r: build_field(r, "bare"),
    "field_young": lambda r: build_field(r, "young"),
    "field_ripe": lambda r: build_field(r, "ripe"),
}


def world_points():
    deps = bpy.context.evaluated_depsgraph_get()
    pts = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        ev = obj.evaluated_get(deps)
        mw = ev.matrix_world
        pts += [mw @ v.co for v in ev.data.vertices]
    return pts


# Buildings turn to the camera at an angle so two facades and a gable show.
YAW = {"lumbercamp_fr": 28, "lumbercamp_br": -28, "tower_fr": 20, "tower_br": -20, "hospital_fr": 24, "hospital_br": -24, "barracks_fr": 32, "barracks_br": -32, "farmhouse": -28, "barn": 30, "cottage": 38, "well": 20}


def normal_override() -> bpy.types.Material:
    """A material that shows each surface's direction as seen by the camera:
    x to the right, y up the screen, z towards the viewer, as 0..1 colour (the
    normal map Godot lights a 2D sprite by)."""
    mat = bpy.data.materials.new("screen_normal")
    tree = mat.node_tree
    tree.nodes.clear()
    geo = tree.nodes.new("ShaderNodeNewGeometry")
    turn = tree.nodes.new("ShaderNodeVectorTransform")
    turn.vector_type = "NORMAL"
    turn.convert_from = "WORLD"
    turn.convert_to = "CAMERA"
    # Blender's camera looks along -z: z towards the viewer is +z already.
    half = tree.nodes.new("ShaderNodeVectorMath")
    half.operation = "MULTIPLY_ADD"
    half.inputs[1].default_value = (0.5, 0.5, 0.5)
    half.inputs[2].default_value = (0.5, 0.5, 0.5)
    emit = tree.nodes.new("ShaderNodeEmission")
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(geo.outputs["Normal"], turn.inputs["Vector"])
    tree.links.new(turn.outputs["Vector"], half.inputs[0])
    tree.links.new(half.outputs["Vector"], emit.inputs["Color"])
    tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def render_prop(kind: str, out: Path, samples: int, normals: bool = False) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render(samples)
    root = empty("root", rot=(0, 0, YAW.get(kind, 0)))
    BUILDERS[kind](root)
    bpy.context.view_layer.update()
    pts = world_points()
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    height = max(zs)
    off = SHADOW * height
    pad = 0.6
    x0, x1 = min(xs) - pad, max(xs) + off.x + pad
    y0, y1 = min(ys) + off.y - pad, max(ys) + pad
    shadow_catcher("ground", [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    corners = [Vector((x, y, 0)) for x in (x0, x1) for y in (y0, y1)] + pts
    sx = [p.dot(RIGHT) for p in corners]
    su = [screen_up(p) for p in corners]
    ppm = SPRITE_PX_PER_M
    w = math.ceil((max(sx) - min(sx)) * ppm) + 4
    h = math.ceil((max(su) - min(su)) * ppm) + 4
    pivot = (round(-min(sx) * ppm) + 2, round(max(su) * ppm) + 2)
    camera(w, h, ppm, pivot)
    if normals:
        # The same frame, each surface's direction instead of its colour; no
        # shadow catcher (the ground is not lit by it).
        bpy.data.objects["ground"].hide_render = True
        bpy.context.view_layer.material_override = normal_override()
        scene = bpy.context.scene
        scene.cycles.samples = 4
        scene.cycles.use_denoising = False
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        path = out / f"{kind}_n.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        return {"normals": path.name}
    path = out / f"{kind}.png"
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    # Clear denoise speckle, and feather the soft sky-occlusion shadow towards
    # the frame so the rectangular shadow catcher never shows a hard edge.
    pw, ph, rgba = read_rgba(path)
    buf = bytearray(rgba)
    feather = 40
    for i in range(3, len(buf), 4):
        px = (i // 4) % pw
        py = (i // 4) // pw
        if buf[i] and buf[i] < 200 and buf[i - 3] + buf[i - 2] + buf[i - 1] < 45:
            edge = min(px, py, pw - 1 - px, ph - 1 - py)
            if edge < feather:
                buf[i] = buf[i] * edge // feather
        if buf[i] < ALPHA_FLOOR:
            buf[i - 3:i + 1] = b"\0\0\0\0"
    write_rgba(path, pw, ph, bytes(buf))
    return {"image": path.name, "w": pw, "h": ph, "pivot": {"x": pivot[0], "y": pivot[1]},
            "footprint": {"w": round(max(xs) - min(xs), 2), "d": round(max(ys) - min(ys), 2)},
            "heightM": round(height, 2)}


def render_tile(kind: str, out: Path, samples: int) -> dict:
    """A seamless horizontal strip of a wall as the iso camera sees it (the
    trench's far wall): 4 m wide, its top at the image top."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render(samples)
    root = empty("root")
    build_fascine_wall(root)
    ppm, width_m, height_m = SPRITE_PX_PER_M * 3, 4.0, 1.25
    w, h = round(width_m * ppm), math.ceil(height_m * math.cos(math.radians(30)) * ppm + 0.25 * ppm)
    camera(w, h, ppm, (0, h), origin=(-2.0, 0.0, 0.0))
    path = out / f"{kind}.png"
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return {"image": path.name, "w": w, "h": h, "tileM": width_m, "pxPerM": round(ppm, 3)}


TILES = {"fascine_wall": render_tile}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="graphics-lab/assets/iso/props")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--normals", action="store_true",
                    help="render only each prop's normal map (<kind>_n.png), for lit 2D sprites")
    args = ap.parse_args(argv)
    if args.normals:
        out = Path(args.out).resolve()
        out.mkdir(parents=True, exist_ok=True)
        for kind in args.only or list(BUILDERS):
            print(kind, render_prop(kind, out, args.samples, normals=True))
        return 0
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "props.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest.setdefault("pxPerM", round(SPRITE_PX_PER_M, 4))
    manifest.setdefault("source", "scripts/render-iso-props.py (Blender, original procedural models)")
    manifest.setdefault("props", {})
    for kind in args.only or [*BUILDERS, *TILES]:
        manifest["props"][kind] = TILES[kind](kind, out, args.samples) if kind in TILES else render_prop(kind, out, args.samples)
        print(kind, manifest["props"][kind])
    manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
