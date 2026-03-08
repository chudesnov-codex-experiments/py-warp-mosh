from __future__ import annotations

import argparse
from pathlib import Path

from .core import WarpMoshConfig, warp_mosh_image


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Apply a warp/datamosh bitmap effect to an image.")
    parser.add_argument("input", type=Path, help="Input image path")
    parser.add_argument("output", type=Path, help="Output image path")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic effect")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    outfile = warp_mosh_image(args.input, args.output, WarpMoshConfig(seed=args.seed))
    print(f"Saved: {outfile}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
