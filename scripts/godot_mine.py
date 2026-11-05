"""Original, metre-sized mine for the native Godot battlefield.

Imported by export-godot-3d.py; the web sprite builders stay unchanged.
Blender +Z is up, the entrance faces -Y. No modern machinery: timbered
adit, handcart, wooden tramway, spoil, pick and a small supply shelter.
"""
import random

import bpy

from iso_blender_common import linear, part


def material(color, rough=0.85, metal=0.0, pattern="plain", alt=None):
    """Small bakeable palette, compatible with Blender 4.x and newer."""
    mat = bpy.data.materials.new("mine_" + color + "_" + pattern)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = linear(color)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if pattern != "plain":
        coords = tree.nodes.new("ShaderNodeTexCoord")
        grain = tree.nodes.new("ShaderNodeTexNoise")
        grain.inputs["Scale"].default_value = 7.0 if pattern == "planks" else 3.0
        grain.inputs["Detail"].default_value = 3.0
        tree.links.new(coords.outputs["Generated"], grain.inputs["Vector"])
        mix = tree.nodes.new("ShaderNodeMixRGB")
        mix.inputs[1].default_value = linear(color)
        mix.inputs[2].default_value = linear(alt or color)
        tree.links.new(grain.outputs["Fac"], mix.inputs[0])
        tree.links.new(mix.outputs[0], bsdf.inputs["Base Color"])
    return mat


def build_mine(root):
    rng = random.Random(1815)
    wood = material("#735136", pattern="planks", alt="#493624")
    cut = material("#ad8655", pattern="planks")
    iron = material("#424744", rough=0.7, metal=0.5, pattern="plain")
    dark = material("#171814", pattern="plain")
    rock = material("#77746b", pattern="wall", alt="#535b57")
    ore = material("#805f46", pattern="wall", alt="#39433e")
    earth = material("#6b5b42", pattern="dirt", alt="#807057")

    def box(name, size, pos, mat=wood, rot=(0, 0, 0)):
        return part("box", size, pos, mat, root, rot=rot, name=name)

    # A low working yard, with rocks around a genuine open passage rather
    # than a painted doorway. Keep the centre of the entrance clear.
    part("cyl", (1.0, 0.04), (0, 0, 0.02), earth, root, segments=32, name="yard")
    bpy.context.object.scale = (3.8, 2.9, 1.0)
    for side in (-1, 1):
        for i in range(5):
            x = side * (1.5 + 0.35 * (i % 2))
            y = -0.25 + (i // 2) * 0.85
            part("ball", (1.0,), (x, y, 0.65 + (i % 2) * 0.3), rock, root,
                 name="outcrop", segments=8)
            bpy.context.object.scale = (0.9, 1.1, 0.9 + rng.random() * 0.35)
    # Rock over the portal, supported by the timber lintels.
    for x in (-0.8, 0.0, 0.8):
        part("ball", (1.0,), (x, 0.45, 2.55), rock, root,
             name="crown_rock", segments=8)
        bpy.context.object.scale = (0.8, 1.45, 0.55)
    box("tunnel_back", (2.4, 0.12, 2.2), (0, 1.65, 1.1), dark)
    box("tunnel_roof", (2.5, 2.5, 0.12), (0, 0.45, 2.3), dark)
    for y in (-0.9, 0.25, 1.35):
        for x in (-1.12, 1.12):
            box("pit_prop", (0.25, 0.28, 2.3), (x, y, 1.15))
            box("iron_strap", (0.27, 0.3, 0.08), (x, y, 0.65), iron)
        box("lintel", (2.65, 0.32, 0.28), (0, y, 2.3))
    for x in (-0.88, 0.88):
        box("portal_brace", (0.15, 0.24, 0.7), (x, -0.92, 2.0), cut,
            rot=(0, 35 if x < 0 else -35, 0))

    # Wooden tramway: appropriate to a small early nineteenth-century adit.
    for y in (-2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2):
        box("sleeper", (1.75, 0.16, 0.08), (0, y, 0.09))
    for x in (-0.55, 0.55):
        box("tram_rail", (0.1, 4.2, 0.11), (x, -0.45, 0.17), cut)

    # Four-wheeled timber ore cart, no modern steel tipping hopper.
    box("cart_floor", (1.18, 1.4, 0.12), (0, -1.8, 0.5))
    for x in (-0.56, 0.56):
        for z in (0.7, 0.94):
            box("cart_side", (0.09, 1.4, 0.21), (x, -1.8, z), cut)
        for y in (-2.3, -1.3):
            part("cyl", (0.25, 0.1), (x, y, 0.35), iron, root,
                 rot=(0, 90, 0), segments=12, name="cart_wheel")
        for y in (-2.4, -1.2):
            box("cart_band", (0.12, 0.1, 0.62), (x, y, 0.82), iron)
    for y in (-2.46, -1.14):
        box("cart_end", (1.18, 0.09, 0.5), (0, y, 0.82), cut)
    for i in range(9):
        part("ball", (0.23,), (rng.uniform(-0.38, 0.38), rng.uniform(-2.25, -1.35), 0.99),
             ore, root, segments=7, name="cart_ore")

    # Stockpile, tool and lean-to keep the silhouette distinct from a house.
    for i in range(16):
        part("ball", (rng.uniform(0.18, 0.35),),
             (-2.45 + rng.uniform(-0.5, 0.5), -1.25 + rng.uniform(-0.6, 0.6), 0.2 + rng.random() * 0.25),
             ore, root, segments=7, name="spoil")
    for x in (2.15, 3.2):
        for y in (-0.6, 1.0):
            box("shed_post", (0.12, 0.12, 1.8), (x, y, 0.9))
    box("shed_roof", (1.45, 2.05, 0.1), (2.67, 0.2, 1.9), wood, rot=(8, 0, 0))
    for z in (0.25, 0.55):
        box("supply_crate", (0.6, 0.65, 0.3), (2.65, 0.6, z), cut)
    box("pick_haft", (0.055, 0.055, 1.15), (2.2, -0.65, 0.63), cut, rot=(0, -18, 0))
    box("pick_head", (0.55, 0.07, 0.07), (2.03, -0.65, 1.17), iron, rot=(0, -18, 0))
