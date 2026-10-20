#!/usr/bin/env python3
"""Pack approved 17-frame French/British PNG sources into Pixi/Canvas atlases."""
import argparse
import json
import sys
from pathlib import Path
from infantry_atlas import SIDES, build

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--side", choices=(*SIDES, "all"), default="all")
    parser.add_argument("--source", type=Path, default=ROOT / "art/approved/infantry")
    parser.add_argument("--out", type=Path, default=ROOT / "graphics-lab/assets/sprites/infantry")
    args = parser.parse_args()
    sides = list(SIDES) if args.side == "all" else [args.side]
    try:
        for side in sides:
            output = build(side, args.source, args.out)
            print(json.dumps({"side": side, "atlas": output, "frames": 17}))
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"infantry atlas build failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
