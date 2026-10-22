#!/usr/bin/env python3
"""Render the game's whole battlefield as iso ground in Blender, for the iso view.

Input: graphics-lab/assets/iso/game/gamemap.json, exported from the running game
(roads, river, bridges, woods, hills, village houses; game pixels, y down).
22.5 game pixels are one metre (18 px between files in line = 0.8 m in the lab).

Same camera, sun and materials as the Graphics Lab ground (render-iso-ground.py):
grass with tufts and flowers, roads with verges by class, the river with muddy
banks, stone and timber bridge decks, darker forest floor, low hills, and a
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


def dome(name, cx, cy, rx, ry, h, mat, n=40, rings=8):
    verts, faces = [], []
    for r in range(rings + 1):
        f = r / rings
        z = h * (math.cos(f * math.pi / 2) ** 2)
        for k in range(n):
            t = k * math.tau / n
            verts.append((cx + rx * f * math.cos(t), cy + ry * f * math.sin(t), z))
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
    # Low hills: gentle domes the sun picks out (units are not lifted, so they stay low).
    for i, hl in enumerate(data["hills"]):
        cx, cy = m((hl["x"], hl["y"]))
        dome(f"hill{i}", cx, cy, hl["rx"] / PPM_GAME, hl["ry"] / PPM_GAME, 1.6, grass)

    # River: muddy bank under dark water; segments run on past their ends to close the bends.
    bank = material("#6f6043", 0.9, pattern="dirt", alt="#56492f")
    water = material("#2f4d5c", 0.06, pattern="plain")
    rw = data["river"]["width"] / PPM_GAME
    pts = [m(p) for p in data["river"]["points"]]
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        lift = 0.0005 * (k % 2)
        # Thin slabs: thick ones show their sides as stripes where segments overlap.
        strip(f"bank{k}", a, b, rw + 2.4, 0.012 + lift, bank, extend=(rw + 2.4) / 2, thick=0.002)
        strip(f"water{k}", a, b, rw, 0.022 + lift, water, extend=rw / 2, thick=0.002)
        mask.capsule(a, b, rw / 2 + 1.6)

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

    # Bridges: a deck over the water with kerbs; stone or timber.
    for i, br in enumerate(data["bridges"]):
        cx, cy = m((br["x"], br["y"]))
        L, W = br["length"] / PPM_GAME, br["width"] / PPM_GAME
        stone = br["material"] == "stone"
        deck = material("#8f877a" if stone else "#6e5236", 0.9, pattern="wall" if stone else "planks", alt="#77705f" if stone else "#5a4129")
        slab(f"bridge{i}", rect(cx, cy, L, W * 0.62, br["angle"]), 0.05, 0.22, deck)
        kerb = material("#a39a88" if stone else "#4f3a26", 0.9, pattern="plain")
        for side in (-1, 1):
            c, s = math.cos(-br["angle"]), math.sin(-br["angle"])
            ox, oy = -s * side * W * 0.31, c * side * W * 0.31
            slab(f"kerb{i}{side}", rect(cx + ox, cy + oy, L, 0.35, br["angle"]), 0.22, 0.56 if stone else 0.46, kerb)

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
