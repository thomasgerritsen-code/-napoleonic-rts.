#!/usr/bin/env python3
"""Render the Graphics Lab iso terrain (grass, road, fields, pond) in Blender.

Reads graphics-lab/assets/iso/layout.json so the road and fields match the
positions the lab uses for marching soldiers and props. Same camera and sun
as the sprites (iso_blender_common.py); output is an opaque JPEG whose centre
pixel is ground origin (0, 0).

  python scripts/render-iso-ground.py
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from iso_blender_common import camera, material, setup_render, slab  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
LAYOUT = ROOT / "graphics-lab/assets/iso/layout.json"


def octagon(radius: float) -> list[tuple[float, float]]:
    return [(math.cos(math.radians(22.5 + 45 * k)) * radius, math.sin(math.radians(22.5 + 45 * k)) * radius)
            for k in range(8)]


def ring(name, radius, width, z, mat):
    """Octagonal band of `width` centred on the octagon of vertex radius `radius`."""
    grow = width / 2 / math.cos(math.radians(22.5))
    outer, inner = octagon(radius + grow), octagon(radius - grow)
    for k in range(8):
        quad = [inner[k], outer[k], outer[(k + 1) % 8], inner[(k + 1) % 8]]
        slab(f"{name}{k}", quad, z - 0.02, z, mat)


def strip(name, a, b, width, z, mat):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    nx, ny = -dy / length * width / 2, dx / length * width / 2
    slab(name, [(a[0] + nx, a[1] + ny), (a[0] - nx, a[1] - ny), (b[0] - nx, b[1] - ny), (b[0] + nx, b[1] + ny)],
         z - 0.02, z, mat)


def ellipse(cx, cy, rx, ry, n=40):
    return [(cx + rx * math.cos(t * math.tau / n), cy + ry * math.sin(t * math.tau / n)) for t in range(n)]


def on_road(x, y, layout, margin):
    r = layout["road"]
    reach = r["width"] / 2 + margin
    # Distance to the octagon's edge line (apothem) approximates the ring.
    apothem = r["radius"] * math.cos(math.radians(22.5))
    ang = math.atan2(y, x)
    sector = math.radians(45) * round(ang / math.radians(45))
    if abs(x * math.cos(sector) + y * math.sin(sector) - apothem) < reach:
        return True
    return any(abs(y - a[1]) < reach and min(a[0], b[0]) <= x <= max(a[0], b[0]) for a, b in r.get("spurs", []))


def in_poly(x, y, poly):
    inside = False
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            inside = not inside
    return inside


def scatter(layout, half, seed=1809):
    """Grass tufts, wild flowers and road stones as shared low-poly meshes."""
    import random
    rnd = random.Random(seed)

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
    stone = mesh("stone", [(-0.12, -0.09, 0), (0.12, -0.09, 0), (0.1, 0.1, 0), (-0.11, 0.08, 0), (0, 0, 0.09)],
                 [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], material("#8c857a", 0.9, pattern="plain"))
    fields = [f["poly"] for f in layout["fields"]]
    ponds = layout.get("ponds", [])

    def free(x, y):
        if on_road(x, y, layout, 0.6) or any(in_poly(x, y, f) for f in fields):
            return False
        return all(((x - p["x"]) / (p["rx"] + 1.2)) ** 2 + ((y - p["y"]) / (p["ry"] + 1.0)) ** 2 > 1 for p in ponds)

    def place(me, x, y, s):
        ob = bpy.data.objects.new(me.name, me)
        ob.location = (x, y, 0.0)
        ob.rotation_euler = (0, 0, rnd.uniform(0, math.tau))
        ob.scale = (s, s, s)
        bpy.context.collection.objects.link(ob)

    placed = 0
    while placed < 4200:
        x, y = rnd.uniform(-half, half), rnd.uniform(-half, half)
        if free(x, y):
            place(rnd.choice(tufts), x, y, rnd.uniform(0.7, 1.5))
            placed += 1
    for _ in range(700):
        x, y = rnd.uniform(-half, half), rnd.uniform(-half, half)
        if free(x, y):
            place(rnd.choice(flowers), x, y, rnd.uniform(0.8, 1.3))
    for _ in range(500):
        x, y = rnd.uniform(-half, half), rnd.uniform(-half, half)
        if on_road(x, y, layout, -0.4):
            place(stone, x, y, rnd.uniform(0.6, 1.4))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "graphics-lab/assets/iso"))
    ap.add_argument("--samples", type=int, default=32)
    args = ap.parse_args(argv)
    layout = json.loads(LAYOUT.read_text())
    g = layout["ground"]
    half, ppm = g["halfSize"], g["pxPerM"]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_render(args.samples, transparent=False, fmt="JPEG")
    w, h = round(2 * half * ppm), round(half * ppm)          # ground depth is halved by the 30° view
    camera(w, h, ppm, (w / 2, h / 2))
    bpy.context.scene.render.film_transparent = False

    grass = material("#4e6234", 0.95, pattern="grass", alt="#6d773b")
    slab("grass", [(-half - 2, -half - 2), (half + 2, -half - 2), (half + 2, half + 2), (-half - 2, half + 2)], -0.1, 0, grass)
    for i, f in enumerate(layout["fields"]):
        slab(f"field{i}", [tuple(p) for p in f["poly"]], 0, 0.015, material(f["color"], 0.95, pattern="rows", alt=f["alt"]))
    for i, p in enumerate(layout.get("ponds", [])):
        slab(f"bank{i}", ellipse(p["x"], p["y"], p["rx"] + 0.9, p["ry"] + 0.7), 0, 0.012,
             material("#7b6a48", 0.9, pattern="dirt", alt="#5f5236"))
        slab(f"pond{i}", ellipse(p["x"], p["y"], p["rx"], p["ry"]), 0, 0.02, material("#3a5664", 0.08, pattern="plain"))
    r = layout["road"]
    verge = material("#7b6a47", 0.95, pattern="dirt", alt="#6d7a3e")
    dirt = material("#a68b5e", 0.95, pattern="dirt", alt="#8e7651")
    ring("verge", r["radius"], r["width"] + 1.2, 0.02, verge)
    ring("road", r["radius"], r["width"], 0.03, dirt)
    for i, (a, b) in enumerate(r.get("spurs", [])):
        strip(f"spurverge{i}", a, b, r["width"] + 1.2, 0.018, verge)
        strip(f"spur{i}", a, b, r["width"], 0.027, dirt)
    scatter(layout, half)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str((out / g["image"]).resolve())
    bpy.ops.render.render(write_still=True)
    print(f"ground {w}x{h} -> {out / g['image']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
