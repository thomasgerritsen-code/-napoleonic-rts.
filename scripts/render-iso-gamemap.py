#!/usr/bin/env python3
"""Render the game's whole battlefield as iso ground in Blender, for the iso view.

Input: graphics-lab/assets/iso/game/gamemap.json, exported from the running game
(roads, river, bridges, woods, hills, village houses; game pixels, y down).
22.5 game pixels are one metre (18 px between files in line = 0.8 m in the lab).

Same camera, sun and materials as the Graphics Lab ground (render-iso-ground.py):
grass with tufts and flowers, roads with verges by class, the river with muddy
banks, shallows and reeds (the bridges are props in the view), darker forest floor, low hills, and a
trampled yard with a garden behind every village house. The image covers the
whole map; its top-left pixel is game (0, 0) and depth is halved by the 30° view.

  bvenv/bin/python scripts/render-iso-gamemap.py [--ppm 14] [--samples 24]
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import random
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from iso_blender_common import camera, linear, material, setup_render, sock  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "graphics-lab/assets/iso/game/gamemap.json"
PPM_GAME = 22.5
RIVER_WIDTH_M = 4.2   # water; the 2D ribbon is 2.6 m, the game's wading band 6.4 m
LIFT = math.cos(math.radians(30))   # a metre up is this many metres up the image (30° camera)
VILLAGE_SCALE = 1.6   # as drawn by the iso view (houses larger than their game footprint)


def m(p):
    """Game pixels (x right, y down) -> ground metres (x east, y north)."""
    return (p[0] / PPM_GAME, -p[1] / PPM_GAME)


def rect(cx, cy, w, h, angle):
    """Rotated rectangle (metres; angle in game terms, y down -> negate)."""
    c, s = math.cos(-angle), math.sin(-angle)
    return [(cx + u * c - v * s, cy + u * s + v * c) for u, v in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]


def ellipse(cx, cy, rx, ry, n=48):
    return [(cx + rx * math.cos(t * math.tau / n), cy + ry * math.sin(t * math.tau / n)) for t in range(n)]


class Mask:
    """Coarse occupancy grid (1 m cells) of roads, river and yards, for the scatter."""

    def __init__(self, wm, hm):
        self.w, self.h = int(wm) + 2, int(hm) + 2
        self.grid = np.zeros((self.h, self.w), dtype=bool)

    def capsule(self, a, b, r):
        x0, x1 = int(min(a[0], b[0]) - r) - 1, int(max(a[0], b[0]) + r) + 1
        y0, y1 = int(min(-a[1], -b[1]) - r) - 1, int(max(-a[1], -b[1]) + r) + 1
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(self.w - 1, x1), min(self.h - 1, y1)
        if x1 < x0 or y1 < y0:
            return
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        px, py = xs + 0.5, -(ys + 0.5)
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = dx * dx + dy * dy or 1e-9
        t = np.clip(((px - a[0]) * dx + (py - a[1]) * dy) / L, 0, 1)
        d = np.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))
        self.grid[y0:y1 + 1, x0:x1 + 1] |= d < r

    def free(self, x, y):
        i, j = int(-y), int(x)
        return 0 <= i < self.h and 0 <= j < self.w and not self.grid[i, j]


def height_tint(mat, hmax, low="#2f4a24", high="#a49b5a"):
    """Lusher green down in the valley, drier grass on the tops: the relief reads
    at a glance. Mixes into whatever colour the material already has."""
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    link = next(l for l in nt.links if l.to_socket == bsdf.inputs["Base Color"])
    src = link.from_socket
    nt.links.remove(link)
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    rng = nt.nodes.new("ShaderNodeMapRange")
    rng.inputs["From Min"].default_value = 0.0
    rng.inputs["From Max"].default_value = hmax
    nt.links.new(sep.outputs["Z"], rng.inputs["Value"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = linear(low)
    ramp.color_ramp.elements[1].color = linear(high)
    nt.links.new(rng.outputs["Result"], ramp.inputs["Fac"])
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.blend_type = "OVERLAY"
    sock(mx.inputs, "Factor_Float").default_value = 0.8
    nt.links.new(src, sock(mx.inputs, "A_Color"))
    nt.links.new(ramp.outputs["Color"], sock(mx.inputs, "B_Color"))
    nt.links.new(sock(mx.outputs, "Result_Color"), bsdf.inputs["Base Color"])
    return mat


def up_mesh(name, verts, faces, mat, smooth=True):
    """Mesh with every face turned to point up (seen from the sky camera)."""
    out = []
    for f in faces:
        (ax, ay, _), (bx, by, _), (cx, cy, _) = verts[f[0]], verts[f[1]], verts[f[2]]
        out.append(f if (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) >= 0 else tuple(reversed(f)))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], out)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


class Relief:
    """Ground heights (metres) on a 1 m grid in game metres (x east, y south),
    shared with the iso view (ground.json "relief") so men, houses, trees and
    bridges stand on the hills.

    Gently rolling country, the game's hills (TERRAIN_HILLS, on the open map with
    the extra ones and their heights) as broad rises, a valley that falls to the
    river, and a level terrace under every village house."""

    CELL, MARGIN = 1.0, 24

    def __init__(self, data, wm, hm, river_pts, river_w):
        c = self.CELL
        self.x0 = self.y0 = -self.MARGIN
        self.cols = int(math.ceil((wm + 2 * self.MARGIN) / c)) + 1
        self.rows = int(math.ceil((hm + 2 * self.MARGIN) / c)) + 1
        X, Y = np.meshgrid(self.x0 + np.arange(self.cols) * c, self.y0 + np.arange(self.rows) * c)
        H = 2.0 + 1.2 * np.sin(X / 41 + 0.4) * np.cos(Y / 33) + 0.7 * np.sin((X + Y) / 23 + 1.1) \
            + 0.3 * np.sin(X / 11.3 - Y / 14.1 + 2.0)
        for i, hl in enumerate(data["hills"]):
            cx, cy = hl["x"] / PPM_GAME, hl["y"] / PPM_GAME
            rx, ry = hl["rx"] / PPM_GAME * 2.4, hl["ry"] / PPM_GAME * 3.0
            r = np.hypot((X - cx) / rx, (Y - cy) / ry)
            H += hl.get("height", (8, 7, 9)[i % 3]) * np.where(r < 1, 0.5 * (1 + np.cos(np.pi * np.minimum(r, 1))), 0)
        # The valley: level by the water, rising over 30 m.
        d = np.full(H.shape, 1e9)
        for (ax, ay), (bx, by) in zip(river_pts, river_pts[1:]):
            ay, by = -ay, -by
            dx, dy = bx - ax, by - ay
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / (dx * dx + dy * dy or 1e-9), 0, 1)
            d = np.minimum(d, np.hypot(X - (ax + t * dx), Y - (ay + t * dy)))
        t = np.clip((d - river_w / 2 - 2) / 30, 0, 1)
        H *= t * t * (3 - 2 * t)
        # Terraces: each village house on level ground, blending out over 7 m.
        for hs in data["houses"]:
            cx, cy = hs["x"] / PPM_GAME, hs["y"] / PPM_GAME
            R = max(hs["w"], hs["h"]) * VILLAGE_SCALE / PPM_GAME * 0.75
            i, j = int(round((cy - self.y0) / c)), int(round((cx - self.x0) / c))
            hc = H[min(max(i, 0), self.rows - 1), min(max(j, 0), self.cols - 1)]
            w = np.clip((R + 7 - np.hypot(X - cx, Y - cy)) / 7, 0, 1)
            H = H * (1 - w) + hc * w
        self.H = H

    def at(self, bx, by):
        """Height at a ground point in Blender metres (x east, y north)."""
        fj, fi = (bx - self.x0) / self.CELL, (-by - self.y0) / self.CELL
        j, i = min(max(int(fj), 0), self.cols - 2), min(max(int(fi), 0), self.rows - 2)
        u, v = min(max(fj - j, 0), 1), min(max(fi - i, 0), 1)
        H = self.H
        return float((H[i, j] * (1 - u) + H[i, j + 1] * u) * (1 - v) + (H[i + 1, j] * (1 - u) + H[i + 1, j + 1] * u) * v)

    def terrain(self, mat):
        c = self.CELL
        verts = [(self.x0 + j * c, -(self.y0 + i * c), float(self.H[i, j])) for i in range(self.rows) for j in range(self.cols)]
        n = self.cols
        faces = [(i * n + j, i * n + j + 1, (i + 1) * n + j + 1, (i + 1) * n + j)
                 for i in range(self.rows - 1) for j in range(self.cols - 1)]
        up_mesh("terrain", verts, faces, mat)

    def export(self, step=2):
        """Every step-th height in cm, little-endian uint16, base64 (for the view)."""
        g = np.clip(np.round(self.H[::step, ::step] * 100), 0, 65535).astype("<u2")
        return {"x0": self.x0, "y0": self.y0, "cell": self.CELL * step, "cols": int(g.shape[1]), "rows": int(g.shape[0]),
                "unit": "cm", "maxM": round(float(self.H.max()), 2), "data": base64.b64encode(g.tobytes()).decode()}


def chaikin(pts, rounds=2):
    """Round off the corners of a polyline (ends kept)."""
    for _ in range(rounds):
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            out += [(a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25), (a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75)]
        pts = out + [pts[-1]]
    return pts


class Nodes:
    """Small helper for building shader node trees."""

    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.N, self.L = self.nt.nodes, self.nt.links
        self.bsdf, self.out = self.N["Principled BSDF"], self.N["Material Output"]
        self.obj = self.node("ShaderNodeTexCoord").outputs["Object"]

    def node(self, t, **kw):
        n = self.N.new(t)
        for k, v in kw.items():
            setattr(n, k, v)
        return n

    def feed(self, sock_, v):
        if isinstance(v, (int, float, tuple)):
            sock_.default_value = v
        else:
            self.L.new(v, sock_)

    def op(self, kind, a, b=None):
        n = self.node("ShaderNodeMath", operation=kind)
        self.feed(n.inputs[0], a)
        if b is not None:
            self.feed(n.inputs[1], b)
        return n.outputs[0]

    def ramp(self, v, lo, hi, a=0.0, b=1.0):
        """Smooth step of v from lo..hi onto a..b (lo > hi runs it backwards)."""
        n = self.node("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
        self.feed(n.inputs["Value"], v)
        if lo > hi:
            lo, hi, a, b = hi, lo, b, a
        n.inputs["From Min"].default_value, n.inputs["From Max"].default_value = lo, hi
        n.inputs["To Min"].default_value, n.inputs["To Max"].default_value = a, b
        return n.outputs["Result"]

    def noise(self, scale, detail=3.0, rough=0.55, vec=None):
        n = self.node("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value, n.inputs["Detail"].default_value, n.inputs["Roughness"].default_value = scale, detail, rough
        self.L.new(vec or self.obj, n.inputs["Vector"])
        return n.outputs["Fac"]

    def mix(self, f, a, b):
        mx = self.node("ShaderNodeMix", data_type="RGBA")
        self.feed(sock(mx.inputs, "Factor_Float"), f)
        self.feed(sock(mx.inputs, "A_Color"), linear(a) if isinstance(a, str) else a)
        self.feed(sock(mx.inputs, "B_Color"), linear(b) if isinstance(b, str) else b)
        return sock(mx.outputs, "Result_Color")

    def finish(self, col, alpha, rough, bump_h, bump_s):
        """Colour, roughness and bump into the BSDF; 'alpha' 0 shows what lies below."""
        self.L.new(col, self.bsdf.inputs["Base Color"])
        self.feed(self.bsdf.inputs["Roughness"], rough)
        bp = self.node("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump_s
        self.L.new(bump_h, bp.inputs["Height"])
        self.L.new(bp.outputs["Normal"], self.bsdf.inputs["Normal"])
        clear = self.node("ShaderNodeBsdfTransparent")
        ms = self.node("ShaderNodeMixShader")
        self.feed(ms.inputs["Fac"], alpha)
        self.L.new(clear.outputs[0], ms.inputs[1])
        self.L.new(self.bsdf.outputs[0], ms.inputs[2])
        for l in list(self.out.inputs["Surface"].links):
            self.nt.links.remove(l)
        self.L.new(ms.outputs[0], self.out.inputs["Surface"])


class RoadField:
    """All roads as one field on a 0.25 m grid over the map, so they form one
    surface - a crossing is a crossing, not one band laid over another:
      R: signed distance (m) to the edge of the nearest chaussee carriageway,
      G: the same for the earth roads (side roads and tracks),
      B: how far across the nearest earth road (0 middle, 1 edge; negative on a
         track), for the wheel ruts,
      A: 1 away from junctions, falling to 0 where two earth roads meet (the
         ruts of each fade out there instead of stopping at a line).
    Roads of a class merge with a smooth minimum, which rounds the inside
    corners of every junction; dead ends come out round."""

    CELL, FAR = 0.25, 30.0

    def __init__(self, roads, wm, hm):
        c = self.CELL
        self.W, self.H = int(math.ceil(wm / c)), int(math.ceil(hm / c))
        xs, ys = (np.arange(self.W) + 0.5) * c, (np.arange(self.H) + 0.5) * c
        F = self.FAR
        chaus = np.full((self.H, self.W), F, np.float32)
        earth, near1, near2 = (np.full((self.H, self.W), F, np.float32) for _ in range(3))
        across = np.full((self.H, self.W), 2.0, np.float32)
        for cls, width, pts in roads:
            half = width / 2
            d = np.full((self.H, self.W), F, np.float32)
            reach = half + 6
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                j0, j1 = max(0, int((min(ax, bx) - reach) / c)), min(self.W, int((max(ax, bx) + reach) / c) + 1)
                i0, i1 = max(0, int((min(ay, by) - reach) / c)), min(self.H, int((max(ay, by) + reach) / c) + 1)
                if j1 <= j0 or i1 <= i0:
                    continue
                X, Y = np.meshgrid(xs[j0:j1], ys[i0:i1])
                dx, dy = bx - ax, by - ay
                t = np.clip(((X - ax) * dx + (Y - ay) * dy) / (dx * dx + dy * dy or 1e-9), 0, 1)
                d[i0:i1, j0:j1] = np.minimum(d[i0:i1, j0:j1], np.hypot(X - (ax + t * dx), Y - (ay + t * dy)))
            sd = d - half
            if cls == "chaussee":
                chaus = self.smin(chaus, sd, 1.6)
            else:
                earth = self.smin(earth, sd, 1.2)
                closer = sd < near1
                across = np.where(closer, (d / half) * (-1 if cls == "track" else 1), across)
                near2 = np.where(closer, near1, np.minimum(near2, sd))
                near1 = np.minimum(near1, sd)
        fade = np.clip((near2 - near1) / 2.5, 0, 1)
        # Image rows run from the bottom (south) up.
        self.rgba = np.stack([chaus, earth, across, fade], axis=-1)[::-1].astype(np.float32)
        self.chaus, self.earth = chaus, earth

    @staticmethod
    def smin(a, b, k):
        h = np.clip(k - np.abs(a - b), 0, None) / k
        return np.minimum(a, b) - h * h * k * 0.25

    def near(self, gx, gy, margin):
        """True where a road (or its shoulder) is within margin metres (game metres, y down)."""
        i, j = int(gy / self.CELL), int(gx / self.CELL)
        if not (0 <= i < self.H and 0 <= j < self.W):
            return False
        return min(self.chaus[i, j], self.earth[i, j]) < margin

    def image(self):
        img = bpy.data.images.new("roadfield", width=self.W, height=self.H, alpha=True, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        img.alpha_mode = "CHANNEL_PACKED"
        img.pixels.foreach_set(self.rgba.ravel())
        img.pack()
        return img


def road_overlay_material(field):
    """The roads as one surface, read from the road field: worn shoulders
    first (grass creeping in), then the carriageways over them - earth with
    ruts and puddles, and the chaussees' cobbles (round, unordered stones, so
    the pattern runs on through a crossing without a seam)."""
    m = bpy.data.materials.new("roads")
    k = Nodes(m)
    tex = k.node("ShaderNodeTexImage", interpolation="Linear", extension="EXTEND")
    tex.image = field.image()
    # Object coordinates -> image UV (x east over the width; y north, image bottom = south edge).
    uv = k.node("ShaderNodeVectorMath", operation="MULTIPLY_ADD")
    k.L.new(k.obj, uv.inputs[0])
    uv.inputs[1].default_value = (1 / (field.W * field.CELL), 1 / (field.H * field.CELL), 0)
    uv.inputs[2].default_value = (0, 1, 0)
    k.L.new(uv.outputs["Vector"], tex.inputs["Vector"])
    sep = k.node("ShaderNodeSeparateColor")
    k.L.new(tex.outputs["Color"], sep.inputs["Color"])
    sdC, sdE, acr, fade = sep.outputs["Red"], sep.outputs["Green"], sep.outputs["Blue"], tex.outputs["Alpha"]

    patch, grit = k.noise(0.45), k.noise(4.0, 6.0, 0.6)
    wob = k.op("ADD", k.op("MULTIPLY", k.op("SUBTRACT", patch, 0.5), 0.9), k.op("MULTIPLY", k.op("SUBTRACT", grit, 0.5), 0.35))
    at = lambda sd, w: k.op("ADD", sd, k.op("MULTIPLY", wob, w))
    vE, cE = k.ramp(at(sdE, 1.3), 1.3, 0.1), k.ramp(at(sdE, 0.45), 0.15, -0.15)
    vC, cC = k.ramp(at(sdC, 1.4), 1.8, 0.2), k.ramp(at(sdC, 0.35), 0.1, -0.1)
    grass = "#5b6b37"
    # Shoulders: trampled earth by the earth roads, gravel by the chaussees,
    # turning to grass towards their outer edge.
    col = k.mix(k.ramp(at(sdE, 1.0), 0.3, 1.2, 0.0, 0.75), k.mix(k.ramp(patch, 0.4, 0.7), k.mix(grit, "#8f7a55", "#7a6646"), "#6f7046"), grass)
    gravel = k.mix(k.ramp(at(sdC, 1.0), 0.5, 1.6, 0.0, 0.75), k.mix(grit, "#8d7f63", "#72664f"), grass)
    col = k.mix(k.op("MULTIPLY", vC, k.op("SUBTRACT", 1.0, cE)), col, gravel)
    # Earth carriageway: two ruts (fading out at junctions), puddles in them.
    a = k.op("ABSOLUTE", acr)
    track = k.ramp(acr, 0.0, -0.05)
    ruts = k.op("MULTIPLY", k.ramp(k.op("ABSOLUTE", k.op("SUBTRACT", a, 0.5)), 0.15, 0.0), fade)
    earth = k.mix(grit, "#977f5a", "#7a6646")
    earth = k.mix(k.op("MULTIPLY", ruts, 0.75), earth, "#6a5639")
    wet = k.op("MULTIPLY", ruts, k.ramp(patch, 0.62, 0.7))
    earth = k.mix(wet, earth, "#4e5b5a")
    earth = k.mix(k.op("MULTIPLY", k.op("MULTIPLY", track, k.ramp(a, 0.3, 0.12)), k.ramp(grit, 0.3, 0.55)), earth, grass)
    col = k.mix(cE, col, earth)
    # Cobbles: Voronoi cells about 20 cm across, each its own shade, dark joints.
    cells = k.node("ShaderNodeTexVoronoi", feature="F1")
    cells.inputs["Scale"].default_value = 6.0
    k.L.new(k.obj, cells.inputs["Vector"])
    joints = k.node("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
    joints.inputs["Scale"].default_value = 6.0
    k.L.new(k.obj, joints.inputs["Vector"])
    shade = k.node("ShaderNodeSeparateColor")
    k.L.new(cells.outputs["Color"], shade.inputs["Color"])
    stone = k.mix(shade.outputs["Red"], "#6c6457", "#8a8172")
    stone = k.mix(k.op("MULTIPLY", grit, 0.35), stone, "#8a7f6b")
    joint = k.ramp(joints.outputs["Distance"], 0.0, 0.07, 1.0, 0.0)
    stone = k.mix(k.op("MULTIPLY", joint, 0.85), stone, "#463f35")
    col = k.mix(cC, col, stone)
    alpha = k.op("MAXIMUM", k.op("MAXIMUM", vE, vC), k.op("MAXIMUM", cE, cC))
    rough = k.op("SUBTRACT", 0.94, k.op("MULTIPLY", k.op("MULTIPLY", wet, cE), 0.86))
    bump_h = k.op("ADD", k.op("MULTIPLY", grit, 0.4), k.op("SUBTRACT", k.op("MULTIPLY", k.op("MULTIPLY", joint, cC), -0.8),
                                                            k.op("MULTIPLY", k.op("MULTIPLY", ruts, cE), 0.6)))
    k.finish(col, alpha, rough, bump_h, 0.25)
    return m


def road_overlay(relief, field, off, mat):
    """The relief grid wherever a road or its shoulder is near, off metres up,
    carrying the road material."""
    c, n = relief.CELL, relief.cols
    keep = set()
    for i in range(relief.rows - 1):
        gy = relief.y0 + (i + 0.5) * c
        for j in range(n - 1):
            gx = relief.x0 + (j + 0.5) * c
            if field.near(gx, gy, 3.5):
                keep.add((i, j))
    used = {}
    verts, faces = [], []

    def vid(i, j):
        if (i, j) not in used:
            used[(i, j)] = len(verts)
            verts.append((relief.x0 + j * c, -(relief.y0 + i * c), float(relief.H[i, j]) + off))
        return used[(i, j)]
    for i, j in sorted(keep):
        faces.append((vid(i, j), vid(i, j + 1), vid(i + 1, j + 1), vid(i + 1, j)))
    up_mesh("roads", verts, faces, mat, smooth=True)


def patch_material(kind):
    """Trampled earth round a house ('yard'), or a garden of dug rows behind it,
    wearing out into the grass at its rim (drape_quad's 'across')."""
    m = bpy.data.materials.new(kind)
    k = Nodes(m)
    a = k.op("ABSOLUTE", k.node("ShaderNodeAttribute", attribute_name="across").outputs["Fac"])
    patch, grit = k.noise(0.45), k.noise(4.0, 6.0, 0.6)
    edge = k.op("ADD", a, k.op("ADD", k.op("MULTIPLY", k.op("SUBTRACT", patch, 0.5), 0.55), k.op("MULTIPLY", k.op("SUBTRACT", grit, 0.5), 0.22)))
    if kind == "yard":
        col = k.mix(k.ramp(patch, 0.35, 0.65), "#7f6c4b", "#6c7040")
    else:
        rows = k.node("ShaderNodeTexWave", wave_type="BANDS")
        rows.inputs["Scale"].default_value = 2.2
        k.L.new(k.obj, rows.inputs["Vector"])
        col = k.mix(k.ramp(rows.outputs["Fac"], 0.35, 0.65), "#5a4630", "#4f6a32")
    col = k.mix(k.op("MULTIPLY", grit, 0.4), col, "#5e4d35")
    col = k.mix(k.ramp(edge, 0.55, 0.85, 0.0, 0.7), col, "#5b6b37")
    k.finish(col, k.ramp(edge, 0.66, 0.92, 1.0, 0.0), 0.92, grit, 0.15)
    return m


def drape_ribbon(relief, name, left, right, off, mat, across=4):
    verts = []
    for l, r in zip(left, right):
        for e in range(across + 1):
            f = e / across
            x, y = l[0] * (1 - f) + r[0] * f, l[1] * (1 - f) + r[1] * f
            verts.append((x, y, relief.at(x, y) + off))
    w = across + 1
    up_mesh(name, verts, [(q * w + e, q * w + e + 1, (q + 1) * w + e + 1, (q + 1) * w + e)
                          for q in range(len(left) - 1) for e in range(across)], mat, smooth=False)


def drape_quad(relief, name, corners, off, mat, step=1.5):
    """A (rotated) rectangle laid on the relief, split into cells of about step metres."""
    c0, c1, c2, c3 = corners
    nu = max(1, math.ceil(math.dist(c0, c1) / step))
    nv = max(1, math.ceil(math.dist(c0, c3) / step))
    verts = []
    for v in range(nv + 1):
        for u in range(nu + 1):
            fu, fv = u / nu, v / nv
            x = (c0[0] * (1 - fu) + c1[0] * fu) * (1 - fv) + (c3[0] * (1 - fu) + c2[0] * fu) * fv
            y = (c0[1] * (1 - fu) + c1[1] * fu) * (1 - fv) + (c3[1] * (1 - fu) + c2[1] * fu) * fv
            verts.append((x, y, relief.at(x, y) + off))
    w = nu + 1
    ob = up_mesh(name, verts, [(v * w + u, v * w + u + 1, (v + 1) * w + u + 1, (v + 1) * w + u) for v in range(nv) for u in range(nu)],
                 mat, smooth=False)
    # 'across' as the road material reads it: 0 in the middle, 1 at the rim.
    rim = [max(abs(2 * u / nu - 1), abs(2 * v / nv - 1)) for v in range(nv + 1) for u in range(nu + 1)]
    at = ob.data.attributes.new("across", "FLOAT", "POINT")
    at.data.foreach_set("value", rim)
    for key, val in (("along", 0.0), ("ends", 9.0)):
        at = ob.data.attributes.new(key, "FLOAT", "POINT")
        at.data.foreach_set("value", [val] * len(rim))
    return ob


def scatter(wm, hm, mask, woods, rnd, relief):
    def mesh(name, verts, faces, mat):
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        me.materials.append(mat)
        return me

    blades = []
    for k in range(5):
        a = k * math.tau / 5
        blades += [(math.cos(a) * 0.12, math.sin(a) * 0.12, 0), (math.cos(a + 0.4) * 0.12, math.sin(a + 0.4) * 0.12, 0),
                   (math.cos(a + 0.2) * 0.05, math.sin(a + 0.2) * 0.05, 0.32)]
    faces = [(i, i + 1, i + 2) for i in range(0, len(blades), 3)]
    tufts = [mesh(f"tuft{c}", blades, faces, material(c, 0.9, pattern="plain")) for c in ("#4c6131", "#6b7a3a", "#3f5229")]
    flowers = [mesh(f"flower{c}", [(-0.05, -0.05, 0.1), (0.05, -0.05, 0.1), (0.05, 0.05, 0.1), (-0.05, 0.05, 0.1)],
                    [(0, 1, 2, 3)], material(c, 0.8, pattern="plain")) for c in ("#e8dc8a", "#efeee4", "#b886c2")]
    ferns = mesh("fern", blades, faces, material("#2f4422", 0.9, pattern="plain"))

    def place(me, x, y, s):
        ob = bpy.data.objects.new(me.name, me)
        ob.location = (x, y, relief.at(x, y) + 0.02)
        ob.rotation_euler = (0, 0, rnd.uniform(0, math.tau))
        ob.scale = (s, s, s)
        bpy.context.collection.objects.link(ob)

    in_wood = lambda x, y: any(w[0] <= x <= w[2] and w[3] <= y <= w[1] for w in woods)
    area = wm * hm
    for _ in range(int(area * 0.42)):
        x, y = rnd.uniform(0, wm), -rnd.uniform(0, hm)
        if mask.free(x, y):
            place(ferns if in_wood(x, y) else rnd.choice(tufts), x, y, rnd.uniform(0.7, 1.6))
    for _ in range(int(area * 0.06)):
        x, y = rnd.uniform(0, wm), -rnd.uniform(0, hm)
        if mask.free(x, y) and not in_wood(x, y):
            place(rnd.choice(flowers), x, y, rnd.uniform(0.8, 1.3))


def reeds(pts, rw, breathe, crossings, z, rnd, relief):
    """Clumps of reeds and bulrushes along both banks, clear of the bridges."""
    blades, faces = [], []
    for k in range(9):
        a, r = k * math.tau / 9, 0.05 + 0.04 * (k % 3)
        bx, by = math.cos(a) * r, math.sin(a) * r
        lean = 0.12 * (k % 2)
        i = len(blades)
        blades += [(bx - 0.025, by, 0), (bx + 0.025, by, 0), (bx * 1.6 + lean, by * 1.6, 0.9 + 0.25 * (k % 3))]
        faces.append((i, i + 1, i + 2))
    reed = []
    for col in ("#6f7d3c", "#87874a", "#5c6a33"):
        me = bpy.data.meshes.new("reed" + col)
        me.from_pydata(blades, [], faces)
        me.materials.append(material(col, 0.85, pattern="plain"))
        reed.append(me)
    for i in range(1, len(pts) - 1, 2):
        x, y = pts[i]
        if any(math.hypot(x - cx, y - cy) < 9 for cx, cy in crossings) or rnd.random() < 0.35:
            continue
        a, b = pts[i - 1], pts[i + 1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy) or 1
        for side in (-1, 1):
            if rnd.random() < 0.4:
                continue
            off = side * (rw * breathe[i] / 2 + rnd.uniform(-0.25, 0.5))
            for _ in range(rnd.randint(2, 5)):
                ob = bpy.data.objects.new("reeds", rnd.choice(reed))
                along = rnd.uniform(-0.8, 0.8)
                px, py = x - dy / n * off + dx / n * along, y + dx / n * off + dy / n * along
                ob.location = (px, py, relief.at(px, py) + z)
                ob.rotation_euler = (0, 0, rnd.uniform(0, math.tau))
                s = rnd.uniform(0.7, 1.3)
                ob.scale = (s, s, s)
                bpy.context.collection.objects.link(ob)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "graphics-lab/assets/iso/game"))
    ap.add_argument("--ppm", type=float, default=14.0)
    ap.add_argument("--samples", type=int, default=24)
    args = ap.parse_args(argv)
    data = json.loads(MAP.read_text())
    wm, hm = data["world"]["w"] / PPM_GAME, data["world"]["h"] / PPM_GAME
    ppm = args.ppm
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render(args.samples, transparent=False, fmt="JPEG")
    rnd = random.Random(1811)
    mask = Mask(wm, hm)

    # River centreline, lightly smoothed (the valley and the water follow it).
    rw = RIVER_WIDTH_M
    pts = [m(p) for p in data["river"]["points"]]
    for _ in range(3):
        pts = [pts[0]] + [((a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4)
                          for a, b, c in zip(pts, pts[1:], pts[2:])] + [pts[-1]]
    relief = Relief(data, wm, hm, pts, rw)

    # The image: game (0, 0) at height 0 on pixel (0, pad); pad leaves room above
    # for the raised northern edge.
    w, h = round(wm * ppm), round(hm * ppm / 2)
    pad = math.ceil(float(relief.H.max()) * LIFT * ppm) + 8
    camera(w, h + pad, ppm, (w / 2, pad + h / 2), origin=(wm / 2, -hm / 2, 0))
    bpy.context.scene.render.film_transparent = False

    # A lower sun than the props' (which only lights the ground here) models the slopes.
    bpy.data.objects["sun"].rotation_euler[0] = math.radians(52)
    grass = height_tint(material("#4e6234", 0.95, pattern="grass", alt="#6d773b"), float(relief.H.max()))
    relief.terrain(grass)
    # Woods: dark, leaf-littered floor (the trees themselves stand as sprites in the view).
    floor = height_tint(material("#3b4d2a", 0.95, pattern="grass", alt="#55502f"), float(relief.H.max()))
    woods = []
    for i, wd in enumerate(data["woods"]):
        x0, y0 = m((wd["x"], wd["y"]))
        x1, y1 = m((wd["x"] + wd["w"], wd["y"] + wd["h"]))
        woods.append((x0, y0, x1, y1))
        drape_quad(relief, f"wood{i}", [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 0.03, floor, step=2.0)
    # Roads: one surface from the road field (see RoadField), so junctions are
    # real junctions; laid on the relief over the yards, under the river.
    verge = {"chaussee": 1.6, "secondary": 1.2, "track": 0.8}
    cls_of = lambda r: r["cls"] if r["cls"] in verge else "secondary"
    field = RoadField([(cls_of(r), r["width"] / PPM_GAME, [(x, -y) for x, y in chaikin([m(p) for p in r["points"]])])
                       for r in data["roads"]], wm, hm)
    road_overlay(relief, field, 0.06, road_overlay_material(field))
    for road in data["roads"]:
        rp, width = [m(p) for p in road["points"]], road["width"] / PPM_GAME
        for a, b in zip(rp, rp[1:]):
            mask.capsule(a, b, width / 2 + verge[cls_of(road)] / 2 + 0.3)

    # River: one continuous ribbon, laid over the roads so it runs on under every
    # bridge (the bridges stand as 3D props in the view). Muddy banks, a lighter
    # shallow margin, deeper water in the middle, its width breathing a little;
    # reeds along the banks away from the crossings.
    bank = material("#6b5c40", 0.9, pattern="dirt", alt="#55482e")
    shallow = material("#55776c", 0.3, pattern="plain")
    water = material("#2f5262", 0.1, pattern="plain")
    breathe = [1 + 0.12 * math.sin(i * 0.11) + 0.06 * math.sin(i * 0.37 + 1.3) for i in range(len(pts))]

    def sides(width):
        left, right = [], []
        for i, (x, y) in enumerate(pts):
            a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            n = math.hypot(dx, dy) or 1
            half = width * breathe[i] / 2
            nx, ny = -dy / n * half, dx / n * half
            left.append((x + nx, y + ny))
            right.append((x - nx, y - ny))
        return left, right

    top = 0.1
    drape_ribbon(relief, "riverbank", *sides(rw + 2.2), top, bank)
    drape_ribbon(relief, "shallows", *sides(rw), top + 0.01, shallow)
    drape_ribbon(relief, "river", *sides(rw * 0.62), top + 0.02, water)
    for a, b in zip(pts, pts[1:]):
        mask.capsule(a, b, rw / 2 + 1.4)
    crossings = [m((br["x"], br["y"])) for br in data["bridges"]]
    reeds(pts, rw, breathe, crossings, top + 0.02, rnd, relief)

    # Village yards: trampled earth round each house, a garden plot behind it.
    yard, garden = patch_material("yard"), patch_material("garden")
    for i, hs in enumerate(data["houses"]):
        cx, cy = m((hs["x"], hs["y"]))
        L, D = hs["w"] * VILLAGE_SCALE / PPM_GAME, hs["h"] * VILLAGE_SCALE / PPM_GAME
        drape_quad(relief, f"yard{i}", rect(cx, cy, L * 1.6, D * 1.9, hs["angle"]), 0.035, yard, step=0.8)
        mask.capsule((cx, cy), (cx + 0.01, cy), max(L, D) * 0.62)
        # Garden behind: opposite the gate on the road.
        if hs.get("ax") is not None and hs["kind"] in ("cottage", "farmhouse"):
            ax, ay = m((hs["ax"], hs["ay"]))
            vx, vy = cx - ax, cy - ay
            nrm = math.hypot(vx, vy) or 1
            gx, gy = cx + vx / nrm * (D * 0.95), cy + vy / nrm * (D * 0.95)
            drape_quad(relief, f"garden{i}", rect(gx, gy, L * 0.9, D * 0.7, hs["angle"]), 0.045, garden, step=0.8)
            mask.capsule((gx, gy), (gx + 0.01, gy), max(L, D) * 0.45)

    scatter(wm, hm, mask, woods, rnd, relief)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / "ground.jpg"
    bpy.context.scene.render.filepath = str(path.resolve())
    bpy.context.scene.render.image_settings.quality = 82
    bpy.ops.render.render(write_still=True)
    meta = {"image": "ground.jpg", "w": w, "h": h + pad, "padTop": pad, "pxPerM": ppm, "gamePxPerM": PPM_GAME,
            "relief": relief.export(),
            "world": data["world"], "source": "scripts/render-iso-gamemap.py (Blender) from gamemap.json"}
    (out / "ground.json").write_text(json.dumps(meta, indent=1) + "\n")
    print(f"ground {w}x{h + pad} -> {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
