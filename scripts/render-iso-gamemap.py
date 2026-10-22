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


def drape_strip(relief, name, a, b, width, off, mat, extend=0.0, step=1.0):
    """A strip from a to b laid on the relief, off metres above it."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1e-6
    ux, uy = dx / L, dy / L
    a = (a[0] - ux * extend, a[1] - uy * extend)
    L += 2 * extend
    nx, ny = -uy * width / 2, ux * width / 2
    # Split across the width too: a wide flat quad in a hollow sinks under the
    # narrower road laid inside it (or pokes up through it).
    k, c = max(1, math.ceil(L / step)), max(2, math.ceil(width / 1.2))
    verts = []
    for q in range(k + 1):
        x, y = a[0] + ux * L * q / k, a[1] + uy * L * q / k
        for e in range(c + 1):
            f = 1 - 2 * e / c
            verts.append((x + nx * f, y + ny * f, relief.at(x + nx * f, y + ny * f) + off))
    w = c + 1
    up_mesh(name, verts, [(q * w + e, q * w + e + 1, (q + 1) * w + e + 1, (q + 1) * w + e) for q in range(k) for e in range(c)],
            mat, smooth=False)


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
    up_mesh(name, verts, [(v * w + u, v * w + u + 1, (v + 1) * w + u + 1, (v + 1) * w + u) for v in range(nv) for u in range(nu)],
            mat, smooth=False)


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
    # Roads by class: a worn verge, then the surface, laid over the hills.
    styles = {"chaussee": ("#b4a07a", "#9a8762", 1.6), "secondary": ("#a68b5e", "#8e7651", 1.2), "track": ("#977f58", "#7f6c4a", 0.8)}
    order = {"track": 0, "secondary": 1, "chaussee": 2}
    verge = material("#7b6a47", 0.95, pattern="dirt", alt="#6d7a3e")
    n = 0
    # Every road on its own height (and every segment a hair apart): overlapping
    # coplanar faces render as black blotches at junctions.
    for ri, road in enumerate(sorted(data["roads"], key=lambda r: order.get(r["cls"], 1))):
        col, alt, edge = styles.get(road["cls"], styles["secondary"])
        surf = material(col, 0.95, pattern="dirt", alt=alt)
        width = road["width"] / PPM_GAME
        base = 0.09 + ri * 0.003
        rp = [m(p) for p in road["points"]]
        for a, b in zip(rp, rp[1:]):
            lift = 0.0007 * (n % 2)
            drape_strip(relief, f"verge{n}", a, b, width + edge, 0.05 + ri * 0.0003 + lift, verge, extend=(width + edge) / 2)
            drape_strip(relief, f"road{n}", a, b, width, base + lift, surf, extend=width / 2)
            mask.capsule(a, b, width / 2 + edge / 2 + 0.3)
            n += 1

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

    top = 0.09 + len(data["roads"]) * 0.003 + 0.03
    drape_ribbon(relief, "riverbank", *sides(rw + 2.2), top, bank)
    drape_ribbon(relief, "shallows", *sides(rw), top + 0.01, shallow)
    drape_ribbon(relief, "river", *sides(rw * 0.62), top + 0.02, water)
    for a, b in zip(pts, pts[1:]):
        mask.capsule(a, b, rw / 2 + 1.4)
    crossings = [m((br["x"], br["y"])) for br in data["bridges"]]
    reeds(pts, rw, breathe, crossings, top + 0.02, rnd, relief)

    # Village yards: trampled earth round each house, a garden plot behind it.
    yard = material("#86774f", 0.95, pattern="dirt", alt="#6f7a43")
    garden = material("#5d4a2f", 0.95, pattern="rows", alt="#4f6a33")
    for i, hs in enumerate(data["houses"]):
        cx, cy = m((hs["x"], hs["y"]))
        L, D = hs["w"] * VILLAGE_SCALE / PPM_GAME, hs["h"] * VILLAGE_SCALE / PPM_GAME
        drape_quad(relief, f"yard{i}", rect(cx, cy, L * 1.25, D * 1.5, hs["angle"]), 0.035, yard)
        mask.capsule((cx, cy), (cx + 0.01, cy), max(L, D) * 0.62)
        # Garden behind: opposite the gate on the road.
        if hs.get("ax") is not None and hs["kind"] in ("cottage", "farmhouse"):
            ax, ay = m((hs["ax"], hs["ay"]))
            vx, vy = cx - ax, cy - ay
            nrm = math.hypot(vx, vy) or 1
            gx, gy = cx + vx / nrm * (D * 0.95), cy + vy / nrm * (D * 0.95)
            drape_quad(relief, f"garden{i}", rect(gx, gy, L * 0.8, D * 0.55, hs["angle"]), 0.045, garden)
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
