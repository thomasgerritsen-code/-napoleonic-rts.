"""Dependency-free, strict 96px RGBA PNG packing for Graphics Lab infantry."""
from __future__ import annotations

import hashlib
import json
import struct
import zlib
from pathlib import Path

FRAME = 96
COLS, ROWS = 6, 3
WIDTH, HEIGHT = COLS * FRAME, ROWS * FRAME
PIVOT = (48, 78)
STATES = (("idle", 2), ("march", 6), ("aim", 2), ("fire", 3), ("reload", 4))
SIDES = {"france": "fr", "britain": "br"}
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def frame_names(side):
    prefix = SIDES[side]
    return [(state, f"{prefix}_line_{state}_{i:02d}")
            for state, count in STATES for i in range(1, count + 1)]


def png_chunk(name, data):
    return (struct.pack(">I", len(data)) + name + data
            + struct.pack(">I", zlib.crc32(name + data) & 0xffffffff))


def encode_rgba(width, height, pixels):
    if len(pixels) != width * height * 4:
        raise ValueError("RGBA buffer dimensions do not match")
    stride = width * 4
    raw = b"".join(b"\x00" + pixels[y * stride:(y + 1) * stride]
                   for y in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (PNG_MAGIC + png_chunk(b"IHDR", ihdr)
            + png_chunk(b"IDAT", zlib.compress(raw, 9))
            + png_chunk(b"IEND", b""))


def decode_rgba(blob):
    if not blob.startswith(PNG_MAGIC):
        raise ValueError("Not a PNG")
    pos, image, compressed, ended = 8, None, bytearray(), False
    while pos < len(blob):
        if len(blob) - pos < 12:
            raise ValueError("Truncated PNG chunk")
        count = struct.unpack_from(">I", blob, pos)[0]
        if count > 32_000_000 or pos + 12 + count > len(blob):
            raise ValueError("Invalid PNG chunk length")
        name = blob[pos + 4:pos + 8]
        data = blob[pos + 8:pos + 8 + count]
        crc = struct.unpack_from(">I", blob, pos + 8 + count)[0]
        if zlib.crc32(name + data) & 0xffffffff != crc:
            raise ValueError("PNG CRC mismatch")
        pos += 12 + count
        if name == b"IHDR":
            if image is not None or len(data) != 13:
                raise ValueError("Duplicate/invalid IHDR")
            w, h, depth, mode, compression, filt, interlace = struct.unpack(">IIBBBBB", data)
            if (depth, mode, compression, filt, interlace) != (8, 6, 0, 0, 0):
                raise ValueError("Input must be non-interlaced 8-bit RGBA PNG")
            if not (1 <= w <= 2048 and 1 <= h <= 2048):
                raise ValueError("Unreasonable PNG dimensions")
            image = (w, h)
        elif name == b"IDAT":
            if image is None:
                raise ValueError("IDAT before IHDR")
            compressed.extend(data)
        elif name == b"IEND":
            ended = True
            break
        elif name[0] & 32 == 0:
            raise ValueError(f"Unsupported critical PNG chunk: {name!r}")
    if not ended or image is None or pos != len(blob):
        raise ValueError("Incomplete PNG")
    w, h = image
    try:
        raw = zlib.decompress(bytes(compressed))
    except zlib.error as error:
        raise ValueError("Corrupt PNG compressed image") from error
    stride = w * 4
    if len(raw) != (stride + 1) * h:
        raise ValueError("Incorrect decompressed PNG dimensions")
    pixels, previous = bytearray(), bytearray(stride)
    offset = 0
    for _ in range(h):
        filter_type = raw[offset]
        offset += 1
        scanline = bytearray(raw[offset:offset + stride])
        offset += stride
        if filter_type > 4:
            raise ValueError("Unsupported PNG filter")
        for i in range(stride):
            a = scanline[i - 4] if i >= 4 else 0
            b = previous[i]
            c = previous[i - 4] if i >= 4 else 0
            if filter_type == 1:
                scanline[i] = (scanline[i] + a) & 255
            elif filter_type == 2:
                scanline[i] = (scanline[i] + b) & 255
            elif filter_type == 3:
                scanline[i] = (scanline[i] + ((a + b) // 2)) & 255
            elif filter_type == 4:
                p = a + b - c
                distances = (abs(p - a), abs(p - b), abs(p - c))
                predictor = (a, b, c)[distances.index(min(distances))]
                scanline[i] = (scanline[i] + predictor) & 255
        pixels.extend(scanline)
        previous = scanline
    return w, h, bytes(pixels)


def bounds(pixels, width, height):
    occupied = [(i % width, i // width) for i in range(width * height)
                if pixels[4 * i + 3] > 0]
    if not occupied:
        raise ValueError("Frame is fully transparent")
    x0 = min(p[0] for p in occupied)
    x1 = max(p[0] for p in occupied)
    y0 = min(p[1] for p in occupied)
    y1 = max(p[1] for p in occupied)
    if x0 == 0 or y0 == 0 or x1 == width - 1 or y1 == height - 1:
        raise ValueError("Frame touches edge: keep transparent margin")
    return x0, y0, x1, y1


def provenance(source):
    file = source / "provenance.json"
    data = json.loads(file.read_text(encoding="utf-8"))
    required = ("assetId", "sourceType", "sourceReference", "license",
                "author", "date", "transformations")
    if any(not data.get(k) for k in required):
        raise ValueError(f"{file}: missing provenance or license fields")
    if data["sourceType"] not in ("original", "generated", "commissioned", "third-party"):
        raise ValueError("Unknown sourceType")
    if data["license"].strip().lower() in ("unknown", "unverified", "none"):
        raise ValueError("Unverified license not allowed")
    if not isinstance(data["transformations"], list):
        raise ValueError("transformations must be a list")
    return {k: data[k] for k in required}


def metadata(side, record):
    filenames = frame_names(side)
    frames = {}
    animations = {state: [] for state, _ in STATES}
    for i, (state, key) in enumerate(filenames):
        x, y = (i % COLS) * FRAME, (i // COLS) * FRAME
        frames[key] = {
            "frame": {"x": x, "y": y, "w": FRAME, "h": FRAME},
            "rotated": False, "trimmed": False,
            "sourceSize": {"w": FRAME, "h": FRAME},
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME, "h": FRAME},
            "anchor": {"x": 0.5, "y": 0.8125},
        }
        animations[state].append(key)
    prefix = SIDES[side]
    return {"frames": frames, "animations": animations,
            "meta": {"image": f"{prefix}_line_infantry_atlas.png",
                     "size": {"w": WIDTH, "h": HEIGHT}, "scale": "1",
                     "provenance": record}}


def validate_frames(frames):
    hashes, foot_positions = set(), []
    for name, pixels in frames:
        if len(pixels) != FRAME * FRAME * 4:
            raise ValueError(f"{name}: incorrect frame size")
        digest = hashlib.sha256(pixels).hexdigest()
        if digest in hashes:
            raise ValueError(f"{name}: duplicate frame pixels")
        hashes.add(digest)
        *_, foot_y = bounds(pixels, FRAME, FRAME)
        foot_positions.append(foot_y)
    if max(foot_positions) - min(foot_positions) > 1:
        raise ValueError("Frame foot baseline jumps by more than 1 px")
    if abs(foot_positions[0] - PIVOT[1]) > 12:
        raise ValueError("Foot baseline not aligned with pivot (48,78)")


def atlas_cells(pixels):
    result = []
    for i in range(COLS * ROWS):
        x, y = (i % COLS) * FRAME, (i // COLS) * FRAME
        cell = bytearray()
        for dy in range(FRAME):
            start = ((y + dy) * WIDTH + x) * 4
            cell.extend(pixels[start:start + FRAME * 4])
        result.append(bytes(cell))
    return result


def build(side, source_root, output_root):
    source = Path(source_root) / side
    output = Path(output_root) / side
    ordered = frame_names(side)
    expected = {f"{name}.png" for _, name in ordered}
    extras = {p.name for p in source.glob("*.png")} - expected
    if extras:
        raise ValueError(f"Unexpected frames in {source}: {sorted(extras)}")
    record = provenance(source)
    frames = []
    for _, key in ordered:
        image = source / f"{key}.png"
        w, h, pixels = decode_rgba(image.read_bytes())
        if (w, h) != (FRAME, FRAME):
            raise ValueError(f"{image}: expected 96x96 RGBA, got {w}x{h}")
        frames.append((key, pixels))
    validate_frames(frames)
    atlas = bytearray(WIDTH * HEIGHT * 4)
    for i, (_, pixels) in enumerate(frames):
        x, y = (i % COLS) * FRAME, (i // COLS) * FRAME
        for dy in range(FRAME):
            destination = ((y + dy) * WIDTH + x) * 4
            atlas[destination:destination + FRAME * 4] = pixels[dy * FRAME * 4:(dy + 1) * FRAME * 4]
    prefix = SIDES[side]
    image_name = f"{prefix}_line_infantry_atlas.png"
    json_name = f"{prefix}_line_infantry_atlas.json"
    output.mkdir(parents=True, exist_ok=True)
    (output / image_name).write_bytes(encode_rgba(WIDTH, HEIGHT, bytes(atlas)))
    (output / json_name).write_text(json.dumps(metadata(side, record), indent=2) + "\n", encoding="utf-8")
    validate(side, output_root)
    return str(output / image_name)


def validate(side, output_root):
    prefix = SIDES[side]
    output = Path(output_root) / side
    doc = json.loads((output / f"{prefix}_line_infantry_atlas.json").read_text(encoding="utf-8"))
    record = doc.get("meta", {}).get("provenance")
    if not isinstance(record, dict) or any(not record.get(k) for k in
        ("assetId", "sourceType", "sourceReference", "license", "author", "date", "transformations")):
        raise ValueError("Atlas missing complete asset provenance")
    if doc != metadata(side, record):
        raise ValueError("Atlas JSON frame contract or pivot mismatch")
    w, h, pixels = decode_rgba((output / doc["meta"]["image"]).read_bytes())
    if (w, h) != (WIDTH, HEIGHT):
        raise ValueError("Atlas must be 576x288 RGBA")
    cells = atlas_cells(pixels)
    validate_frames(list(zip((n for _, n in frame_names(side)), cells[:17])))
    if any(cells[17]):
        raise ValueError("18th atlas cell must be empty")
    return {"side": side, "frames": 17, "atlas": f"{w}x{h}", "pivot": PIVOT}
