#!/usr/bin/env python3
"""Inspect actual 96px raster infantry art, not merely spritesheet metadata.

Creates a self-contained HTML frame review and machine-readable statistics.
Warnings are *heuristics*: missing legs, unstable scale or AI artifacts require
a human artist's review. This tool NEVER approves a frame automatically.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import struct
import sys
import zlib
from pathlib import Path
from statistics import median

from infantry_atlas_png import PngError, alpha_bounds, read_rgba

W = H = 96
ORDER = {"idle": 2, "march": 6, "aim": 2, "fire": 3, "reload": 4}
FOOT_Y0, FOOT_Y1 = 64, 79


def encode_rgba(width: int, height: int, rgba: bytes) -> bytes:
    """Tiny deterministic RGBA encoder for HTML thumbnails, no Pillow."""
    if len(rgba) != width * height * 4:
        raise ValueError("Wrong RGBA thumbnail length")

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (struct.pack(">I", len(payload)) + kind + payload
                + struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff))
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    rows = b"".join(b"\0" + rgba[y * width * 4:(y + 1) * width * 4]
                    for y in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def sheet_frames(atlas: Path, metadata: Path) -> tuple[dict, list[dict]]:
    sheet = json.loads(metadata.read_text(encoding="utf8"))
    width, height, data = read_rgba(atlas)
    if (width, height) != (576, 288):
        raise ValueError("Only 576x288, 6x3, 96px frame grids are supported")
    if sheet.get("meta", {}).get("size") != {"w": width, "h": height}:
        raise ValueError("Spritesheet metadata dimensions do not match PNG")
    animation = sheet.get("animations")
    if not isinstance(animation, dict) or {
        k: len(animation.get(k, [])) for k in ORDER
    } != ORDER:
        raise ValueError("Need 2/6/2/3/4 frame animations")
    frames = sheet.get("frames")
    results = []
    names = [name for action in ORDER for name in animation[action]]
    if len(set(names)) != 17 or set(frames or {}) != set(names):
        raise ValueError("Expected 17 unique named frame rectangles")
    for i, name in enumerate(names):
        descriptor = frames[name]
        x, y = (i % 6) * W, (i // 6) * H
        if (descriptor.get("frame") != {"x": x, "y": y, "w": W, "h": H}
                or descriptor.get("anchor") != {"x": 0.5, "y": 0.8125}):
            raise ValueError(f"Unexpected frame/pivot: {name}")
        rgba = b"".join(data[((y + row) * width + x) * 4:
                             ((y + row) * width + x + W) * 4]
                        for row in range(H))
        box = alpha_bounds(rgba, W, H)
        if not box:
            raise ValueError(f"Transparent empty frame: {name}")
        alpha = [rgba[p] for p in range(3, len(rgba), 4)]
        occupied = [v >= 48 for v in alpha]
        # Eyes aren't reliable at game zoom: the feet/legs silhouette matters.
        foot_coverage = sum(occupied[row * W + col]
                            for row in range(FOOT_Y0, FOOT_Y1)
                            for col in range(W))
        yfoot = box[3]
        xcenter = (box[0] + box[2]) / 2
        # Number of significant detached fragments: often musket/feet gaps.
        marked = bytearray(occupied)
        components = []
        for start in range(W * H):
            if not marked[start]:
                continue
            marked[start] = 0
            stack = [start]
            component = 0
            while stack:
                p = stack.pop()
                component += 1
                xx, yy = p % W, p // W
                for nx, ny in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)):
                    if 0 <= nx < W and 0 <= ny < H:
                        pos = ny * W + nx
                        if marked[pos]:
                            marked[pos] = 0
                            stack.append(pos)
            if component >= 12:
                components.append(component)
        results.append({
            "name": name, "state": next(k for k in ORDER if name in animation[k]),
            "cell": [x, y, W, H], "bounds": list(box),
            "footCoverage": foot_coverage, "footBottom": yfoot,
            "xCenter": xcenter,
            "significantFragments": max(0, len(components) - 1),
            "coloredPixels": sum(occupied),
            "pixelSha256": hashlib.sha256(rgba).hexdigest(),
            "_rgba": rgba
        })
    return sheet, results


def report(atlas: Path, metadata: Path) -> tuple[dict, list[dict]]:
    sheet, frames = sheet_frames(atlas, metadata)
    idle = [f for f in frames if f["state"] == "idle"]
    reference_foot = max(1, median(f["footCoverage"] for f in idle))
    reference_center = median(f["xCenter"] for f in idle)
    max_bottom, min_bottom = (max(f["footBottom"] for f in frames),
                              min(f["footBottom"] for f in frames))
    warnings = []
    for frame in frames:
        reasons = []
        if frame["footCoverage"] < reference_foot * .55:
            reasons.append("Weinig been-/voetpixels t.o.v. idle; controleer ontbrekende voeten")
        if abs(frame["xCenter"] - reference_center) > 8:
            reasons.append("Sterke horizontale silhouetverschuiving; controleer anker en perspectief")
        if frame["significantFragments"] > 0:
            reasons.append("Losse pixelfragmenten; controleer musket, benen en segmentatieranden")
        if frame["footBottom"] < max_bottom - 1:
            reasons.append("Voet-/schaduwonderrand verspringt meer dan 1 pixel")
        frame["warnings"] = reasons
        if reasons:
            warnings.append({"frame": frame["name"], "issues": reasons})
    info = {
        "status": "VISUAL_REVIEW_REQUIRED",
        "atlas": str(atlas),
        "sourceSha256": hashlib.sha256(atlas.read_bytes()).hexdigest(),
        "frameCount": len(frames),
        "baselineFootCoverage": reference_foot,
        "footBottomRange": [min_bottom, max_bottom],
        "warnings": warnings,
        "requiresManualReview": True,
        "note": "Heuristische controle; correcte anatomie, uniformen en consistente camera moeten visueel worden beoordeeld."
    }
    return info, frames


def html_report(info: dict, frames: list[dict]) -> str:
    cards = []
    for f in frames:
        image_url = "data:image/png;base64," + base64.b64encode(
            encode_rgba(W, H, f["_rgba"])).decode("ascii")
        status = "⚠ Visuele inspectie" if f["warnings"] else "Geen automatische waarschuwing"
        reasons = "".join("<li>" + html.escape(r) + "</li>" for r in f["warnings"])
        cards.append(
            f'<article class="frame"><h3>{html.escape(f["name"])}</h3>'
            f'<div class="poses"><img class="large" src="{image_url}" alt="frame"/>'
            f'<div class="small"><img src="{image_url}" alt="op 24 pixels"/></div></div>'
            f'<p class="stat">Voetpixels: {f["footCoverage"]} · '
            f'Segmenten: {f["significantFragments"]}</p>'
            f'<p class="status">{status}</p><ul>{reasons}</ul></article>')
    return f"""<!doctype html><html lang="nl"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Infanterie-v321: beeldkwaliteitscontrole</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;padding:18px;background:#1c2220;color:#eee6d7;
font:14px/1.45 system-ui}}h1{{font:27px Georgia,serif;margin:4px 0}}.intro{{max-width:850px;color:#c4c2b4}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}}
.frame{{border:1px solid #5e675a;border-radius:10px;background:#333b34;padding:12px}}
h3{{margin:0 0 8px;font-size:13px}}.poses{{display:flex;align-items:center;gap:24px}}
.large{{width:144px;height:144px;object-fit:contain;background:#6a715e;image-rendering:auto}}
.small{{width:24px;height:24px;background:#6a715e;overflow:hidden}}
.small img{{width:24px;height:24px;display:block}}
.stat{{font-size:11px;color:#c4b9a4}}.status{{font-size:12px;color:#edcb91}}ul{{padding-left:16px;color:#ded1ae;font-size:12px;margin-bottom:0}}
footer{{margin-top:18px;color:#e3be7c}}
</style></head><body><h1>Napoleonic RTS — v321 artcontrole</h1>
<p class="intro">17 frames · 96×96 px · origineel naast 24px gamegrootte.
Kwaliteitscontrole detecteert mogelijke ontbrekende benen, verspringingen en
losse fragmenten. Geen automatische goedkeuring: kijkhoek, beweging en anatomie
moeten met het oog worden gecontroleerd.</p>
<p>{len(info['warnings'])} van 17 frames met automatische aandachtspunten;
foot-baseline {info['baselineFootCoverage']} px.</p>
<div class="grid">{''.join(cards)}</div>
<footer>ARTREVIEW VEREIST · NIET GESCHIKT ALS PRODUCTIE-VRIJGAVE</footer>
</body></html>"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--atlas", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--html", type=Path)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args(argv)
    try:
        info, frames = report(args.atlas, args.metadata)
        for path in (args.html, args.json):
            if path:
                path.parent.mkdir(parents=True, exist_ok=True)
        if args.html:
            args.html.write_text(html_report(info, frames), encoding="utf8")
        if args.json:
            args.json.write_text(json.dumps({
                **info, "frames": [
                    {k: v for k, v in f.items() if k != "_rgba"}
                    for f in frames]
            }, indent=2), encoding="utf8")
        print(f"{len(info['warnings'])} van {len(frames)} frames met aandachtspunten; "
              "ARTREVIEW VEREIST")
        return 0
    except (OSError, ValueError, KeyError, IndexError, PngError, json.JSONDecodeError) as err:
        print("Atlas art review failed:", err, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
