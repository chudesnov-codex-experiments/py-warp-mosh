from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops


@dataclass(frozen=True)
class WarpMoshConfig:
    """Configuration for the warp/datamosh pipeline."""

    seed: int = 42
    intensity: float = 0.5


def warp_mosh_image(infile: str | Path, outfile: str | Path, config: WarpMoshConfig | None = None) -> Path:
    """Apply a deterministic warp/datamosh effect to an image and write result."""

    cfg = config or WarpMoshConfig()
    input_path = Path(infile)
    output_path = Path(outfile)

    img = Image.open(input_path).convert("RGB")
    arr = np.array(img).astype(np.uint8)
    h, w, _ = arr.shape

    rng = np.random.default_rng(cfg.seed)

    I = float(min(1.0, max(0.0, cfg.intensity)))
    D = min(w, h)

    y = np.arange(h)[:, None]
    x = np.arange(w)[None, :]

    # STAGE 1 — sinusoidal warp
    ax = max(2, int(round(0.018 * w * I)))
    ay = max(1, int(round(0.012 * h * I)))

    dx = (
        ax * np.sin(2 * np.pi * y / 97.0 + 0.7)
        + 0.5 * ax * np.sin(2 * np.pi * y / 37.0 + 2.2)
        + 0.25 * ax * np.sin(2 * np.pi * y / 13.0 + 1.1)
    ).astype(np.int32)

    dy = (
        ay * np.sin(2 * np.pi * x / 131.0 + 1.9)
        + 0.5 * ay * np.sin(2 * np.pi * x / 41.0 + 0.3)
    ).astype(np.int32)

    warped = np.empty_like(arr)
    for yy in range(h):
        warped[yy] = np.roll(arr[yy], int(dx[yy, 0]), axis=0)
    for xx in range(w):
        warped[:, xx] = np.roll(warped[:, xx], int(dy[0, xx]), axis=0)

    # STAGE 2 — row-mosh bands
    moshed = warped.copy()
    row_count = max(1, int(round(0.03 * h * I)))
    block_h_choices = [
        max(2, int(round(0.004 * h))),
        max(2, int(round(0.008 * h))),
        max(2, int(round(0.015 * h))),
        max(3, int(round(0.025 * h))),
    ]
    row_shift_mag = max(1, int(round(0.03 * w * I)))
    for _ in range(row_count):
        bh = int(rng.choice(block_h_choices))
        y0 = int(rng.integers(0, max(1, h - bh)))
        shift = int(rng.integers(-row_shift_mag, row_shift_mag + 1))
        moshed[y0 : y0 + bh] = np.roll(moshed[y0 : y0 + bh], shift, axis=1)

    # STAGE 3 — column-mosh bands
    col_count = max(1, int(round(0.015 * w * I)))
    block_w_choices = [
        max(2, int(round(0.003 * w))),
        max(2, int(round(0.006 * w))),
        max(3, int(round(0.012 * w))),
        max(3, int(round(0.02 * w))),
    ]
    col_shift_mag = max(1, int(round(0.02 * h * I)))
    for _ in range(col_count):
        bw = int(rng.choice(block_w_choices))
        x0 = int(rng.integers(0, max(1, w - bw)))
        shift = int(rng.integers(-col_shift_mag, col_shift_mag + 1))
        moshed[:, x0 : x0 + bw] = np.roll(moshed[:, x0 : x0 + bw], shift, axis=0)

    # STAGE 4 — RGB channel split
    r = moshed[:, :, 0]
    g = moshed[:, :, 1]
    b = moshed[:, :, 2]

    rOff = max(1, int(round(0.005 * w * I)))
    gOff = max(1, int(round(0.004 * h * I)))
    bOff = max(1, int(round(0.01 * w * I)))

    r2 = np.roll(r, rOff, axis=1)
    g2 = np.roll(g, -gOff, axis=0)
    b2 = np.roll(b, -bOff, axis=1)

    glitch = np.dstack([r2, g2, b2]).astype(np.uint8)

    # STAGE 5 — brightness streaks
    streak_count = max(1, int(round(0.02 * h * I)))
    streak_thickness_choices = [
        1,
        max(1, int(round(0.002 * h))),
        max(2, int(round(0.004 * h))),
    ]
    streak_val_mag = int(round(50 * I))
    for _ in range(streak_count):
        y0 = int(rng.integers(0, h))
        thickness = int(rng.choice(streak_thickness_choices))
        val = int(rng.integers(-streak_val_mag, streak_val_mag + 1)) if streak_val_mag > 0 else 0
        glitch[y0 : y0 + thickness] = np.clip(glitch[y0 : y0 + thickness].astype(np.int16) + val, 0, 255).astype(
            np.uint8
        )

    # STAGE 6 — darken/brighten columns
    col_bright_count = max(1, int(round(0.008 * w * I)))
    col_bright_w_choices = [
        1,
        max(1, int(round(0.002 * w))),
        max(2, int(round(0.004 * w))),
    ]
    mult_lo = 1 - 0.25 * I
    mult_hi = 1 + 0.25 * I
    for _ in range(col_bright_count):
        x0 = int(rng.integers(0, w))
        bw = int(rng.choice(col_bright_w_choices))
        mult = rng.uniform(mult_lo, mult_hi)
        glitch[:, x0 : x0 + bw] = np.clip(glitch[:, x0 : x0 + bw].astype(np.float32) * mult, 0, 255).astype(
            np.uint8
        )

    # STAGE 7 — block quantize+mix
    q = glitch.copy()
    block = max(4, int(round(0.01 * D)))
    for y0 in range(0, h, block):
        for x0 in range(0, w, block):
            tile = q[y0 : y0 + block, x0 : x0 + block]
            mean = tile.reshape(-1, 3).mean(axis=0)
            qtile = (0.85 * tile + 0.15 * mean).clip(0, 255)
            q[y0 : y0 + block, x0 : x0 + block] = (np.round(qtile / 8) * 8).clip(0, 255)

    # STAGE 8 — horizontal smear
    off0 = max(1, int(round(0.012 * w)))
    off1 = -max(1, int(round(0.018 * w)))
    off2 = max(1, int(round(0.03 * w)))
    smear_shifts = [(off0, 0.18 * I), (off1, 0.12 * I), (off2, 0.08 * I)]

    im_q = Image.fromarray(q.astype(np.uint8), "RGB")
    smear = im_q.copy()
    for offset, alpha in smear_shifts:
        shifted = ImageChops.offset(im_q, offset, 0)
        smear = Image.blend(smear, shifted, alpha)

    # STAGE 9 — final per-pixel noise
    final = np.array(smear).astype(np.int16)
    noise_mag = int(round(12 * I))
    if noise_mag > 0:
        noise = rng.integers(-noise_mag, noise_mag + 1, size=(h, w, 1))
        final = np.clip(final + noise, 0, 255)

    # STAGE 10 — final band smear
    band_count = max(1, int(round(0.004 * h * I)))
    band_bh_choices = [
        max(3, int(round(0.006 * h))),
        max(4, int(round(0.01 * h))),
        max(6, int(round(0.018 * h))),
    ]
    band_shift_mag = max(1, int(round(0.05 * w * I)))
    for _ in range(band_count):
        y0 = int(rng.integers(0, max(1, h - band_bh_choices[0])))
        bh = int(rng.choice(band_bh_choices))
        shift = int(rng.integers(-band_shift_mag, band_shift_mag + 1))
        band = np.roll(final[y0 : y0 + bh], shift, axis=1)
        final[y0 : y0 + bh] = np.clip(0.85 * final[y0 : y0 + bh] + 0.15 * band, 0, 255)

    # STAGE 11 — final posterize
    step = max(1, int(round(6 + 8 * (1 - I))))
    final = (np.round(final / step) * step).clip(0, 255).astype(np.uint8)

    out = Image.fromarray(final, "RGB")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(output_path)

    return output_path
