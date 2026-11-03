#!/usr/bin/env python3
"""Deterministic close grass tile and world cover mask for native Godot.

The cover map samples the existing Blender terrain using its relief/projector.
The repeating RGBA tile stores short grass/litter RGB and height in alpha.
No photograph, network asset, gameplay map or Blender terrain is changed.
Requires NumPy and Pillow. The generated PNGs are committed.
"""
import base64
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "godot/assets/map"


def cover():
    meta = json.loads((OUT / "ground.json").read_text())
    r = meta["relief"]
    heights = np.frombuffer(base64.b64decode(r["data"]), "<u2").reshape(r["rows"], r["cols"]) / 100
    # 0.5m cells, pixel centres, same north-to-south axes as the road field.
    w, h = 712, 445
    x, y = np.meshgrid((np.arange(w) + .5) * .5, (np.arange(h) + .5) * .5)
    fj, fi = (x-r["x0"])/r["cell"], (y-r["y0"])/r["cell"]
    j, i = np.clip(fj.astype(int), 0, r["cols"]-2), np.clip(fi.astype(int), 0, r["rows"]-2)
    u, v = np.clip(fj-j, 0, 1), np.clip(fi-i, 0, 1)
    z = ((heights[i,j]*(1-u)+heights[i,j+1]*u)*(1-v)
         +(heights[i+1,j]*(1-u)+heights[i+1,j+1]*u)*v)
    sx = np.clip(np.round(x*meta["pxPerM"]).astype(int), 0, meta["w"]-1)
    sy = np.clip(np.round(meta["padTop"]+(y*.5-z*.866)*meta["pxPerM"]).astype(int), 0, meta["h"]-1)
    image = np.asarray(Image.open(OUT / "ground.jpg").convert("RGB"), dtype=np.float32)/255
    rgb = image[sy,sx]
    green = np.clip((rgb[:,:,1]/np.maximum(rgb[:,:,0],.001)-.99)/.13,0,1)
    green *= np.clip((rgb[:,:,1]/np.maximum(rgb[:,:,2],.001)-1.08)/.3,0,1)
    # Soft boundaries keep bare village yards and forest litter distinct.
    mask = Image.fromarray(np.round(green*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.65))
    return mask


def tile():
    size = 512
    rng = np.random.default_rng(181578)
    soil = np.zeros((size,size,3),dtype=np.uint8)
    noise = rng.normal(0,4,(size,size))
    for i,c in enumerate((90,105,52)):
        soil[:,:,i] = np.clip(c+noise,0,255)
    rgb = Image.fromarray(soil)
    height = Image.new("L",(size,size),60)
    draw, relief = ImageDraw.Draw(rgb), ImageDraw.Draw(height)
    palette = [(66,85,37),(103,121,58),(121,133,66),(142,143,81),(80,105,43),(111,122,61)]
    # Draw beyond every edge and wrap copies, so both colour and height tile.
    for _ in range(10500):
        x,y = rng.uniform(0,size,2)
        length = rng.uniform(4,19)
        angle = rng.uniform(-np.pi,np.pi)
        dx,dy = np.cos(angle)*length,np.sin(angle)*length
        width = int(rng.integers(1,3))
        color = palette[int(rng.integers(len(palette)))]
        value = int(rng.integers(85,230))
        for ox in (-size,0,size):
            for oy in (-size,0,size):
                points = [(x+ox-dy*.1,y+oy+dx*.1),(x+ox+dy*.1,y+oy-dx*.1),
                          (x+ox+dx*.65,y+oy+dy*.65),(x+ox+dx,y+oy+dy)]
                draw.polygon(points,fill=color)
                relief.line([(x+ox,y+oy),(x+ox+dx*.7,y+oy+dy*.7),(x+ox+dx,y+oy+dy)],fill=value,width=width)
    rgb.putalpha(height.filter(ImageFilter.GaussianBlur(.6)))
    return rgb


if __name__=="__main__":
    for name,image in (("grass_cover.png",cover()),("grass_detail.png",tile())):
        p=OUT/name
        image.save(p,optimize=True)
        print(p.name,image.size,p.stat().st_size)
