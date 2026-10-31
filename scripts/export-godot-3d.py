"""The 3D Godot version's models: the same Blender models the iso sprites are
rendered from (render-iso-props.py, -infantry, -roles, -cavalry,
-artillery), exported as glTF for Godot.

- Buildings, trees and other props: one mesh each, their procedural
  materials (brick, thatch, bark...) baked into one texture.
- Soldiers, officers, drummers, peasants, horsemen, guns and gunners: their
  parts kept apart and animated: every state the sprites have (idle, march,
  aim, fire, reload, die, walk, trot, gallop...) becomes an animation of the
  same name, keyed from the very poses the sprites were rendered in. Their
  materials become plain colours (they are small on the screen).

Each model is exported in a process of its own (the builders keep materials
between models). Run with Blender's Python (bpy):

  python scripts/export-godot-3d.py --out godot/assets3d            # all
  python scripts/export-godot-3d.py --out godot/assets3d --only oak  # one
"""
import argparse
import importlib.util
import math
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Euler

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def _load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


common = _load("iso_blender_common", "iso_blender_common.py")
props = _load("render_iso_props", "render-iso-props.py")
infantry = _load("render_iso_infantry", "render-iso-infantry.py")
roles = _load("render_iso_roles", "render-iso-roles.py")
cavalry = _load("render_iso_cavalry", "render-iso-cavalry.py")
artillery = _load("render_iso_artillery", "render-iso-artillery.py")

STATIC = [k for k in props.BUILDERS]
SIDES = {"fr": "france", "br": "britain"}
LOOPING = {"idle", "march", "walk", "trot", "gallop", "roll", "haul", "work", "command", "rest", "dig", "ready", "load"}
FPS = 10


def animated_names() -> list[str]:
    names = []
    for p in SIDES:
        names += [f"infantry_{p}", f"officer_{p}", f"drummer_{p}", f"worker_{p}", f"cavalry_{p}", f"gun_{p}", f"gunner_{p}"]
    return names


def fresh() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 4
    scene.cycles.device = "CPU"
    scene.render.fps = FPS


def one_mesh(name: str) -> bpy.types.Object:
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and not o.hide_render]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    for o in list(bpy.context.scene.objects):
        if o != obj:
            bpy.data.objects.remove(o, do_unlink=True)
    return obj


def bake(obj: bpy.types.Object, size: int) -> None:
    """Every material's colour on `obj` into one image; one plain material with it."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    image = bpy.data.images.new(obj.name + "_albedo", size, size)
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or mat.node_tree is None:
            continue
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        mat.node_tree.nodes.active = node
    bpy.context.scene.cycles.bake_type = "DIFFUSE"
    settings = bpy.context.scene.render.bake
    settings.use_pass_direct = False
    settings.use_pass_indirect = False
    settings.use_pass_color = True
    settings.margin = 4
    bpy.ops.object.bake(type="DIFFUSE")
    plain = bpy.data.materials.new(obj.name + "_baked")
    tree = plain.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    image.pack()
    obj.data.materials.clear()
    obj.data.materials.append(plain)


def flatten_materials() -> None:
    """Plain colours: each material's own colour (its name starts with it),
    the procedural pattern dropped (glTF cannot carry it)."""
    for mat in bpy.data.materials:
        tree = mat.node_tree
        if tree is None or "Principled BSDF" not in tree.nodes:
            continue
        bsdf = tree.nodes["Principled BSDF"]
        base = bsdf.inputs["Base Color"]
        for link in list(base.links):
            tree.links.remove(link)
        hex_color = mat.name.split("-")[0]
        if hex_color.startswith("#") and len(hex_color) == 7:
            base.default_value = common.linear(hex_color)
        for name in ("Normal",):
            for link in list(bsdf.inputs[name].links):
                tree.links.remove(link)


def keyed_objects() -> list:
    return [o for o in bpy.context.scene.objects if o.name != "ground" and o.type in ("MESH", "EMPTY")]


def animate(states: list, poser) -> None:
    """Each state an NLA track of its name on every part, a key a frame."""
    objects = keyed_objects()
    rest = {obj: obj.scale.copy() for obj in objects}
    for obj in objects:
        obj.animation_data_create()

    def show_as_posed() -> None:
        # What a pose hides (the muzzle flash, the spade, a clod) has no
        # visibility in glTF: it is keyed at scale 0 instead.
        # (Only a part hidden with all it carries: a hidden holder with
        # visible parts under it keeps its size.)
        def gone(obj) -> bool:
            return obj.hide_render and all(gone(c) for c in obj.children)
        for obj in objects:
            obj.scale = (0.0, 0.0, 0.0) if gone(obj) else rest[obj]
    for state, frames in states:
        for obj in objects:
            obj.animation_data.action = bpy.data.actions.new(f"{obj.name}|{state}")
        loop = state in LOOPING
        for f in range(frames + (1 if loop else 0)):
            poser(state, f % frames, frames)
            show_as_posed()
            bpy.context.view_layer.update()
            for obj in objects:
                for path in ("location", "rotation_euler", "scale"):
                    obj.keyframe_insert(path, frame=f + 1)
        for obj in objects:
            action = obj.animation_data.action
            track = obj.animation_data.nla_tracks.new()
            track.name = state
            track.strips.new(state, 1, action)
            obj.animation_data.action = None
    # Back to the first pose.
    poser(states[0][0], 0, states[0][1])
    show_as_posed()


def export(path: Path, animated: bool) -> None:
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", export_apply=not animated,
                              export_yup=True, export_animations=animated,
                              export_animation_mode="NLA_TRACKS", export_force_sampling=True,
                              export_def_bones=False, export_image_format="AUTO")
    print("exported", path)


def build_animated(name: str) -> None:
    kind, p = name.rsplit("_", 1)
    side = SIDES[p]
    fresh()
    if kind == "infantry":
        rig = infantry.build_soldier(side, 1)
        rig["root"].rotation_euler = Euler((0, 0, 0))
        animate(infantry.STATES, lambda s, f, n: infantry.pose(rig, s, f, n, 0))
    elif kind in ("officer", "drummer", "worker"):
        rig = roles.build_role(side, kind)
        rig["root"].rotation_euler = Euler((0, 0, 0))
        animate(roles.ROLE_STATES.get(kind, roles.STATES), lambda s, f, n: roles.pose_role(rig, kind, s, f, n))
    elif kind == "cavalry":
        horse = cavalry.build_horse(side, 1)
        rider = cavalry.build_rider(side, horse)
        horse["root"].rotation_euler = Euler((0, 0, 0))
        animate(cavalry.STATES, lambda s, f, n: cavalry.pose(horse, rider, s, f, n, 0))
    elif kind == "gun":
        rig = artillery.build_gun(side, "6")
        rig["root"].rotation_euler = Euler((0, 0, 0))
        animate(artillery.GUN_STATES, lambda s, f, n: artillery.pose_gun(rig, s, f))
    elif kind == "gunner":
        rig = artillery.build_gunner(side)
        rig["root"].rotation_euler = Euler((0, 0, 0))
        animate(artillery.GUNNER_STATES, lambda s, f, n: artillery.pose_gunner(rig, s, f, n, 0))
    flatten_materials()


def build_static(name: str) -> None:
    fresh()
    root = common.empty("root")
    props.BUILDERS[name](root)
    bpy.context.view_layer.update()
    obj = one_mesh(name)
    big = name.startswith(("barracks", "farmhouse", "tower", "hospital", "barn", "bridge", "lumbercamp", "field"))
    bake(obj, 1024 if big else 512)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="godot/assets3d")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args(argv)
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    names = args.only or (STATIC + animated_names())
    if len(names) > 1:
        # One process each: the builders keep materials from model to model.
        failed = []
        for name in names:
            if subprocess.run([sys.executable, __file__, "--out", str(out), "--only", name]).returncode != 0:
                failed.append(name)
        print("failed:", failed)
        return 1 if failed else 0
    name = names[0]
    if name in STATIC:
        build_static(name)
        export(out / f"{name}.glb", False)
    else:
        build_animated(name)
        export(out / f"{name}.glb", True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
