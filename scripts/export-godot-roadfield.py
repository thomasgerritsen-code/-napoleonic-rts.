#!/usr/bin/env python3
"""Bake packed road distances/detail for Godot, not a picture of the terrain.

Matches render-iso-gamemap.py's two Chaikin passes and smooth road unions.
No Blender scene, terrain, gameplay data or random simulation state changes.
Requires numpy and Pillow; run from any directory. Outputs are committed.
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "godot/assets/map"
CELL, RANGE, PPM = 0.25, 4.0, 22.5


def rounded(points):
    points = np.asarray(points, dtype=np.float64) / PPM
    for _ in range(2):
        pairs = np.stack((points[:-1] * .75 + points[1:] * .25,
                          points[:-1] * .25 + points[1:] * .75), axis=1)
        points = np.concatenate((points[:1], pairs.reshape(-1, 2), points[-1:]))
    return points


def smooth_min(a, b, radius):
    h = np.maximum(radius - np.abs(a - b), 0) / radius
    return np.minimum(a, b) - h * h * radius * .25


def road_field(data):
    width = math.ceil(data["world"]["w"] / PPM / CELL)
    height = math.ceil(data["world"]["h"] / PPM / CELL)
    shape = height, width
    stone, earth, first, second = (np.full(shape, 30., np.float32) for _ in range(4))
    across = np.full(shape, 2., np.float32)
    xs, ys = (np.arange(width) + .5) * CELL, (np.arange(height) + .5) * CELL
    for road in data["roads"]:
        half = road["width"] / PPM / 2
        points = rounded(road["points"])
        distance = np.full(shape, 30., np.float32)
        for a, b in zip(points, points[1:]):
            lo = np.maximum(np.floor((np.minimum(a, b) - half - 6) / CELL).astype(int), 0)
            hi = np.minimum(np.ceil((np.maximum(a, b) + half + 6) / CELL).astype(int) + 1, [width, height])
            x, y = np.meshgrid(xs[lo[0]:hi[0]], ys[lo[1]:hi[1]])
            delta = b - a
            t = np.clip(((x - a[0]) * delta[0] + (y - a[1]) * delta[1]) / max(float(delta @ delta), 1e-9), 0, 1)
            part = distance[lo[1]:hi[1], lo[0]:hi[0]]
            np.minimum(part, np.hypot(x - a[0] - t * delta[0], y - a[1] - t * delta[1]), out=part)
        signed = distance - half
        if road["cls"] == "chaussee":
            stone = smooth_min(stone, signed, 1.6)
        else:
            earth = smooth_min(earth, signed, 1.2)
            closer = signed < first
            across = np.where(closer, distance / half * (-1 if road["cls"] == "track" else 1), across)
            second = np.where(closer, first, np.minimum(second, signed))
            first = np.minimum(first, signed)
    # Godot UV y grows southward. Unlike the Blender buffer, do not flip rows.
    rgba = np.stack((stone / (2 * RANGE) + .5, earth / (2 * RANGE) + .5,
                     across / 4 + .5, np.clip((second - first) / 2.5, 0, 1)), axis=-1)
    return np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8)


def detail_tile():
    """Seamless 3.2m tile: stone shade, rounded height, grit, broad wear.

    Bake the nine-neighbour stone search once; the GPU reads one packed texel.
    A local fixed generator leaves both Python global and game RNG untouched.
    """
    size, cells = 256, 12
    rng = np.random.default_rng(7401)
    seeds = rng.uniform(.18, .82, (cells, cells, 2))
    shades = rng.uniform(.12, .96, (cells, cells))
    x, y = np.meshgrid((np.arange(size) + .5) * cells / size,
                       (np.arange(size) + .5) * cells / size)
    bx, by = np.floor(x).astype(int), np.floor(y).astype(int)
    first, second = np.full(x.shape, 100.), np.full(x.shape, 100.)
    shade = np.zeros_like(x)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            ix, iy = (bx + ox) % cells, (by + oy) % cells
            d = np.hypot(x - bx - ox - seeds[iy, ix, 0], y - by - oy - seeds[iy, ix, 1])
            closer = d < first
            shade = np.where(closer, shades[iy, ix], shade)
            second = np.where(closer, first, np.minimum(second, d))
            first = np.minimum(first, d)
    edge = np.clip((second - first - .025) / .24, 0, 1)
    rounded_height = edge * edge * (3 - 2 * edge)
    grit = rng.uniform(0, 1, (size, size))
    broad = .5 + .18 * np.sin(x * math.tau / cells) * np.cos(y * math.tau / cells * 2) + .12 * np.sin((x + y) * math.tau / cells * 3)
    packed = np.stack((shade, rounded_height, grit, broad), axis=-1)
    return np.round(np.clip(packed, 0, 1) * 255).astype(np.uint8)


if __name__ == "__main__":
    data = json.loads((OUT / "gamemap.json").read_text())
    for name, pixels in (("road_field.png", road_field(data)), ("road_detail.png", detail_tile())):
        path = OUT / name
        Image.fromarray(pixels).save(path, optimize=True)
        print(f"{path.relative_to(ROOT)}: {pixels.shape[1]}x{pixels.shape[0]}, {path.stat().st_size} bytes")
