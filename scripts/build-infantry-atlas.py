#!/usr/bin/env python3
"""Pack approved 17-frame Napoleonic infantry renders into Pixi-compatible atlases.

Run from any directory:
  python3 scripts/build-infantry-atlas.py --source-root art/frames/infantry \
    --out art/generated/infantry-atlases

Each source folder contains 17 <fr|br>_line_<state>_<NN>.png files and a
provenance.json record. No dummy/placeholder frames are ever generated here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from infantry_atlas_png import PngError, alpha_bounds, read_rgba, write_rgba

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "graphics-lab/assets/sprites/unit-animation-config.json"
SIDES = {"france": "fr", "britain": "br"}
BASENAME = {"france": "fr_line_infantry_atlas", "britain": "br_line_infantry_atlas"}


def config() -> dict:
    data = json.loads(CONFIG.read_text(encoding="utf8"))
    if (data["frameWidth"], data["frameHeight"]) != (96, 96):
        raise ValueError("v321 requires exactly 96×96 RGBA frames")
    if (data["atlasColumns"], data["atlasRows"]) != (6, 3):
        raise ValueError("v321 requires exactly 6×3 atlas cells")
    if data["pivot"] != {"x": 48, "y": 78}:
        raise ValueError("v321 requires a constant (48,78) pivot")
    if {k: v["frames"] for k, v in data["states"].items()} != {
        "idle": 2, "march": 6, "aim": 2, "fire": 3, "reload": 4
    }:
        raise ValueError("v321 requires the approved 17-frame animation sequence")
    return data


def ordered_frames(prefix: str, data: dict) -> dict[str, list[str]]:
    return {
        key: [f"{prefix}_line_{key}_{i:02d}" for i in range(1, state["frames"] + 1)]
        for key, state in data["states"].items()
    }


def read_provenance(directory: Path, side: str) -> dict:
    source = directory / "provenance.json"
    manifest = json.loads(source.read_text(encoding="utf8"))
    if manifest.get("assetId") != f"{side}-line-infantry-v321":
        raise ValueError(f"{source}: incorrect assetId")
    if manifest.get("sourceType") not in {"original", "commissioned", "generated"}:
        raise ValueError(f"{source}: unsupported sourceType")
    for key in ("author", "usageRights", "sourceRef"):
        value = manifest.get(key)
        if not isinstance(value, str) or len(value.strip()) < 6 or value.strip().lower() in {
            "unknown", "tbd", "placeholder", "none", "pending"
        }:
            raise ValueError(f"{source}: meaningful {key} is required")
    if manifest.get("reviewedForUse") is not True:
        raise ValueError(f"{source}: approved asset rights/art review required")
    if manifest.get("referenceFacing") != "screen-right":
        raise ValueError(f"{source}: referenceFacing must be screen-right")
    if manifest.get("pivot") != {"x": 48, "y": 78}:
        raise ValueError(f"{source}: pivot must be (48,78)")
    if manifest.get("feetAligned") is not True:
        raise ValueError(f"{source}: independent foot-anchor review required")
    return manifest


def prepare_side(side: str, source_root: Path, cfg: dict) -> tuple[bytes, dict, dict]:
    prefix = SIDES[side]
    folder = source_root / side
    animations = ordered_frames(prefix, cfg)
    names = [item for frames in animations.values() for item in frames]
    assert len(names) == 17 and len(set(names)) == 17
    provenance = read_provenance(folder, side)
    expected = {f"{name}.png" for name in names}
    actual = {p.name for p in folder.glob("*.png")}
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing or extra:
        raise ValueError(f"{folder}: missing frames={missing}; unexpected frames={extra}")

    w, h, cols, rows = (cfg["frameWidth"], cfg["frameHeight"],
                        cfg["atlasColumns"], cfg["atlasRows"])
    aw, ah = w * cols, h * rows
    atlas = bytearray(aw * ah * 4)
    hashes: dict[str, str] = {}
    bounding_bottoms = []
    source_records = []

    for index, name in enumerate(names):
        file = folder / f"{name}.png"
        width, height, pixels = read_rgba(file)
        if (width, height) != (w, h):
            raise ValueError(f"{file}: requires exact {w}×{h}, got {width}×{height}")
        box = alpha_bounds(pixels, width, height)
        if box is None:
            raise ValueError(f"{file}: transparent/empty frame")
        x0, y0, x1, y1 = box
        # For a clean RGBA sprite sheet no graphical content may touch borders.
        if x0 < 1 or y0 < 1 or x1 >= w - 1 or y1 >= h - 1:
            raise ValueError(f"{file}: alpha content touches a frame border")
        bounding_bottoms.append(y1)
        source_hash = hashlib.sha256(pixels).hexdigest()
        if source_hash in hashes.values():
            raise ValueError(f"{file}: duplicate pixel-identical frame is not a real pose")
        hashes[name] = source_hash
        x, y = (index % cols) * w, (index // cols) * h
        for row in range(h):
            src_start = row * w * 4
            dst_start = ((y + row) * aw + x) * 4
            atlas[dst_start:dst_start + w * 4] = pixels[src_start:src_start + w * 4]
        source_records.append({
            "frame": name, "sha256": source_hash,
            "alphaBounds": {"left": x0, "top": y0, "right": x1, "bottom": y1}
        })
    if max(bounding_bottoms) - min(bounding_bottoms) > 1:
        raise ValueError(f"{folder}: feet/shadow bottom varies more than 1px; align poses")

    frame_records = {}
    for index, name in enumerate(names):
        x, y = (index % cols) * w, (index // cols) * h
        frame_records[name] = {
            "frame": {"x": x, "y": y, "w": w, "h": h},
            "rotated": False, "trimmed": False,
            "sourceSize": {"w": w, "h": h},
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "anchor": {"x": cfg["pivot"]["x"] / w, "y": cfg["pivot"]["y"] / h},
        }
    basename = BASENAME[side]
    sheet = {
        "frames": frame_records,
        "animations": animations,
        "meta": {"image": basename + ".png",
                 "size": {"w": aw, "h": ah}, "scale": "1"},
    }
    digest = hashlib.sha256(atlas).hexdigest()
    report = {
        "side": side, "assetId": provenance["assetId"],
        "sourceType": provenance["sourceType"],
        "author": provenance["author"], "usageRights": provenance["usageRights"],
        "sourceRef": provenance["sourceRef"], "reviewedForUse": True,
        "frameCount": len(names), "atlasSize": [aw, ah],
        "pivot": cfg["pivot"], "referenceFacing": cfg["referenceFacing"],
        "frameOrder": names, "frameRecords": source_records,
        "atlasPixelsSha256": digest,
        "footBottomRange": [min(bounding_bottoms), max(bounding_bottoms)],
    }
    return bytes(atlas), sheet, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True,
                        help="Approved rendered 96px frame folders (france/, britain/)")
    parser.add_argument("--out", type=Path,
                        default=ROOT / "art/generated/infantry-atlases")
    parser.add_argument("--side", choices=["france", "britain", "both"], default="both")
    args = parser.parse_args(argv)
    sides = tuple(SIDES) if args.side == "both" else (args.side,)
    try:
        cfg = config()
        # Validate ALL inputs before touching outputs: partial atlas deployment is unsafe.
        built = {side: prepare_side(side, args.source_root, cfg) for side in sides}
        for side, (pixels, sheet, report) in built.items():
            folder = args.out / side
            folder.mkdir(parents=True, exist_ok=True)
            name = BASENAME[side]
            write_rgba(folder / (name + ".png"),
                       sheet["meta"]["size"]["w"], sheet["meta"]["size"]["h"], pixels)
            (folder / (name + ".json")).write_text(
                json.dumps(sheet, indent=2) + "\n", encoding="utf8")
            (folder / "atlas-provenance.json").write_text(
                json.dumps(report, indent=2) + "\n", encoding="utf8")
            print(f"{side}: 17 reviewed frames packed to {folder / (name + '.png')}")
        return 0
    except (OSError, PngError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"Sprite atlas build failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
