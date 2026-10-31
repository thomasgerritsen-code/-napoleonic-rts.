"""Proof of a 3D Godot version: the Blender models the iso sprites are rendered
from (render-iso-props.py, render-iso-infantry.py), exported as glTF models
for Godot instead. Each model's procedural materials (brick, thatch, cloth,
bark...) are baked into one texture, since glTF carries images, not node
trees. Run with Blender's Python (bpy):

  python scripts/export-godot-3d-proof.py --out godot/proof3d/models
"""
import argparse
import importlib.util
import math
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


props = _load("render_iso_props", "render-iso-props.py")
infantry = _load("render_iso_infantry", "render-iso-infantry.py")
common = _load("iso_blender_common", "iso_blender_common.py")

PROPS = ["cottage", "farmhouse", "barracks_fr", "tower_fr", "oak", "birch", "pine", "bush", "haystack", "well"]


def fresh() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 4
    scene.cycles.device = "CPU"


def one_mesh(name: str) -> bpy.types.Object:
    """All meshes in the scene as one object, transforms applied."""
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
    """The colour of every material on `obj` into one image, then one plain
    material with that image."""
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
        if mat is None or not mat.use_nodes:
            continue
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        mat.node_tree.nodes.active = node
    bpy.context.scene.cycles.bake_type = "DIFFUSE"
    bake_settings = bpy.context.scene.render.bake
    bake_settings.use_pass_direct = False
    bake_settings.use_pass_indirect = False
    bake_settings.use_pass_color = True
    bake_settings.margin = 4
    bpy.ops.object.bake(type="DIFFUSE")
    plain = bpy.data.materials.new(obj.name + "_baked")
    plain.use_nodes = True
    bsdf = plain.node_tree.nodes["Principled BSDF"]
    tex = plain.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    plain.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    image.pack()
    obj.data.materials.clear()
    obj.data.materials.append(plain)


def export(path: Path) -> None:
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", export_apply=True,
                              export_yup=True, export_image_format="AUTO")
    print("exported", path)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="godot/proof3d/models")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args(argv)
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    for kind in PROPS:
        if args.only and kind not in args.only:
            continue
        fresh()
        root = common.empty("root")
        props.BUILDERS[kind](root)
        bpy.context.view_layer.update()
        obj = one_mesh(kind)
        bake(obj, 1024 if kind in ("barracks_fr", "farmhouse", "tower_fr") else 512)
        export(out / f"{kind}.glb")
    for side in ("france", "britain"):
        name = "soldier_" + side
        if args.only and name not in args.only:
            continue
        fresh()
        rig = infantry.build_soldier(side, 1)
        rig["root"].rotation_euler = Euler((0, 0, 0))
        infantry.pose(rig, "idle", 0, 2, 0)
        bpy.context.view_layer.update()
        obj = one_mesh(name)
        bake(obj, 512)
        export(out / f"{name}.glb")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]))
