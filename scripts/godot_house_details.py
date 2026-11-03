"""Native-only detail pass on the existing five original Blender houses.

Keep each model's metre-sized silhouette/base and bake everything to one mesh
and one atlas. No separate window objects or materials survive in the game.
"""
import math

import bpy
from mathutils import Vector

from iso_blender_common import linear, part

MODELS = ("cottage", "farmhouse", "barn", "inn", "chapel")
_materials = {}


def material(color, rough=.85, metal=0., pattern="plain", scale=1., alt=None):
    """Blender 4+ procedural palette, measured in metres after the mesh joins."""
    key = color, rough, metal, pattern, scale, alt
    if key in _materials:
        return _materials[key]
    mat = bpy.data.materials.new("house_" + color + "_" + pattern)
    mat.use_nodes = True
    tree = mat.node_tree
    nodes, links = tree.nodes, tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    coords = nodes.new("ShaderNodeTexCoord")
    position = coords.outputs["Object"]
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.2 * scale
    noise.inputs["Detail"].default_value = 3
    links.new(position, noise.inputs["Vector"])
    mix = nodes.new("ShaderNodeMixRGB")
    mix.inputs[1].default_value = linear(color)
    base = linear(alt or color)
    mix.inputs[2].default_value = tuple(v * .82 for v in base[:3]) + (1.,)
    links.new(noise.outputs["Fac"], mix.inputs[0])
    source = mix.outputs[0]
    if pattern in ("wall", "tiles", "slate", "planks"):
        sep = nodes.new("ShaderNodeSeparateXYZ")
        links.new(position, sep.inputs[0])
        uv = nodes.new("ShaderNodeCombineXYZ")
        if pattern in ("wall", "planks"):
            add = nodes.new("ShaderNodeMath")
            add.operation = "ADD"
            links.new(sep.outputs["X"], add.inputs[0])
            links.new(sep.outputs["Y"], add.inputs[1])
            links.new(add.outputs[0], uv.inputs["X"])
            links.new(sep.outputs["Z"], uv.inputs["Y"])
        else:
            links.new(sep.outputs["X"], uv.inputs["X"])
            links.new(sep.outputs["Y"], uv.inputs["Y"])
        brick = nodes.new("ShaderNodeTexBrick")
        links.new(uv.outputs[0], brick.inputs["Vector"])
        brick.inputs["Scale"].default_value = scale
        sizes = {"wall": (.54, .23, .018), "tiles": (.34, .24, .015),
                 "slate": (.35, .19, .012), "planks": (.16, 2.5, .008)}
        width, height, joint = sizes[pattern]
        brick.inputs["Brick Width"].default_value = width
        brick.inputs["Row Height"].default_value = height
        brick.inputs["Mortar Size"].default_value = joint
        brick.inputs["Color1"].default_value = linear(color)
        brick.inputs["Color2"].default_value = tuple(v * .72 for v in linear(color)[:3]) + (1.,)
        brick.inputs["Mortar"].default_value = linear(alt or ("#4e4436" if pattern=="wall" else "#362c24"))
        source = brick.outputs["Color"]
    elif pattern in ("thatch", "straw"):
        wave = nodes.new("ShaderNodeTexWave")
        wave.bands_direction = "X"
        wave.inputs["Scale"].default_value = 14 * scale
        wave.inputs["Distortion"].default_value = 3
        links.new(position, wave.inputs["Vector"])
        links.new(wave.outputs["Fac"], mix.inputs[0])
    # Baking subtle local occlusion gives recessed frames and eaves contact
    # shading without baking a particular sun direction into the house.
    if rough > .5:
        ao = nodes.new("ShaderNodeAmbientOcclusion")
        ao.inputs["Distance"].default_value = .28
        ao.samples = 16
        shade = nodes.new("ShaderNodeMixRGB")
        shade.blend_type = "MULTIPLY"
        shade.inputs[0].default_value = .28
        links.new(source, shade.inputs[1])
        links.new(ao.outputs["Color"], shade.inputs[2])
        source = shade.outputs[0]
        # Broad irregular weathering with restrained colour variation.
        stain = nodes.new("ShaderNodeMixRGB")
        stain.blend_type = "MULTIPLY"
        stain.inputs[1].default_value = (.71, .75, .67, 1)
        stain.inputs[2].default_value = (1, 1, 1, 1)
        links.new(noise.outputs["Fac"], stain.inputs[0])
        weather = nodes.new("ShaderNodeMixRGB")
        weather.blend_type = "MULTIPLY"
        weather.inputs[0].default_value = .32
        links.new(source, weather.inputs[1])
        links.new(stain.outputs[0], weather.inputs[2])
        source = weather.outputs[0]
    links.new(source, bsdf.inputs["Base Color"])
    _materials[key] = mat
    return mat


def box(root, name, size, at, mat, rot=(0, 0, 0)):
    return part("box", size, at, mat, root, rot=rot, name="detail_" + name)


def bounds(objects):
    points = [o.matrix_world @ Vector(p) for o in objects for p in o.bound_box]
    return (Vector(tuple(min(p[i] for p in points) for i in range(3))),
            Vector(tuple(max(p[i] for p in points) for i in range(3))))


def enrich(root, name):
    bpy.context.view_layer.update()
    source = [o for o in bpy.context.scene.objects if o.type=="MESH"]
    original = bounds(source)
    wood = material("#534532", pattern="planks", alt="#302c24")
    trim = material("#c7bba0", pattern="plaster")
    iron = material("#343a36", rough=.65, metal=.5)
    glass = material("#263c49", rough=.25)
    stone = material("#aaa38c", pattern="wall", alt="#77776b")
    doors = [o for o in source if o.name.split('.')[0] in ("door", "bigdoor")]
    window_count = 0
    for obj in source:
        kind = obj.name.split('.')[0]
        centre = obj.matrix_world.translation.copy()
        size = obj.dimensions
        if kind in ("glass", "window_glass"):
            axis = 0 if size.x < size.y else 1
            across = 1-axis
            sign = -1 if centre[axis]<0 else 1
            # Some original lower windows are hidden behind an entrance.
            # Keep that door intact rather than adding panes over its front.
            overlaps = any(abs(d.location[axis]-centre[axis])<.4
                           and abs(d.location[across]-centre[across])<(d.dimensions[across]+size[across])*.5
                           and abs(d.location.z-centre.z)<(d.dimensions.z+size.z)*.5 for d in doors)
            if overlaps:
                continue
            w, h = size[across], size.z
            front = centre[axis]+sign*(size[axis]/2+.026)

            def pane(piece, u, z, width, height, depth, mat, offset=0.):
                at = centre.copy()
                at[axis], at[across], at.z = front+sign*offset, centre[across]+u, centre.z+z
                dim = [.0, .0, height]
                dim[axis], dim[across] = depth, width
                box(root,piece,dim,at,mat)

            pane("recess",0,0,w+.11,h+.11,.025,glass)
            for x in (-w/2-.015,w/2+.015):
                pane("jamb",x,0,.085,h+.18,.07,trim,.04)
            for z in (-h/2-.025,h/2+.025):
                pane("lintel",0,z,w+.18,.095,.07,trim,.04)
            pane("mullion",0,0,.042,h,.055,trim,.055)
            pane("transom",0,h*.06,w,.042,.055,trim,.055)
            pane("sill",0,-h/2-.09,w+.28,.105,.24,stone,.075)
            window_count += 1
        elif kind=="shutter":
            sign = -1 if centre.y<0 else 1
            for z in (-.36,.36):
                box(root,"shutter_strap",(size.x*.85,.045,.045),
                    (centre.x,centre.y+sign*.065,centre.z+z),iron)
            box(root,"shutter_rail",(size.x,.045,.075),
                (centre.x,centre.y+sign*.067,centre.z),wood)
        elif kind in ("door", "bigdoor"):
            sign = -1 if centre.y<0 else 1
            # All original doors are on a long facade, facing +/-Y.
            face = centre.y+sign*(size.y/2+.04)
            for z in (-size.z*.28,size.z*.28):
                box(root,"door_hinge",(size.x*.65,.035,.055),(centre.x,face,centre.z+z),iron)
            box(root,"door_latch",(.13,.06,.065),(centre.x+size.x*.3,face,centre.z),iron)
            box(root,"threshold",(size.x+.16,.20,.08),(centre.x,face+sign*.035,centre.z-size.z/2+.04),stone)
        elif kind in ("chimney",):
            top = centre.z+size.z/2
            box(root,"sooty_flue",(size.x*.7,size.y*.7,.018),(centre.x,centre.y,top+.075),
                material("#262922",rough=.9))
    # Existing roof prisms, without extending their old bounding boxes.
    for obj in source:
        if obj.name.split('.')[0] not in ("roof", "gable_roof"):
            continue
        low, high = bounds([obj])
        w, d, h = high.x-low.x, high.y-low.y, high.z-low.z
        x, y = (low.x+high.x)/2,(low.y+high.y)/2
        for side in (-1,1):
            box(root,"eaves_fascia",(w-.15,.12,.16),(x,y+side*(d/2-.10),low.z+.03),wood)
            slope = math.degrees(math.atan2(h,d/2))
            for end in (-1,1):
                box(root,"gable_fascia",(.10,math.hypot(d/2,h)-.22,.10),
                    (x+end*(w/2-.09),y+side*d/4,low.z+h/2),wood,(-side*slope,0,0))
        if name in ("farmhouse", "inn", "chapel"):
            ridge_mat = material("#965b40" if name!="chapel" else "#606773",pattern="slate")
            count = max(1,int(w/.5))
            for i in range(count):
                box(root,"ridge_cap",(w/count*.94,.21,.095),
                    (low.x+(i+.5)*w/count,y,high.z+.025),ridge_mat)
    # Discrete cut-stone quoins on masonry corners, timber braces on farms.
    walls = [o for o in source if o.name.split('.')[0] in ("walls", "nave", "plaster_upper_floor")]
    for wall in walls:
        low, high = bounds([wall])
        if name=="farmhouse":
            for side in (-1,1):
                for x, angle in ((low.x+.70,-42),(high.x-.70,42)):
                    box(root,"timber_brace",(1.35,.085,.12),(x,side*(high.y+.06),high.z-.7),wood,(0,angle,0))
        else:
            for z in range(max(1,int((high.z-low.z)/.48))):
                for x in (low.x+.12,high.x-.12):
                    for side in (-1,1):
                        box(root,"quoin",(.33 if z%2 else .43,.095,.20),
                            (x,side*(max(abs(low.y),abs(high.y))+.025),low.z+.26+z*.48),stone)
    bpy.context.view_layer.update()
    after = bounds([o for o in bpy.context.scene.objects if o.type=="MESH"])
    # Placement scale depends on X/Y extent; all low foundation geometry and
    # the visual footprint must retain the original measurements.
    for axis in (0,1):
        assert abs(after[0][axis]-original[0][axis])<.005 and abs(after[1][axis]-original[1][axis])<.005, (name,original,after)
    assert abs(after[0].z-original[0].z)<.005,(name,original,after)
    print("HOUSE_DETAILS",name,"windows",window_count,"bounds",list(original[0]),list(original[1]),flush=True)
