from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops


@dataclass(frozen=True)
class WarpMoshConfig:
    """Configuration for the warp/datamosh pipeline."""

    seed: int = 42


def warp_mosh_image(infile: str | Path, outfile: str | Path, config: WarpMoshConfig | None = None) -> Path:
    """Apply a deterministic warp/datamosh effect to an image and write result."""

    cfg = config or WarpMoshConfig()
    input_path = Path(infile)
    output_path = Path(outfile)

    img = Image.open(input_path).convert("RGB")
    arr = np.array(img).astype(np.uint8)
    h, w, _ = arr.shape

    rng = np.random.default_rng(cfg.seed)

    y = np.arange(h)[:, None]
    x = np.arange(w)[None, :]

    dx = (
        28 * np.sin(2 * np.pi * y / 97.0 + 0.7)
        + 14 * np.sin(2 * np.pi * y / 37.0 + 2.2)
        + 6 * np.sin(2 * np.pi * y / 13.0 + 1.1)
    ).astype(np.int32)

    dy = (
        10 * np.sin(2 * np.pi * x / 131.0 + 1.9)
        + 5 * np.sin(2 * np.pi * x / 41.0 + 0.3)
    ).astype(np.int32)

    warped = np.empty_like(arr)
    for yy in range(h):
        warped[yy] = np.roll(arr[yy], int(dx[yy, 0]), axis=0)
    for xx in range(w):
        warped[:, xx] = np.roll(warped[:, xx], int(dy[0, xx]), axis=0)

    moshed = warped.copy()
    block_h_choices = [8, 12, 16, 24, 32, 48]
    for _ in range(180):
        bh = int(rng.choice(block_h_choices))
        y0 = int(rng.integers(0, max(1, h - bh)))
        shift = int(rng.integers(-120, 121))
        moshed[y0 : y0 + bh] = np.roll(moshed[y0 : y0 + bh], shift, axis=1)

    for _ in range(80):
        bw = int(rng.choice([4, 6, 8, 12, 16, 24]))
        x0 = int(rng.integers(0, max(1, w - bw)))
        shift = int(rng.integers(-60, 61))
        moshed[:, x0 : x0 + bw] = np.roll(moshed[:, x0 : x0 + bw], shift, axis=0)

    r = moshed[:, :, 0]
    g = moshed[:, :, 1]
    b = moshed[:, :, 2]

    r2 = np.roll(r, 9, axis=1)
    g2 = np.roll(g, -6, axis=0)
    b2 = np.roll(b, -18, axis=1)

    glitch = np.dstack([r2, g2, b2]).astype(np.uint8)

    for _ in range(130):
        y0 = int(rng.integers(0, h))
        thickness = int(rng.choice([1, 2, 3, 4, 6]))
        val = int(rng.integers(-50, 70))
        glitch[y0 : y0 + thickness] = np.clip(glitch[y0 : y0 + thickness].astype(np.int16) + val, 0, 255).astype(
            np.uint8
        )

    for _ in range(55):
        x0 = int(rng.integers(0, w))
        bw = int(rng.choice([1, 2, 3, 4, 5, 8]))
        mult = rng.uniform(0.55, 1.45)
        glitch[:, x0 : x0 + bw] = np.clip(glitch[:, x0 : x0 + bw].astype(np.float32) * mult, 0, 255).astype(
            np.uint8
        )

    q = glitch.copy()
    block = 8
    for y0 in range(0, h, block):
        for x0 in range(0, w, block):
            tile = q[y0 : y0 + block, x0 : x0 + block]
            mean = tile.reshape(-1, 3).mean(axis=0)
            qtile = (0.55 * tile + 0.45 * mean).clip(0, 255)
            q[y0 : y0 + block, x0 : x0 + block] = (np.round(qtile / 16) * 16).clip(0, 255)

    im_q = Image.fromarray(q.astype(np.uint8), "RGB")
    smear = im_q.copy()
    for offset, alpha in [(18, 0.18), (-27, 0.12), (43, 0.08)]:
        shifted = ImageChops.offset(im_q, offset, 0)
        smear = Image.blend(smear, shifted, alpha)

    final = np.array(smear).astype(np.int16)
    noise = rng.integers(-12, 13, size=(h, w, 1))
    final = np.clip(final + noise, 0, 255)

    for _ in range(24):
        y0 = int(rng.integers(0, max(1, h - 10)))
        bh = int(rng.choice([6, 8, 12, 18, 24]))
        shift = int(rng.integers(-180, 181))
        band = np.roll(final[y0 : y0 + bh], shift, axis=1)
        final[y0 : y0 + bh] = np.clip(0.7 * final[y0 : y0 + bh] + 0.3 * band, 0, 255)

    final = (np.round(final / 20) * 20).clip(0, 255).astype(np.uint8)

    out = Image.fromarray(final, "RGB")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(output_path)

    return output_path
