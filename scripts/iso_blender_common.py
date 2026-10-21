"""Shared Blender helpers for the Graphics Lab isometric renders.

Every iso asset (soldiers, buildings, trees, terrain) uses this one camera
contract, sun and material library so the pieces sit in the same world:
orthographic, 30 degree elevation, looking along +Y, screen-right = world +X.
A ground point (x, y) lands at screen (x, -y * sin 30) and a height z rises
by z * cos 30.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Euler, Vector

ELEVATION = 30.0
EL = math.radians(ELEVATION)
RIGHT = Vector((1, 0, 0))
UP = Vector((0, math.sin(EL), math.cos(EL)))          # screen-up in world space
FORWARD = Vector((0, math.cos(EL), -math.sin(EL)))    # camera view direction
SPRITE_PX_PER_M = 128 / 3.1                           # soldier/prop sprite scale


def linear(hex_color: str) -> tuple[float, float, float, float]:
    h = hex_color.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)


def shade(hex_color: str, factor: float) -> tuple[float, float, float, float]:
    r, g, b, a = linear(hex_color)
    return (min(1, r * factor), min(1, g * factor), min(1, b * factor), a)


def screen_up(p) -> float:
    return p[1] * UP.y + p[2] * UP.z


def sock(collection, identifier):
    """Socket lookup by identifier (Mix node sockets share display names)."""
    return next(s for s in collection if s.identifier == identifier)


# --- materials ---------------------------------------------------------------
_materials: dict[str, bpy.types.Material] = {}


def material(hex_color: str, rough: float = 0.8, metal: float = 0.0, pattern: str = "cloth",
             scale: float = 1.0, alt: str | None = None) -> bpy.types.Material:
    """Principled material with a procedural surface pattern.

    pattern: cloth (fine weave noise), plain, skin, wall (brick/stone on X+Y,Z),
    plaster, tiles (roof rows in local X,Y), slate, planks, thatch, leaves,
    bark, straw, grass, dirt, field.
    """
    key = f"{hex_color}-{rough}-{metal}-{pattern}-{scale}-{alt}"
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    coord = nt.nodes.new("ShaderNodeTexCoord").outputs["Object"]

    def noise(s, detail=4.0, rough_=0.55, vec=None):
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = s
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough_
        nt.links.new(vec or coord, n.inputs["Vector"])
        return n

    def mix(fac_socket, a, b):
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        nt.links.new(fac_socket, sock(mx.inputs, "Factor_Float"))
        for name, val in (("A_Color", a), ("B_Color", b)):
            if isinstance(val, tuple):
                sock(mx.inputs, name).default_value = val
            else:
                nt.links.new(val, sock(mx.inputs, name))
        return sock(mx.outputs, "Result_Color")

    def bump(height_socket, strength):
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = strength
        nt.links.new(height_socket, bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])

    def wall_vec():
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(coord, sep.inputs[0])
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "ADD"
        nt.links.new(sep.outputs[0], add.inputs[0])
        nt.links.new(sep.outputs[1], add.inputs[1])
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(add.outputs[0], comb.inputs[0])
        nt.links.new(sep.outputs[2], comb.inputs[1])
        return comb.outputs[0]

    def brick(vec, c1, c2, mortar, s, width, height, mortar_size=0.02):
        b = nt.nodes.new("ShaderNodeTexBrick")
        nt.links.new(vec, b.inputs["Vector"])
        b.inputs["Color1"].default_value = c1
        b.inputs["Color2"].default_value = c2
        b.inputs["Mortar"].default_value = mortar
        b.inputs["Scale"].default_value = s
        b.inputs["Mortar Size"].default_value = mortar_size
        b.inputs["Brick Width"].default_value = width
        b.inputs["Row Height"].default_value = height
        return b

    base = hex_color
    if pattern == "plain":
        bsdf.inputs["Base Color"].default_value = linear(base)
    elif pattern == "rows":
        # Ploughed/crop rows along X with soil showing between them.
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.bands_direction = "Y"
        wave.inputs["Scale"].default_value = 1.6 * scale
        wave.inputs["Distortion"].default_value = 1.5
        wave.inputs["Detail"].default_value = 2.0
        nt.links.new(coord, wave.inputs["Vector"])
        col = mix(wave.outputs["Factor"], shade(base, 1.12), linear(alt or base))
        grit = noise(3.0 * scale)
        col = mix(grit.outputs["Factor"], col, shade(base, 1.08))
        nt.links.new(col, bsdf.inputs["Base Color"])
        bump(wave.outputs["Factor"], 0.5)
    elif pattern in ("cloth", "skin", "leaves", "bark", "straw", "thatch", "plaster", "grass", "dirt", "field"):
        spec = {
            "cloth": (90, 0.12, 0.06), "skin": (25, 0.06, 0.02), "leaves": (9, 0.32, 0.45),
            "bark": (14, 0.3, 0.5), "straw": (22, 0.26, 0.25), "thatch": (16, 0.3, 0.5),
            "plaster": (6, 0.14, 0.15), "grass": (0.9, 0.26, 0.05), "dirt": (1.6, 0.2, 0.06),
            "field": (1.2, 0.16, 0.05),
        }[pattern]
        s, var, bump_s = spec
        n1 = noise(s * scale)
        col = mix(n1.outputs["Factor"], shade(base, 1 - var), shade(base, 1 + var))
        if pattern in ("grass", "dirt", "field"):
            # Large-scale patches plus fine blades/grit.
            n2 = noise(s * scale * 0.18, 3.0, 0.5)
            col = mix(n2.outputs["Factor"], col, linear(alt or base))
            fine = noise(s * scale * 22, 2.0, 0.6)
            bump(fine.outputs["Factor"], 0.12)
        elif pattern == "leaves":
            n2 = noise(s * scale * 3.5, 3.0, 0.6)
            col = mix(n2.outputs["Factor"], col, linear(alt or base))
            bump(n2.outputs["Factor"], bump_s)
        else:
            bump(n1.outputs["Factor"], bump_s)
        nt.links.new(col, bsdf.inputs["Base Color"])
    elif pattern in ("wall", "tiles", "slate", "planks"):
        vec = wall_vec() if pattern in ("wall", "planks") else coord
        if pattern == "wall":
            b = brick(vec, shade(base, 0.86), shade(base, 1.1), linear(alt or "#8c8578"), 1.0 * scale, 0.5, 0.22, 0.03)
        elif pattern == "tiles":
            b = brick(vec, shade(base, 0.8), shade(base, 1.12), shade(base, 0.42), 1.0 * scale, 0.36, 0.24, 0.03)
        elif pattern == "slate":
            b = brick(vec, shade(base, 0.86), shade(base, 1.1), shade(base, 0.5), 1.0 * scale, 0.42, 0.22, 0.025)
        else:
            b = brick(vec, shade(base, 0.86), shade(base, 1.1), shade(base, 0.55), 2.0 * scale, 0.11, 2.4, 0.006)
        grit = noise(30 * scale)
        col = mix(grit.outputs["Factor"], b.outputs["Color"], shade(base, 0.8))
        mixf = nt.nodes.new("ShaderNodeMath")
        mixf.operation = "MULTIPLY"
        mixf.inputs[1].default_value = 0.35
        nt.links.new(grit.outputs["Factor"], mixf.inputs[0])
        col2 = nt.nodes.new("ShaderNodeMix")
        col2.data_type = "RGBA"
        nt.links.new(mixf.outputs[0], sock(col2.inputs, "Factor_Float"))
        nt.links.new(b.outputs["Color"], sock(col2.inputs, "A_Color"))
        nt.links.new(col, sock(col2.inputs, "B_Color"))
        nt.links.new(sock(col2.outputs, "Result_Color"), bsdf.inputs["Base Color"])
        bump(b.outputs["Factor"], 0.35)
    else:
        raise ValueError(pattern)
    _materials[key] = m
    return m


# --- geometry helpers ---------------------------------------------------------
def empty(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    return obj


def part(kind, size, loc, mat, parent=None, rot=(0, 0, 0), name="part", smooth=True, segments=16):
    """kind: box (x,y,z), cyl (r, depth[, r_top]), ball (r[, sx, sy, sz]), ico (r)."""
    if kind == "box":
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj = bpy.context.object
        obj.scale = size
        smooth = False
    elif kind == "cyl":
        r, depth = size[0], size[1]
        top = size[2] if len(size) > 2 else r
        bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=r, radius2=top, depth=depth)
        obj = bpy.context.object
    elif kind == "ico":
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=size[0])
        obj = bpy.context.object
        if len(size) == 4:
            obj.scale = size[1:]
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(8, segments // 2 + 2), radius=size[0])
        obj = bpy.context.object
        if len(size) == 4:
            obj.scale = size[1:]
    # Bake scale so procedural textures are measured in real metres.
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if smooth:
        bpy.ops.object.shade_smooth()
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    return obj


def prism(name, width, depth, height, mat, loc, parent=None):
    """Gable roof volume along X: ridge at `height` above the eaves."""
    w, d, h = width / 2, depth / 2, height
    verts = [(-w, -d, 0), (w, -d, 0), (w, d, 0), (-w, d, 0), (-w, 0, h), (w, 0, h)]
    faces = [(0, 1, 5, 4), (3, 4, 5, 2), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent = parent
    obj.location = loc
    return obj


def slab(name, verts2d, z0, z1, mat, parent=None):
    """Extruded polygon (ground decals such as roads and fields)."""
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(verts2d, verts2d[1:] + verts2d[:1]))
    if area < 0:  # keep counter-clockwise so the top face points up
        verts2d = list(reversed(verts2d))
    n = len(verts2d)
    verts = [(x, y, z0) for x, y in verts2d] + [(x, y, z1) for x, y in verts2d]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


# --- scene ---------------------------------------------------------------------
def setup_render(samples: int, transparent: bool = True, fmt: str = "PNG") -> None:
    _materials.clear()  # a factory reset deletes the cached materials
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.film_transparent = transparent
    scene.render.filter_size = 1.2
    scene.render.image_settings.file_format = fmt
    if fmt == "PNG":
        scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
        scene.render.image_settings.color_depth = "8"
    else:
        scene.render.image_settings.color_mode = "RGB"
        scene.render.image_settings.quality = 86
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = linear("#b9c4cf")
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.75
    scene.world = world
    # Key sun from the upper left of the screen (short shadow to the lower right)
    # and a weak warm rim from behind that separates silhouettes from the grass.
    for name, energy, rot, color in (("sun", 3.6, (26, 0, -135), "#fff4e2"),
                                    ("rim", 1.1, (62, 0, 20), "#ffd9a8")):
        data = bpy.data.lights.new(name, "SUN")
        data.energy = energy
        data.angle = math.radians(6)
        data.color = linear(color)[:3]
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.rotation_euler = Euler([math.radians(a) for a in rot])
        if name == "rim":
            obj.visible_shadow = False


def camera(width_px: int, height_px: int, px_per_m: float, pivot_px: tuple[float, float],
           origin=(0.0, 0.0, 0.0)) -> None:
    """Orthographic camera where world `origin` lands on pixel `pivot_px`."""
    scene = bpy.context.scene
    scene.render.resolution_x = width_px
    scene.render.resolution_y = height_px
    scene.render.resolution_percentage = 100
    data = bpy.data.cameras.new("cam")
    data.type = "ORTHO"
    data.ortho_scale = max(width_px, height_px) / px_per_m
    data.clip_end = 400
    cam = bpy.data.objects.new("cam", data)
    scene.collection.objects.link(cam)
    cx = (width_px / 2 - pivot_px[0]) / px_per_m
    cu = (pivot_px[1] - height_px / 2) / px_per_m
    cam.location = Vector(origin) + RIGHT * cx + UP * cu - FORWARD * 120
    cam.rotation_euler = Euler((math.radians(90) - EL, 0, 0))
    scene.camera = cam


def shadow_catcher(name, verts2d, z=0.0):
    obj = slab(name, verts2d, z - 0.01, z, material("#808080", pattern="plain"))
    obj.is_shadow_catcher = True
    return obj
