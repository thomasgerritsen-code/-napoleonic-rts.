"""Dependency-free 8-bit RGBA PNG I/O for deterministic infantry atlases.

Supports PNG filter types 0–4. Deliberately rejects indexed/RGB, 16-bit,
interlaced and animated PNGs: source renders must already be canonical RGBA.
This is build tooling, not a browser or production game dependency.
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 2048 * 2048


class PngError(ValueError):
    pass


def dimensions(raw: bytes) -> tuple[int, int]:
    if not raw.startswith(SIGNATURE) or len(raw) < 33:
        raise PngError("Invalid PNG signature")
    length = struct.unpack_from(">I", raw, 8)[0]
    if length != 13 or raw[12:16] != b"IHDR":
        raise PngError("PNG IHDR must be first and 13 bytes")
    width, height, depth, color, compression, filtering, interlace = struct.unpack(
        ">IIBBBBB", raw[16:29]
    )
    if width < 1 or height < 1 or width * height > MAX_PIXELS:
        raise PngError("Invalid or unreasonably large PNG dimensions")
    if (depth, color, compression, filtering, interlace) != (8, 6, 0, 0, 0):
        raise PngError("Use non-interlaced 8-bit RGBA PNG (color type 6)")
    return width, height


def read_rgba(path: Path) -> tuple[int, int, bytes]:
    data = Path(path).read_bytes()
    if len(data) > MAX_BYTES:
        raise PngError("PNG is too large")
    w, h = dimensions(data)
    offset, compressed, seen_end = 8, bytearray(), False
    seen_ihdr = False
    while offset + 12 <= len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        if length > MAX_BYTES or offset + 12 + length > len(data):
            raise PngError("Truncated or oversized PNG chunk")
        kind = data[offset + 4:offset + 8]
        chunk = data[offset + 8:offset + 8 + length]
        crc_expected = struct.unpack_from(">I", data, offset + 8 + length)[0]
        if zlib.crc32(kind + chunk) & 0xFFFFFFFF != crc_expected:
            raise PngError("PNG chunk CRC mismatch")
        if not seen_ihdr and kind != b"IHDR":
            raise PngError("PNG must start with IHDR")
        if kind == b"IHDR":
            if seen_ihdr:
                raise PngError("Duplicate IHDR")
            seen_ihdr = True
        elif kind == b"IDAT":
            compressed.extend(chunk)
            if len(compressed) > MAX_BYTES:
                raise PngError("PNG compressed data too large")
        elif kind == b"IEND":
            seen_end = True
            break
        elif not 65 <= kind[0] <= 90:  # ancillary chunk
            pass
        else:
            raise PngError("Unsupported critical PNG chunk: " + kind.decode("ascii", "replace"))
        offset += 12 + length
    if not seen_end or not compressed:
        raise PngError("PNG is missing IDAT/IEND")
    stride = w * 4
    expected = (stride + 1) * h
    decoder = zlib.decompressobj()
    scanlines = decoder.decompress(bytes(compressed), expected + 1)
    if len(scanlines) != expected or decoder.unconsumed_tail or not decoder.eof:
        raise PngError("Unexpected PNG scanline length")
    scanlines += decoder.flush()
    if len(scanlines) != expected:
        raise PngError("Unexpected trailing PNG scanline data")
    pixels = bytearray(w * h * 4)
    prev = bytearray(stride)
    for y in range(h):
        start = y * (stride + 1)
        filter_type = scanlines[start]
        source = scanlines[start + 1:start + 1 + stride]
        if filter_type > 4:
            raise PngError("Unsupported PNG filter")
        row = bytearray(stride)
        for i in range(stride):
            left = row[i - 4] if i >= 4 else 0
            up = prev[i]
            upper_left = prev[i - 4] if i >= 4 else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = up
            elif filter_type == 3:
                predictor = (left + up) // 2
            else:
                p = left + up - upper_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - upper_left)
                predictor = left if pa <= pb and pa <= pc else up if pb <= pc else upper_left
            row[i] = (source[i] + predictor) & 255
        pixels[y * stride:(y + 1) * stride] = row
        prev = row
    return w, h, bytes(pixels)


def _chunk(kind: bytes, contents: bytes) -> bytes:
    return (struct.pack(">I", len(contents)) + kind + contents
            + struct.pack(">I", zlib.crc32(kind + contents) & 0xFFFFFFFF))


def write_rgba(path: Path, width: int, height: int, rgba: bytes) -> None:
    if width < 1 or height < 1 or width * height > MAX_PIXELS:
        raise PngError("Invalid PNG dimensions")
    stride = width * 4
    if len(rgba) != stride * height:
        raise PngError("RGBA buffer does not match dimensions")
    scans = b"".join(b"\x00" + rgba[y * stride:(y + 1) * stride]
                     for y in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    payload = (SIGNATURE + _chunk(b"IHDR", ihdr)
               + _chunk(b"IDAT", zlib.compress(scans, 9))
               + _chunk(b"IEND", b""))
    Path(path).write_bytes(payload)


def alpha_bounds(rgba: bytes, width: int, height: int) -> tuple[int, int, int, int] | None:
    xs, ys = [], []
    for y in range(height):
        for x in range(width):
            if rgba[(y * width + x) * 4 + 3] >= 16:
                xs.append(x)
                ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None
