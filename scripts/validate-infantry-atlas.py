#!/usr/bin/env python3
"""Independent shape/content validation of v321 infantry PNG+Pixi atlas JSON."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from infantry_atlas_png import PngError, alpha_bounds, read_rgba
from importlib.machinery import SourceFileLoader

# The hyphenated packer filename is a CLI entry point, not a Python module.
# Keep this validator standalone and agree with the checked-in source contract.
ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "graphics-lab/assets/sprites/unit-animation-config.json"
SIDES = {"france": "fr", "britain": "br"}


def expected_names(side: str, cfg: dict) -> dict[str, list[str]]:
    prefix = SIDES[side]
    return {
        kind: [f"{prefix}_line_{kind}_{i:02d}" for i in range(1, state["frames"] + 1)]
        for kind, state in cfg["states"].items()
    }


def validate(folder: Path, side: str) -> dict:
    cfg = json.loads(CONFIG.read_text(encoding="utf8"))
    prefix = SIDES[side]
    stem = prefix + "_line_infantry_atlas"
    png = folder / (stem + ".png")
    sheet = json.loads((folder / (stem + ".json")).read_text(encoding="utf8"))
    record = json.loads((folder / "atlas-provenance.json").read_text(encoding="utf8"))
    w, h, atlas_w, atlas_h = (
        cfg["frameWidth"], cfg["frameHeight"],
        cfg["atlasColumns"] * cfg["frameWidth"],
        cfg["atlasRows"] * cfg["frameHeight"],
    )
    width, height, pixels = read_rgba(png)
    if (width, height) != (atlas_w, atlas_h):
        raise ValueError(f"{png}: incorrect atlas dimensions")
    if sheet.get("meta") != {"image": png.name,
                             "size": {"w": atlas_w, "h": atlas_h}, "scale": "1"}:
        raise ValueError("Pixi metadata mismatch")
    groups = expected_names(side, cfg)
    names = [name for group in groups.values() for name in group]
    if len(names) != 17 or set(sheet.get("frames", {})) != set(names):
        raise ValueError("Wrong frame keys; require exactly 17 unique frames")
    if sheet.get("animations") != groups:
        raise ValueError("Unexpected animation frame order")
    if record.get("assetId") != side + "-line-infantry-v321":
        raise ValueError("Missing asset provenance")
    for key in ("usageRights", "sourceRef", "author"):
        if not isinstance(record.get(key), str) or not record[key].strip():
            raise ValueError("Missing provenance field " + key)
    if record.get("reviewedForUse") is not True:
        raise ValueError("Art has not been approved for use")
    if record.get("frameCount") != 17 or record.get("atlasSize") != [atlas_w, atlas_h]:
        raise ValueError("Provenance frame/size mismatch")
    if record.get("pivot") != cfg["pivot"] or record.get("referenceFacing") != cfg["referenceFacing"]:
        raise ValueError("Provenance anchor/facing mismatch")
    if record.get("frameOrder") != names:
        raise ValueError("Provenance frame list mismatch")
    if record.get("atlasPixelsSha256") != hashlib.sha256(pixels).hexdigest():
        raise ValueError("Atlas pixel SHA mismatch")

    seen = set()
    bottoms = []
    stamps = []
    records = record.get("frameRecords")
    if not isinstance(records, list) or len(records) != 17:
        raise ValueError("Expected 17 provenance frame records")
    for index, name in enumerate(names):
        x, y = (index % 6) * w, (index // 6) * h
        reference = {"x": x, "y": y, "w": w, "h": h}
        data = sheet["frames"][name]
        if (data.get("frame") != reference
            or data.get("sourceSize") != {"w": w, "h": h}
            or data.get("spriteSourceSize") != {"x": 0, "y": 0, "w": w, "h": h}
            or data.get("rotated") is not False
            or data.get("trimmed") is not False
            or data.get("anchor") != {
                "x": cfg["pivot"]["x"] / w,
                "y": cfg["pivot"]["y"] / h
            }):
            raise ValueError(f"Frame metadata does not match cell: {name}")
        sprite = b"".join(pixels[((y + row) * atlas_w + x) * 4:
                                 ((y + row) * atlas_w + x + w) * 4]
                          for row in range(h))
        bounds = alpha_bounds(sprite, w, h)
        if bounds is None:
            raise ValueError(f"Empty frame: {name}")
        x0, y0, x1, y1 = bounds
        if x0 == 0 or y0 == 0 or x1 >= w - 1 or y1 >= h - 1:
            raise ValueError(f"Clipped frame: {name}")
        foot = y1
        bottoms.append(foot)
        stamp = hashlib.sha256(sprite).hexdigest()
        if stamp in seen:
            raise ValueError(f"Duplicate pose content: {name}")
        seen.add(stamp)
        stamps.append(stamp)
        if records[index].get("frame") != name or records[index].get("sha256") != stamp:
            raise ValueError(f"Provenance/atlas frame mismatch: {name}")

    if max(bottoms) - min(bottoms) > 1:
        raise ValueError("Foot/shadow bottom jumps between animation frames")
    # Unused eighteenth cell must be entirely transparent.
    last_x = 5 * w
    last_y = 2 * h
    unused = b"".join(pixels[((last_y + row) * atlas_w + last_x) * 4:
                             ((last_y + row) * atlas_w + last_x + w) * 4]
                      for row in range(h))
    if any(unused):
        raise ValueError("Spare eighteenth atlas cell must be fully transparent")
    return {"side": side, "frames": len(stamps), "png": str(png),
            "size": [atlas_w, atlas_h], "footBottomRange": [min(bottoms), max(bottoms)],
            "sha256": record["atlasPixelsSha256"]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path,
                        default=ROOT / "art/generated/infantry-atlases")
    parser.add_argument("--side", choices=["france", "britain", "both"], default="both")
    args = parser.parse_args(argv)
    sides = tuple(SIDES) if args.side == "both" else (args.side,)
    try:
        results = [validate(args.input / side, side) for side in sides]
        print(json.dumps({"validated": results}, indent=2))
        return 0
    except (OSError, PngError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"Atlas validation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
