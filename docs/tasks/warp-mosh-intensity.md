# Task: Warp-mosh too aggressive / not scale-independent

> Documented retroactively (задним числом). No Linear integration was available
> in the working environment, and GitHub Issues write was blocked (403), so this
> task record lives in-repo alongside the fix.

- **Date:** 2026-06-21
- **Branch:** `claude/blissful-cannon-efs8p7`
- **Status:** Implemented & committed locally; push blocked by environment git
  proxy (403, read-only git write access). Needs write access to land.

## Problem

The warp/datamosh effect destroyed most of the original image ("barely anything
left") and behaved inconsistently across image sizes (reported on the web
version).

## Root cause

`src/py_warp_mosh/core.py` and `web/warp-mosh.js` are line-for-line ports of the
same pipeline, and **every parameter was an absolute pixel/iteration count** —
nothing scaled with image dimensions:

- 180 row-mosh ops shifting bands by ±120px, 80 column ops at ±60px, 24 final
  band-smears at ±180px, 130 brightness streaks, 55 darkening columns.
- On small/medium images the ±N shifts wrap rows multiple times and op density
  saturates the frame → total destruction; on large images the same numbers are
  mild → inconsistent look "regardless of size."
- Two posterization passes (`round/16` block-mix, then `round/20` final) crush
  tone independent of size.

## Fix

Re-derive every displacement and operation count **proportionally** from image
dimensions (`W`, `H`, `D=min(W,H)`), gated by a single tunable `intensity`
factor (default `0.5` = gentle, subject clearly recognizable), and lighten the
two posterization passes.

- `core.py`: `WarpMoshConfig` gains `intensity: float = 0.5`; all 11 stages
  scaled by `W`/`H`/`D` and `I`.
- `web/warp-mosh.js`: matching scale-relative port, `intensity` option.
- `cli.py`: `--intensity` flag (default 0.5).
- `web/index.html`: intensity slider wired alongside the seed control.

## Verification

- `pytest tests/` → 5 passed (numpy present).
- `node --check web/warp-mosh.js` → OK.
- Visual: at intensity 0.5 the subject stays recognizable with edge tearing.
- Scale-independent: 180px render shows the same proportional glitch density as
  a 700px render.
- Tunable range confirmed across 0.25 / 0.5 / 0.85.

## Follow-ups

- Enable git write access so the branch can be pushed.
- Minor: at very low intensity / tiny images a magnitude can round to 0 and a
  stage skips an RNG draw, which could diverge JS vs Python sequences at the
  extreme low end. Harmless at default; normalize if exact cross-platform
  determinism at low intensity is required.
