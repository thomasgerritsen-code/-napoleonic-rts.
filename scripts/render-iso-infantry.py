#!/usr/bin/env python3
"""Render the isometric Blender infantry proof (Graphics Lab iso proof).

Builds an original, script-generated 1809 line fusilier from primitives (no
third-party model), poses it per frame and renders 8 directions x (2 idle +
6 march) frames (128 px) with one fixed orthographic camera and one fixed sun. The
same rig and colour tables produce the French and the British soldier.

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

FRAME = 128              # output cell, px
PIVOT = (64, 104)        # feet on screen, px
ELEVATION = 30.0         # camera elevation, degrees (classic RTS 3/4 view)
ORTHO_SCALE = 3.1       # metres covered by the 128 px frame
DIRECTIONS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"]  # clockwise on screen
STATES = [("idle", 2), ("march", 6)]

PALETTES = {
    "france": {
        "coat": "#24315c", "lapel": "#e9e5d8", "collar": "#a62222", "cuff": "#a62222",
        "turnback": "#e9e5d8", "breeches": "#ddd8c8", "gaiter": "#1b1b1b",
        "shako": "#161616", "plate": "#c9a33c", "pompom": "#2f7d3a", "pack": "#7b5636",
        "roll": "#4b5a73", "belt": "#f1eee6", "lace": None,
    },
    "britain": {
        "coat": "#b0262a", "lapel": "#b0262a", "collar": "#e2d6a8", "cuff": "#e2d6a8",
        "turnback": "#efe9dc", "breeches": "#8c8f93", "gaiter": "#1b1b1b",
        "shako": "#161616", "plate": "#c9a33c", "pompom": "#efe9dc", "pack": "#262626",
        "roll": "#5b5f66", "belt": "#f1eee6", "lace": "#f4f1ea",
    },
}
COMMON = {"skin": "#d6a27c", "wood": "#6a4322", "steel": "#a3a9ae", "shoe": "#101010",
          "box": "#151515"}


def linear(hex_color: str) -> tuple[float, float, float, float]:
    h = hex_color.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)


_materials: dict[str, bpy.types.Material] = {}


def material(hex_color: str, rough: float = 0.75, metal: float = 0.0) -> bpy.types.Material:
    key = f"{hex_color}-{rough}-{metal}"
    if key not in _materials:
        m = bpy.data.materials.new(key)
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = linear(hex_color)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        _materials[key] = m
    return _materials[key]


def empty(name, parent=None, loc=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    return obj


def part(kind, size, loc, mat, parent, rot=(0, 0, 0), name="part"):
    """kind: box (size=x,y,z), cyl (size=r,depth[,r_top]), ball (size=r[,sx,sy,sz])."""
    if kind == "box":
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj = bpy.context.object
        obj.scale = size
    elif kind == "cyl":
        r, depth = size[0], size[1]
        top = size[2] if len(size) > 2 else r
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=r, radius2=top, depth=depth)
        obj = bpy.context.object
        bpy.ops.object.shade_smooth()
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=size[0])
        obj = bpy.context.object
        if len(size) == 4:
            obj.scale = size[1:]
        bpy.ops.object.shade_smooth()
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    return obj


def build_soldier(side: str) -> dict:
    p = {**PALETTES[side], **COMMON}
    M = {k: material(v) for k, v in p.items() if v}
    M["steel"] = material(p["steel"], 0.35, 0.8)
    M["plate"] = material(p["plate"], 0.35, 0.9)
    root = empty("root")
    hips = empty("hips", root, (0, 0, 0.95))
    torso = empty("torso", hips, (0, 0, 0))
    # Coat body, open French lapels / British laced front, collar and tails.
    part("box", (0.36, 0.23, 0.56), (0, 0, 0.29), M["coat"], torso, name="coat")
    if not p["lace"]:
        part("box", (0.2, 0.02, 0.34), (0, 0.118, 0.36), M["lapel"], torso, name="lapel")
    else:
        for i in range(5):
            part("box", (0.16, 0.012, 0.022), (0, 0.13, 0.22 + i * 0.065), M["lace"], torso, name="lace")
    part("box", (0.3, 0.04, 0.26), (0, -0.115, -0.08), M["coat"], torso, name="tails")
    part("box", (0.06, 0.045, 0.24), (0.11, -0.12, -0.08), M["turnback"], torso, name="turnback")
    part("box", (0.06, 0.045, 0.24), (-0.11, -0.12, -0.08), M["turnback"], torso, name="turnback")
    part("box", (0.3, 0.2, 0.16), (0, 0.01, -0.02), M["breeches"], torso, name="waist")
    # White crossbelts read as an X on chest and back.
    for angle in (38, -38):
        part("box", (0.042, 0.27, 0.66), (0, 0, 0.3), M["belt"], torso, rot=(0, angle, 0), name="belt")
    part("box", (0.2, 0.08, 0.13), (0.1, -0.14, 0.0), M["box"], torso, name="cartridge")
    part("box", (0.3, 0.13, 0.31), (0, -0.185, 0.38), M["pack"], torso, name="pack")
    part("cyl", (0.055, 0.32), (0, -0.17, 0.57), M["roll"], torso, rot=(0, 90, 0), name="roll")
    part("cyl", (0.075, 0.07), (0, 0, 0.6), M["collar"], torso, name="collar")
    head = empty("head", torso, (0, 0, 0.72))
    part("ball", (0.105,), (0, 0.01, 0), M["skin"], head, name="face")
    part("cyl", (0.098, 0.2, 0.112), (0, 0, 0.16), M["shako"], head, name="shako")
    part("box", (0.13, 0.06, 0.014), (0, 0.1, 0.075), M["shako"], head, rot=(-12, 0, 0), name="visor")
    part("box", (0.08, 0.015, 0.08), (0, 0.105, 0.15), M["plate"], head, name="plate")
    part("ball", (0.035,), (0, 0.06, 0.285), M["pompom"], head, name="pompom")
    joints = {}
    for sign, key in ((1, "R"), (-1, "L")):
        sh = empty("shoulder" + key, torso, (0.215 * sign, 0, 0.52))
        part("cyl", (0.058, 0.3), (0, 0, -0.15), M["coat"], sh, name="upperarm")
        el = empty("elbow" + key, sh, (0, 0, -0.3))
        part("cyl", (0.05, 0.25), (0, 0, -0.125), M["coat"], el, name="forearm")
        part("cyl", (0.056, 0.07), (0, 0, -0.22), M["cuff"], el, name="cuff")
        part("ball", (0.045,), (0, 0, -0.29), M["skin"], el, name="hand")
        th = empty("thigh" + key, hips, (0.095 * sign, 0, 0))
        part("cyl", (0.078, 0.46, 0.066), (0, 0, -0.23), M["breeches"], th, name="thigh")
        kn = empty("knee" + key, th, (0, 0, -0.45))
        part("cyl", (0.064, 0.42, 0.055), (0, 0, -0.21), M["gaiter"], kn, name="shin")
        part("box", (0.1, 0.24, 0.07), (0, 0.05, -0.455), M["shoe"], kn, name="shoe")
        joints[key] = (sh, el, th, kn)
    # Shouldered musket on the left: butt in the left hand, barrel past the shoulder.
    musket = empty("musket", torso, (-0.25, 0.1, -0.05))
    musket.rotation_euler = Euler((math.radians(-22), math.radians(-6), 0))
    part("box", (0.05, 0.09, 0.32), (0, 0, 0.16), M["wood"], musket, name="butt")
    part("cyl", (0.022, 0.95), (0, 0, 0.78), M["wood"], musket, name="stock")
    part("cyl", (0.012, 0.36), (0, 0, 1.4), M["steel"], musket, name="bayonet")
    return {"root": root, "hips": hips, "torso": torso, "joints": joints, "musket": musket}


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


def setup_scene(samples: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = FRAME
    scene.render.film_transparent = True
    scene.render.filter_size = 1.2
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = linear("#b9c4cf")
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.75
    scene.world = world
    # Fixed orthographic 3/4 camera; screen-right is world +X.
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ORTHO_SCALE
    cam_data.shift_y = (PIVOT[1] - FRAME / 2) / FRAME
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    el = math.radians(ELEVATION)
    cam.location = (0, -20 * math.cos(el), 20 * math.sin(el))
    cam.rotation_euler = Euler((math.radians(90) - el, 0, 0))
    scene.camera = cam
    # Sun from the upper left of the screen; short shadow to the lower right.
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.6
    sun_data.angle = math.radians(6)
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = Euler((math.radians(26), 0, math.radians(-135)))
    # Small shadow catcher under the feet: its edge stays inside the frame.
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=1.0, fill_type="NGON", location=(0.25, 0.1, 0))
    ground = bpy.context.object
    ground.is_shadow_catcher = True


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--side", choices=sorted(PALETTES), required=True)
    ap.add_argument("--out", default="art/frames/iso-proof")
    ap.add_argument("--samples", type=int, default=48)
    args = ap.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_scene(args.samples)
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
                path = out / f"{prefix}_iso_{state}_{name}_{f + 1:02d}.png"
                bpy.context.scene.render.filepath = str(path)
                bpy.ops.render.render(write_still=True)
    print(f"{args.side}: {len(DIRECTIONS) * sum(n for _, n in STATES)} frames -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
