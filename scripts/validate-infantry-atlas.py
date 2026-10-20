#!/usr/bin/env python3
"""Validate approved sprite atlas images, manifests, pose anchors and provenance."""
import argparse
import json
import sys
from pathlib import Path
from infantry_atlas import SIDES, validate

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--side", choices=(*SIDES, "all"), default="all")
    parser.add_argument("--out", type=Path, default=ROOT / "graphics-lab/assets/sprites/infantry")
    args = parser.parse_args()
    sides = list(SIDES) if args.side == "all" else [args.side]
    try:
        for side in sides:
            print(json.dumps(validate(side, args.out)))
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"infantry atlas validation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
