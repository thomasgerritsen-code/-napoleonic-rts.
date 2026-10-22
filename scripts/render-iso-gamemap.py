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
import json
import math
import random
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from iso_blender_common import camera, material, setup_render, slab  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "graphics-lab/assets/iso/game/gamemap.json"
PPM_GAME = 22.5
RIVER_WIDTH_M = 4.2   # water; the 2D ribbon is 2.6 m, the game's wading band 6.4 m
VILLAGE_SCALE = 1.6   # as drawn by the iso view (houses larger than their game footprint)


def m(p):
    """Game pixels (x right, y down) -> ground metres (x east, y north)."""
    return (p[0] / PPM_GAME, -p[1] / PPM_GAME)


def strip(name, a, b, width, z, mat, extend=0.0, thick=0.02):
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy) or 1e-6
    ex, ey = dx / n * extend, dy / n * extend
    a, b = (a[0] - ex, a[1] - ey), (b[0] + ex, b[1] + ey)
    nx, ny = -dy / n * width / 2, dx / n * width / 2
    slab(name, [(a[0] + nx, a[1] + ny), (a[0] - nx, a[1] - ny), (b[0] - nx, b[1] - ny), (b[0] + nx, b[1] + ny)],
         z - thick, z, mat)


def rect(cx, cy, w, h, angle):
    """Rotated rectangle (metres; angle in game terms, y down -> negate)."""
    c, s = math.cos(-angle), math.sin(-angle)
    return [(cx + u * c - v * s, cy + u * s + v * c) for u, v in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]


def ellipse(cx, cy, rx, ry, n=48):
    return [(cx + rx * math.cos(t * math.tau / n), cy + ry * math.sin(t * math.tau / n)) for t in range(n)]


def dome(name, cx, cy, rx, ry, h, mat, flat=None, n=96, rings=32):
    """A low hill; flat(x, y) in 0..1 levels it where the river and roads cut through."""
    verts, faces = [], []
    for r in range(rings + 1):
        f = r / rings
        for k in range(n):
            t = k * math.tau / n
            x, y = cx + rx * f * math.cos(t), cy + ry * f * math.sin(t)
            z = h * (math.cos(f * math.pi / 2) ** 2) * (flat(x, y) if flat else 1)
            verts.append((x, y, z))
    for r in range(rings):
        for k in range(n):
            a, b = r * n + k, r * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)


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

    def leveller(self, reach=5):
        """flat(x, y): 0 on roads and the river, rising to 1 within reach metres."""
        g = self.grid.astype(float)
        for _ in range(reach):
            g = np.maximum.reduce([g, np.roll(g, 1, 0) * 0.8, np.roll(g, -1, 0) * 0.8, np.roll(g, 1, 1) * 0.8, np.roll(g, -1, 1) * 0.8])

        def flat(x, y):
            i, j = int(-y), int(x)
            if not (0 <= i < self.h and 0 <= j < self.w):
                return 1.0
            return 1.0 - g[i, j]
        return flat

    def free(self, x, y):
        i, j = int(-y), int(x)
        return 0 <= i < self.h and 0 <= j < self.w and not self.grid[i, j]


def scatter(wm, hm, mask, woods, rnd):
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
        ob.location = (x, y, 0.02)
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


def reeds(pts, rw, breathe, crossings, z, rnd):
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
                ob.location = (x - dy / n * off + dx / n * along, y + dx / n * off + dy / n * along, z)
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
    w, h = round(wm * ppm), round(hm * ppm / 2)
    # Centre of the map on the centre of the image (keeps the whole field in front of the camera).
    camera(w, h, ppm, (w / 2, h / 2), origin=(wm / 2, -hm / 2, 0))
    bpy.context.scene.render.film_transparent = False
    rnd = random.Random(1811)
    mask = Mask(wm, hm)

    grass = material("#4e6234", 0.95, pattern="grass", alt="#6d773b")
    slab("grass", [(-2, 2), (wm + 2, 2), (wm + 2, -hm - 2), (-2, -hm - 2)], -0.1, 0, grass)
    # Woods: dark, leaf-littered floor (the trees themselves stand as sprites in the view).
    floor = material("#3b4d2a", 0.95, pattern="grass", alt="#55502f")
    woods = []
    for i, wd in enumerate(data["woods"]):
        x0, y0 = m((wd["x"], wd["y"]))
        x1, y1 = m((wd["x"] + wd["w"], wd["y"] + wd["h"]))
        woods.append((x0, y0, x1, y1))
        slab(f"wood{i}", [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 0, 0.006, floor)
    # Roads by class: a worn verge, then the surface.
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
        base = 0.04 + ri * 0.003
        rp = [m(p) for p in road["points"]]
        for a, b in zip(rp, rp[1:]):
            lift = 0.0007 * (n % 2)
            strip(f"verge{n}", a, b, width + edge, 0.026 + ri * 0.0003 + lift, verge, extend=(width + edge) / 2)
            strip(f"road{n}", a, b, width, base + lift, surf, extend=width / 2)
            mask.capsule(a, b, width / 2 + edge / 2 + 0.3)
            n += 1

    # River: one continuous ribbon along a lightly smoothed centreline, laid over
    # the roads so it runs on under every bridge (the bridges stand as 3D props in
    # the view). Muddy banks, a lighter shallow margin, deeper water in the middle,
    # its width breathing a little; reeds along the banks away from the crossings.
    bank = material("#6b5c40", 0.9, pattern="dirt", alt="#55482e")
    shallow = material("#55776c", 0.3, pattern="plain")
    water = material("#2f5262", 0.1, pattern="plain")
    rw = RIVER_WIDTH_M
    pts = [m(p) for p in data["river"]["points"]]
    for _ in range(3):
        pts = [pts[0]] + [((a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4)
                          for a, b, c in zip(pts, pts[1:], pts[2:])] + [pts[-1]]
    breathe = [1 + 0.12 * math.sin(i * 0.11) + 0.06 * math.sin(i * 0.37 + 1.3) for i in range(len(pts))]

    def ribbon(width):
        left, right = [], []
        for i, (x, y) in enumerate(pts):
            a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            n = math.hypot(dx, dy) or 1
            half = width * breathe[i] / 2
            nx, ny = -dy / n * half, dx / n * half
            left.append((x + nx, y + ny))
            right.append((x - nx, y - ny))
        return left + right[::-1]

    top = 0.04 + len(data["roads"]) * 0.003 + 0.02
    slab("riverbank", ribbon(rw + 2.2), top, top + 0.004, bank)
    slab("shallows", ribbon(rw), top + 0.006, top + 0.010, shallow)
    slab("river", ribbon(rw * 0.62), top + 0.012, top + 0.016, water)
    for a, b in zip(pts, pts[1:]):
        mask.capsule(a, b, rw / 2 + 1.4)
    crossings = [m((br["x"], br["y"])) for br in data["bridges"]]
    reeds(pts, rw, breathe, crossings, top + 0.016, rnd)

    # Low hills: gentle domes the sun picks out (units are not lifted, so they stay
    # low), levelled where the river and the roads cut through them.
    flat = mask.leveller()
    for i, hl in enumerate(data["hills"]):
        cx, cy = m((hl["x"], hl["y"]))
        dome(f"hill{i}", cx, cy, hl["rx"] / PPM_GAME, hl["ry"] / PPM_GAME, 1.6, grass, flat)

    # Village yards: trampled earth round each house, a garden plot behind it.
    yard = material("#86774f", 0.95, pattern="dirt", alt="#6f7a43")
    garden = material("#5d4a2f", 0.95, pattern="rows", alt="#4f6a33")
    for i, hs in enumerate(data["houses"]):
        cx, cy = m((hs["x"], hs["y"]))
        L, D = hs["w"] * VILLAGE_SCALE / PPM_GAME, hs["h"] * VILLAGE_SCALE / PPM_GAME
        slab(f"yard{i}", rect(cx, cy, L * 1.25, D * 1.5, hs["angle"]), 0.004, 0.009, yard)
        mask.capsule((cx, cy), (cx + 0.01, cy), max(L, D) * 0.62)
        # Garden behind: opposite the gate on the road.
        if hs.get("ax") is not None and hs["kind"] in ("cottage", "farmhouse"):
            ax, ay = m((hs["ax"], hs["ay"]))
            vx, vy = cx - ax, cy - ay
            nrm = math.hypot(vx, vy) or 1
            gx, gy = cx + vx / nrm * (D * 0.95), cy + vy / nrm * (D * 0.95)
            slab(f"garden{i}", rect(gx, gy, L * 0.8, D * 0.55, hs["angle"]), 0.009, 0.014, garden)
            mask.capsule((gx, gy), (gx + 0.01, gy), max(L, D) * 0.45)

    scatter(wm, hm, mask, woods, rnd)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / "ground.jpg"
    bpy.context.scene.render.filepath = str(path.resolve())
    bpy.context.scene.render.image_settings.quality = 82
    bpy.ops.render.render(write_still=True)
    meta = {"image": "ground.jpg", "w": w, "h": h, "pxPerM": ppm, "gamePxPerM": PPM_GAME,
            "world": data["world"], "source": "scripts/render-iso-gamemap.py (Blender) from gamemap.json"}
    (out / "ground.json").write_text(json.dumps(meta, indent=1) + "\n")
    print(f"ground {w}x{h} -> {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
