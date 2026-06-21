from __future__ import annotations

import argparse
from pathlib import Path


def _default_processor(input_path: Path, output_path: Path, seed: int, intensity: float = 0.5) -> Path:
    from py_warp_mosh.core import WarpMoshConfig, warp_mosh_image

    return warp_mosh_image(input_path, output_path, WarpMoshConfig(seed=seed, intensity=intensity))


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}_warped_datamosh_bitmap.png")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Apply a warp/datamosh bitmap effect to an image.")
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help=(
            "Input image(s), or input + output. If one input is provided without --output, "
            "output defaults to <input_stem>_warped_datamosh_bitmap.png"
        ),
    )
    parser.add_argument("-o", "--output", type=Path, help="Explicit output path (single input only)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic effect")
    parser.add_argument("--intensity", type=float, default=0.5, help="Effect intensity from 0.0 (none) to 1.0 (max)")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not args.paths:
        parser.print_help()
        return 0

    jobs: list[tuple[Path, Path]] = []
    if args.output is not None:
        if len(args.paths) != 1:
            parser.error("--output can only be used with a single input path")
        jobs.append((args.paths[0], args.output))
    elif len(args.paths) == 2:
        jobs.append((args.paths[0], args.paths[1]))
    else:
        jobs.extend((input_path, default_output_path(input_path)) for input_path in args.paths)

    for input_path, output_path in jobs:
        outfile = _default_processor(input_path, output_path, args.seed, args.intensity)
        print(f"Saved: {outfile}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
