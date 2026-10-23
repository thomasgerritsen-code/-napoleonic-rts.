#!/usr/bin/env python3
"""Render the regiment's officer, drummer and ensign for the Graphics Lab iso scene.

Reuses the fusilier body from render-iso-infantry.py (same camera, sun, rig
and uniform colours), removes musket and pack and adds each role's own kit:
- officer: epaulettes, gorget, gold shako band (British: crimson sash), drawn sword;
- drummer: lace chevrons (British: reversed buff coat), drum and sticks;
- ensign: the regiment's colour on a pole (French eagle and 1804 flag,
  British Union colour).
Each role gets idle 2, march 6 and command 2 frames (sword raised, beating
the charge, colour raised) in 8 directions, in 176x160 cells (feet 88,140)
so a raised colour fits.

  python scripts/render-iso-roles.py --side france --role ensign --out art/frames/iso-proof
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

CELL_W, CELL_H = 176, 160
PIVOT = (88, 140)
STATES = [("idle", 2), ("march", 6), ("command", 2)]
ROLES = {"officer": "o", "drummer": "d", "ensign": "e", "worker": "w"}
# The peasant (the game's worker) walks and works instead of giving commands.
# work: felling with the axe; farm: hoeing the crop; mine: the pickaxe on ore; build: the hammer.
ROLE_STATES = {"worker": [("idle", 2), ("march", 6), ("work", 4), ("farm", 4), ("mine", 4), ("build", 4)]}
# Uniform pieces the peasant does not wear.
UNIFORM = ("shako", "plate", "plume", "pompom", "cord", "chinscale", "visor", "band", "epaulette", "wing",
           "winglace", "fringe", "lace", "button", "scabbard", "turnback", "gaitertop", "tuft")
GOLD = "#d4ad45"
STRIPPED = ("pack", "packstrap", "roll", "messtin", "cartridge", "haversack", "canteen", "belt", "beltplate")


def hide_tree(obj, hidden=True) -> None:
    obj.hide_render = hidden
    for child in obj.children:
        hide_tree(child, hidden)


def flag_cloth(name, width, height, colour_at, parent, loc):
    """Waving flag: a subdivided plane whose faces are coloured by colour_at(u, v)."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=24, y_subdivisions=18, size=1)
    obj = bpy.context.object
    obj.name = name
    mesh = obj.data
    palette = {}
    for poly in mesh.polygons:
        c = poly.center
        colour = colour_at(c.x + 0.5, c.y + 0.5)
        if colour not in palette:
            palette[colour] = len(palette)
            mesh.materials.append(material(colour, 0.85, pattern="cloth"))
        poly.material_index = palette[colour]
    for v in mesh.vertices:
        u = v.co.x + 0.5
        # Lay the cloth in the XZ plane, hoist at u=0, with a wave that grows to the fly.
        v.co = (u * width, math.sin(u * 7.0 + v.co.y * 1.5) * 0.09 * u, (v.co.y + 0.5) * height)
    obj.parent = parent
    obj.location = loc
    return obj


def french_1804(u, v):
    # White lozenge, blue and red corner triangles (1804 pattern).
    if abs(u - 0.5) + abs(v - 0.5) < 0.5:
        return "#f2efe6"
    return "#24315c" if (u - 0.5) * (v - 0.5) > 0 else "#b02a2e"


def union_colour(u, v):
    du, dv = u - 0.5, v - 0.5
    if abs(du) < 0.06 or abs(dv) < 0.07:
        return "#c0282d"
    if abs(du) < 0.1 or abs(dv) < 0.11:
        return "#f2efe6"
    if abs(abs(du) - abs(dv)) < 0.05:
        return "#f2efe6"
    return "#22336b"


def build_role(side: str, role: str) -> dict:
    rig = infantry.build_soldier(side, 1)
    hide_tree(rig["musket"])
    rig["armed"] = False
    for obj in bpy.data.objects:
        if obj.name.split(".")[0] in STRIPPED:
            obj.hide_render = True
    torso, british = rig["torso"], side == "britain"
    head = bpy.data.objects["head"]
    gold = material(GOLD, 0.3, 0.85, pattern="plain")
    sh_r, el_r, _, _ = rig["joints"]["R"]
    sh_l, el_l, _, _ = rig["joints"]["L"]
    props = {}
    if role == "worker":
        # A linen smock over brown breeches, a straw hat, an axe.
        smock = material("#cfc4a6" if not british else "#b9b08f", 0.9, pattern="cloth")
        breeches = material("#5d4733", 0.9, pattern="cloth")
        for obj in bpy.data.objects:
            base = obj.name.split(".")[0]
            if base in UNIFORM:
                obj.hide_render = True
            elif base in ("coat", "chest", "tails", "upperarm", "forearm", "lapel", "collar", "cuff") and obj.data:
                obj.data.materials[0] = smock
            elif base in ("thigh", "waist") and obj.data:
                obj.data.materials[0] = breeches
        straw = material("#c8b06a", 0.9, pattern="straw")
        part("cyl", (0.2, 0.025), (0, 0, 0.17), straw, head, name="brim", segments=20)
        part("cyl", (0.1, 0.12, 0.085), (0, 0, 0.23), straw, head, name="crown", segments=16)
        axe = empty("axe", el_r, (0, 0.01, -0.29))
        part("cyl", (0.018, 0.85), (0, 0, -0.2), material("#7a5a36", 0.7, pattern="plain"), axe, name="haft")
        steel = material("#8d9296", 0.35, 0.8, pattern="plain")
        wood = material("#7a5a36", 0.7, pattern="plain")
        part("box", (0.03, 0.16, 0.12), (0, 0.06, -0.6), steel, axe, name="axehead")
        props["axe"] = axe
        # A hoe: a long haft with its blade across the end.
        hoe = empty("hoe", el_r, (0, 0.01, -0.29))
        # (Short enough that it strikes the soil within the frame when he faces the camera.)
        part("cyl", (0.016, 1.05), (0, 0, -0.32), wood, hoe, name="hoehaft")
        part("box", (0.16, 0.13, 0.02), (0, 0.07, -0.82), steel, hoe, rot=(70, 0, 0), name="hoeblade")
        props["hoe"] = hoe
        # A pickaxe: a shorter haft and a two-pointed iron head.
        pick = empty("pick", el_r, (0, 0.01, -0.29))
        part("cyl", (0.02, 0.85), (0, 0, -0.25), wood, pick, name="pickhaft")
        part("cyl", (0.025, 0.62, 0.006), (0, 0.16, -0.66), steel, pick, rot=(90, 0, 0), name="pickpoint")
        part("cyl", (0.025, 0.3, 0.006), (0, -0.1, -0.66), steel, pick, rot=(-90, 0, 0), name="pickback")
        props["pick"] = pick
        # A carpenter's hammer.
        hammer = empty("hammer", el_r, (0, 0.01, -0.29))
        part("cyl", (0.012, 0.32), (0, 0, -0.08), wood, hammer, name="hammerhaft")
        part("box", (0.03, 0.11, 0.035), (0, 0.02, -0.23), steel, hammer, name="hammerhead")
        props["hammer"] = hammer
    elif role == "officer":
        for sh in (sh_r, sh_l):
            part("cyl", (0.075, 0.05, 0.09), (0, 0, 0.0), gold, sh, name="epaulette")
        part("box", (0.11, 0.02, 0.06), (0, 0.12, 0.55), gold, torso, name="gorget")
        part("cyl", (0.1, 0.03, 0.105), (0, 0, 0.245), gold, head, name="shakoband")
        if british:
            part("cyl", (0.17, 0.1, 0.16), (0, 0, 0.02), material("#8f1d2c", 0.8, pattern="cloth"), torso, name="sash")
        part("cyl", (0.02, 0.5, 0.012), (-0.2, -0.05, -0.15), material("#2a2a2a", 0.4, pattern="plain"), torso,
             rot=(0, -10, 0), name="sheath")
        sword = empty("sword", el_r, (0, 0.01, -0.29))
        part("cyl", (0.012, 0.8, 0.003), (0, 0, -0.45), material("#c7ccd0", 0.25, 0.9, pattern="plain"), sword, name="blade")
        part("box", (0.09, 0.02, 0.02), (0, 0, -0.04), gold, sword, name="guard")
        props["sword"] = sword
    elif role == "drummer":
        lace = material("#f1ebdd" if british else GOLD, 0.6, pattern="plain")
        if british:
            for name in ("coat", "chest", "tails", "upperarm", "forearm"):
                for obj in bpy.data.objects:
                    if obj.name.split(".")[0] == name:
                        obj.data.materials[0] = material("#d8c38a", 0.8, pattern="cloth")
        for sh in (sh_r, sh_l):
            for i in range(3):
                part("box", (0.125, 0.125, 0.018), (0, 0, -0.08 - i * 0.07), lace, sh, rot=(0, 0, 0), name="chevron")
        for i in range(4):
            part("box", (0.3, 0.012, 0.022), (0, 0.124, 0.22 + i * 0.08), lace, torso, name="drumlace")
        drum = empty("drum", torso, (-0.08, 0.24, -0.2), (70, 0, -25))
        part("cyl", (0.19, 0.3), (0, 0, 0), material("#c9a33c" if not british else "#e8e2d0", 0.35, 0.6, pattern="plain"),
             drum, name="shell", segments=24)
        for z in (0.15, -0.15):
            part("cyl", (0.205, 0.04), (0, 0, z), material("#24315c" if not british else "#b3262b", 0.7, pattern="plain"),
                 drum, name="hoop", segments=24)
        part("cyl", (0.185, 0.01), (0, 0, 0.17), material("#ece6d4", 0.9, pattern="plain"), drum, name="skin", segments=24)
        for el in (el_r, el_l):
            stick = empty("stick", el, (0, 0.01, -0.29), (60, 0, 0))
            part("cyl", (0.01, 0.38, 0.006), (0, 0, -0.17), material("#6a4322", 0.6, pattern="plain"), stick, name="drumstick")
    else:  # ensign
        part("cyl", (0.17, 0.1, 0.16), (0, 0, 0.02), material("#8f1d2c" if british else "#f2efe6", 0.8, pattern="cloth"),
             torso, name="sash")
        part("box", (0.045, 0.272, 0.66), (0, 0, 0.3), material("#f3f0e8", 0.7, pattern="cloth"), torso, rot=(0, -38, 0),
             name="carrier")
        pole = empty("pole", torso, (0.05, 0.36, -0.35))
        part("cyl", (0.018, 2.3), (0, 0, 1.15), material("#3b2a1c" if not british else "#6a4a2a", 0.6, pattern="plain"),
             pole, name="staff")
        if british:
            part("cyl", (0.035, 0.16, 0.0), (0, 0, 2.38), gold, pole, name="finial")
            flag_cloth("colour", 1.0, 0.8, union_colour, pole, (0.02, 0, 1.4))
        else:
            # Gilt eagle with spread wings on a plinth.
            part("box", (0.08, 0.06, 0.04), (0, 0, 2.32), gold, pole, name="plinth")
            part("ball", (0.06, 0.8, 1, 1.2), (0, 0, 2.42), gold, pole, name="eagle")
            part("box", (0.26, 0.02, 0.08), (0, 0, 2.47), gold, pole, rot=(0, 0, 0), name="wings")
            flag_cloth("colour", 0.8, 0.8, french_1804, pole, (0.02, 0, 1.45))
        props["pole"] = pole
    rig["props"] = props
    return rig


def pose_role(rig: dict, role: str, state: str, frame: int, frames: int) -> None:
    rad = math.radians
    # Legs and body come from the fusilier's idle/march poses.
    infantry.pose(rig, "march" if state == "march" else "idle", frame if state == "march" else frame % 2,
                  frames if state == "march" else 2)
    sh_r, el_r, _, _ = rig["joints"]["R"]
    sh_l, el_l, _, _ = rig["joints"]["L"]
    t = frame / max(1, frames)
    if role == "worker":
        axe = rig["props"]["axe"]
        # Only the tool of the task in hand; on the march and at rest, the axe on the shoulder.
        tool = {"farm": "hoe", "mine": "pick", "build": "hammer"}.get(state, "axe")
        for name in ("axe", "hoe", "pick", "hammer"):
            hide_tree(rig["props"][name], name != tool)
        torso = rig["torso"]
        torso.rotation_euler = Euler((0, 0, 0))
        if state == "farm":
            # Hoeing: bent over the row, the hoe lifted and chopped into the soil.
            # (In this rig a negative turn of the torso leans it forward.)
            torso.rotation_euler = Euler((rad(-(22, 26, 34, 30)[frame % 4]), 0, 0))
            lift = (100, 72, 34, 52)[frame % 4]
            sh_r.rotation_euler = Euler((rad(lift), rad(8), 0))
            sh_l.rotation_euler = Euler((rad(lift + 12), rad(-22), 0))
            el_r.rotation_euler = el_l.rotation_euler = Euler((rad(25), 0, 0))
            rig["props"]["hoe"].rotation_euler = Euler((rad((45, 35, 4, 20)[frame % 4]), 0, 0))
        elif state == "mine":
            # The pickaxe swung over the head and brought down on the ore.
            torso.rotation_euler = Euler((rad(-(4, 10, 32, 20)[frame % 4]), 0, 0))
            lift = (175, 140, 38, 95)[frame % 4]
            sh_r.rotation_euler = Euler((rad(lift), rad(8), 0))
            sh_l.rotation_euler = Euler((rad(lift - 8), rad(-18), 0))
            el_r.rotation_euler = el_l.rotation_euler = Euler((rad(18), 0, 0))
            rig["props"]["pick"].rotation_euler = Euler((rad((80, 75, 22, 50)[frame % 4]), 0, 0))
        elif state == "build":
            # Stooped at the work, the left hand holding a nail, the hammer striking.
            torso.rotation_euler = Euler((rad(-34), 0, 0))
            sh_r.rotation_euler = Euler((rad((95, 55, 80, 60)[frame % 4]), rad(14), 0))
            el_r.rotation_euler = Euler((rad((70, 25, 55, 32)[frame % 4]), 0, 0))
            sh_l.rotation_euler = Euler((rad(55), rad(-14), 0))
            el_l.rotation_euler = Euler((rad(40), 0, 0))
            rig["props"]["hammer"].rotation_euler = Euler((rad(90), 0, 0))
        elif state == "work":
            # Chopping: both hands on the haft, raised and brought down.
            lift = [150, 110, 40, 90][frame % 4]
            sh_r.rotation_euler = Euler((rad(lift), rad(10), 0))
            sh_l.rotation_euler = Euler((rad(lift - 10), rad(-20), 0))
            el_r.rotation_euler = el_l.rotation_euler = Euler((rad(20), 0, 0))
            axe.rotation_euler = Euler((rad(70), 0, 0))
        else:
            # Axe carried on the shoulder.
            sh_r.rotation_euler = Euler((rad(30), rad(14), 0))
            el_r.rotation_euler = Euler((rad(100), 0, 0))
            axe.rotation_euler = Euler((rad(150), 0, 0))
            swing = math.sin(t * math.tau) * 18 if state == "march" else 0
            sh_l.rotation_euler = Euler((rad(-swing), rad(-8), 0))
            el_l.rotation_euler = Euler((rad(15), 0, 0))
    elif role == "officer":
        sword = rig["props"]["sword"]
        if state == "command":
            # Sword raised towards the enemy: "Feu!"
            sh_r.rotation_euler = Euler((rad(150 - 25 * frame), rad(10), 0))
            el_r.rotation_euler = Euler((rad(8), 0, 0))
            sword.rotation_euler = Euler((rad(-10), 0, 0))
        else:
            # Sword sloped at the shoulder, swinging lightly on the march.
            swing = math.sin(t * math.tau) if state == "march" else 0
            sh_r.rotation_euler = Euler((rad(28 + 6 * swing), rad(12), 0))
            el_r.rotation_euler = Euler((rad(88), 0, 0))
            sword.rotation_euler = Euler((rad(80), 0, 0))
        sh_l.rotation_euler = Euler((rad(8), rad(-14), 0))
        el_l.rotation_euler = Euler((rad(30), 0, 0))
    elif role == "drummer":
        amp, base = (22, 46) if state == "march" else (34, 50) if state == "command" else (0, 44)
        beat = math.sin(t * math.tau * (2 if state == "command" else 1)) if state != "idle" else 0
        sh_r.rotation_euler = Euler((rad(base + amp * beat), rad(18), 0))
        sh_l.rotation_euler = Euler((rad(base - amp * beat), rad(-8), 0))
        el_r.rotation_euler = el_l.rotation_euler = Euler((rad(62), 0, 0))
    else:
        pole = rig["props"]["pole"]
        if state == "command":
            # Colour raised and dipped towards the enemy.
            pole.location = (0.05, 0.4, -0.22)
            pole.rotation_euler = Euler((rad(-10 - 6 * frame), 0, 0))
            sh_r.rotation_euler = Euler((rad(80), rad(12), 0))
            sh_l.rotation_euler = Euler((rad(100), rad(-12), 0))
        else:
            sway = math.sin(t * math.tau) * (3 if state == "march" else 1.5 * (1 - 2 * frame))
            pole.location = (0.05, 0.36, -0.35)
            pole.rotation_euler = Euler((rad(sway), 0, 0))
            # Right hand at chest height, left hand higher up the staff.
            sh_r.rotation_euler = Euler((rad(42), rad(22), 0))
            sh_l.rotation_euler = Euler((rad(78), rad(-6), 0))
        el_r.rotation_euler = Euler((rad(62), 0, 0))
        el_l.rotation_euler = Euler((rad(32), 0, 0))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--side", choices=sorted(infantry.PALETTES), required=True)
    ap.add_argument("--role", choices=sorted(ROLES), required=True)
    ap.add_argument("--out", default="art/frames/iso-proof")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--supersample", type=int, default=2)
    ap.add_argument("--states", nargs="*", help="render only these states (review)")
    ap.add_argument("--dirs", nargs="*", help="render only these directions (review)")
    args = ap.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render(args.samples)
    ss = args.supersample
    camera(CELL_W * ss, CELL_H * ss, SPRITE_PX_PER_M * ss, (PIVOT[0] * ss, PIVOT[1] * ss))
    shadow_catcher("ground", [(0.2 + 0.85 * math.cos(a / 24 * math.tau), 0.05 + 0.85 * math.sin(a / 24 * math.tau))
                              for a in range(24)])
    rig = build_role(args.side, args.role)
    prefix = ("fr" if args.side == "france" else "br") + ROLES[args.role]
    out = Path(args.out).resolve() / "roles" / f"{args.side}_{args.role}"
    out.mkdir(parents=True, exist_ok=True)
    for d, name in enumerate(infantry.DIRECTIONS):
        if args.dirs and name not in args.dirs:
            continue
        rig["root"].rotation_euler = Euler((0, 0, math.radians(-45 * d - 90)))
        for state, frames in ROLE_STATES.get(args.role, STATES):
            if args.states and state not in args.states:
                continue
            for f in range(frames):
                pose_role(rig, args.role, state, f, frames)
                bpy.context.view_layer.update()
                bpy.context.scene.render.filepath = str(out / f"{prefix}_iso_{state}_{name}_{f + 1:02d}.png")
                bpy.ops.render.render(write_still=True)
    print(f"{args.side} {args.role}: {8 * sum(n for _, n in ROLE_STATES.get(args.role, STATES))} frames -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
