#!/usr/bin/env python3
"""Create a matte-free RGBA Pandora mark from the approved grayscale source.

The checked-in UI source is an 8-bit, non-interlaced grayscale PNG with a
white background. This script converts luminance into opacity, writes only
IHDR/IDAT/IEND chunks, and therefore cannot preserve a white/black matte or a
PNG background hint. It uses only Python's standard library so CI output does
not depend on runner image packages.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    left_distance = abs(estimate - left)
    above_distance = abs(estimate - above)
    upper_left_distance = abs(estimate - upper_left)
    if left_distance <= above_distance and left_distance <= upper_left_distance:
        return left
    if above_distance <= upper_left_distance:
        return above
    return upper_left


def _read_grayscale_png(path: Path) -> tuple[int, int, list[bytes]]:
    data = path.read_bytes()
    if not data.startswith(_PNG_SIGNATURE):
        raise ValueError(f"{path}: not a PNG")

    offset = len(_PNG_SIGNATURE)
    width = height = 0
    idat = bytearray()
    seen_ihdr = False
    while offset < len(data):
        if offset + 12 > len(data):
            raise ValueError(f"{path}: truncated PNG chunk")
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        payload_start = offset + 8
        payload_end = payload_start + length
        crc_end = payload_end + 4
        if crc_end > len(data):
            raise ValueError(f"{path}: truncated {chunk_type!r} chunk")
        payload = data[payload_start:payload_end]
        expected_crc = struct.unpack(">I", data[payload_end:crc_end])[0]
        actual_crc = zlib.crc32(chunk_type + payload) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            raise ValueError(f"{path}: invalid {chunk_type.decode()} CRC")

        if chunk_type == b"IHDR":
            if length != 13 or seen_ihdr:
                raise ValueError(f"{path}: invalid IHDR")
            width, height, bit_depth, colour_type, compression, filtering, interlace = (
                struct.unpack(">IIBBBBB", payload)
            )
            if (
                width <= 0
                or height <= 0
                or bit_depth != 8
                or colour_type != 0
                or compression != 0
                or filtering != 0
                or interlace != 0
            ):
                raise ValueError(
                    f"{path}: expected 8-bit non-interlaced grayscale PNG; "
                    f"received {width}x{height}, depth={bit_depth}, "
                    f"colour_type={colour_type}, interlace={interlace}"
                )
            seen_ihdr = True
        elif chunk_type == b"IDAT":
            idat.extend(payload)
        elif chunk_type == b"IEND":
            break
        offset = crc_end

    if not seen_ihdr or not idat:
        raise ValueError(f"{path}: missing IHDR or IDAT")

    decoded = zlib.decompress(bytes(idat))
    stride = width
    expected_length = height * (stride + 1)
    if len(decoded) != expected_length:
        raise ValueError(
            f"{path}: expected {expected_length} decoded bytes; got {len(decoded)}"
        )

    rows: list[bytes] = []
    previous = bytearray(stride)
    cursor = 0
    for row_index in range(height):
        filter_type = decoded[cursor]
        cursor += 1
        filtered = decoded[cursor : cursor + stride]
        cursor += stride
        row = bytearray(stride)
        for index, value in enumerate(filtered):
            left = row[index - 1] if index else 0
            above = previous[index]
            upper_left = previous[index - 1] if index else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = above
            elif filter_type == 3:
                predictor = (left + above) // 2
            elif filter_type == 4:
                predictor = _paeth(left, above, upper_left)
            else:
                raise ValueError(
                    f"{path}: unsupported filter {filter_type} on row {row_index}"
                )
            row[index] = (value + predictor) & 0xFF
        rows.append(bytes(row))
        previous = row
    return width, height, rows


def _chunk(chunk_type: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + chunk_type
        + payload
        + struct.pack(">I", zlib.crc32(chunk_type + payload) & 0xFFFFFFFF)
    )


def _write_transparent_png(
    path: Path,
    width: int,
    height: int,
    grayscale_rows: list[bytes],
) -> dict[str, int | str]:
    rgba = bytearray()
    transparent_pixels = 0
    visible_pixels = 0
    opaque_pixels = 0
    min_alpha = 255
    max_alpha = 0

    for row in grayscale_rows:
        rgba.append(0)  # deterministic PNG filter: None
        for luminance in row:
            alpha = 255 - luminance
            rgba.extend((0, 0, 0, alpha))
            min_alpha = min(min_alpha, alpha)
            max_alpha = max(max_alpha, alpha)
            if alpha == 0:
                transparent_pixels += 1
            else:
                visible_pixels += 1
            if alpha == 255:
                opaque_pixels += 1

    pixel_count = width * height
    if transparent_pixels == 0 or visible_pixels == 0:
        raise ValueError(
            "Converted mark must contain both transparent and visible pixels"
        )
    if transparent_pixels < pixel_count // 20:
        raise ValueError("Converted mark has too little transparent area")

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    output = (
        _PNG_SIGNATURE
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(bytes(rgba), level=9))
        + _chunk(b"IEND", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(output)

    return {
        "width": width,
        "height": height,
        "colour_type": 6,
        "transparent_pixels": transparent_pixels,
        "visible_pixels": visible_pixels,
        "opaque_pixels": opaque_pixels,
        "min_alpha": min_alpha,
        "max_alpha": max_alpha,
        "sha256": hashlib.sha256(output).hexdigest(),
        "size_bytes": len(output),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()

    try:
        width, height, rows = _read_grayscale_png(args.source)
        evidence = _write_transparent_png(args.output, width, height, rows)
        evidence["source_sha256"] = hashlib.sha256(
            args.source.read_bytes()
        ).hexdigest()
        evidence["output"] = str(args.output)
        serialized = json.dumps(evidence, sort_keys=True, indent=2) + "\n"
        if args.manifest:
            args.manifest.parent.mkdir(parents=True, exist_ok=True)
            args.manifest.write_text(serialized, encoding="utf-8")
        sys.stdout.write(serialized)
        return 0
    except (OSError, ValueError, zlib.error) as error:
        print(f"transparent mark generation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
