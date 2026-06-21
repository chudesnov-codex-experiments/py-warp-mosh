function createMulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randint(rand, min, maxInclusive) {
  return Math.floor(rand() * (maxInclusive - min + 1)) + min;
}

function pick(rand, values) {
  return values[Math.floor(rand() * values.length)];
}

function clampByte(v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

function rollRow(src, dst, width, row, shift) {
  const rowStart = row * width * 3;
  const w3 = width * 3;
  const wrappedShift = ((shift % width) + width) % width;
  for (let x = 0; x < width; x++) {
    const srcX = (x - wrappedShift + width) % width;
    const di = rowStart + x * 3;
    const si = rowStart + srcX * 3;
    dst[di] = src[si];
    dst[di + 1] = src[si + 1];
    dst[di + 2] = src[si + 2];
  }
  return w3;
}

function rollColumn(src, dst, width, height, col, shift) {
  const wrappedShift = ((shift % height) + height) % height;
  for (let y = 0; y < height; y++) {
    const srcY = (y - wrappedShift + height) % height;
    const di = (y * width + col) * 3;
    const si = (srcY * width + col) * 3;
    dst[di] = src[si];
    dst[di + 1] = src[si + 1];
    dst[di + 2] = src[si + 2];
  }
}

function quantizeBlockMix(data, width, height, block) {
  for (let y0 = 0; y0 < height; y0 += block) {
    for (let x0 = 0; x0 < width; x0 += block) {
      const y1 = Math.min(y0 + block, height);
      const x1 = Math.min(x0 + block, width);
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 3;
          sr += data[i];
          sg += data[i + 1];
          sb += data[i + 2];
          n += 1;
        }
      }
      const mr = sr / n;
      const mg = sg / n;
      const mb = sb / n;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 3;
          data[i] = clampByte(Math.round((0.85 * data[i] + 0.15 * mr) / 8) * 8);
          data[i + 1] = clampByte(Math.round((0.85 * data[i + 1] + 0.15 * mg) / 8) * 8);
          data[i + 2] = clampByte(Math.round((0.85 * data[i + 2] + 0.15 * mb) / 8) * 8);
        }
      }
    }
  }
}

function horizontalBlendShift(base, width, height, shifts) {
  const out = new Uint8Array(base);
  for (const [offset, alpha] of shifts) {
    const shifted = new Uint8Array(out.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = (x - offset % width + width) % width;
        const di = (y * width + x) * 3;
        const si = (y * width + sx) * 3;
        shifted[di] = base[si];
        shifted[di + 1] = base[si + 1];
        shifted[di + 2] = base[si + 2];
      }
    }
    for (let i = 0; i < out.length; i++) {
      out[i] = clampByte((1 - alpha) * out[i] + alpha * shifted[i]);
    }
  }
  return out;
}

export function warpMoshImageData(imageData, { seed = 42, intensity = 0.5 } = {}) {
  const { width, height, data } = imageData;
  const rand = createMulberry32(seed);

  const I = Math.min(1.0, Math.max(0.0, intensity));

  // Intensity 0 means "no effect": return the image unchanged.
  if (I <= 0) {
    return new ImageData(new Uint8ClampedArray(data), width, height);
  }

  const D = Math.min(width, height);

  const arr = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    arr[j] = data[i];
    arr[j + 1] = data[i + 1];
    arr[j + 2] = data[i + 2];
  }

  // STAGE 1 — sinusoidal warp
  const ax = Math.max(2, Math.round(0.018 * width * I));
  const ay = Math.max(1, Math.round(0.012 * height * I));

  const warped = new Uint8Array(arr.length);
  for (let y = 0; y < height; y++) {
    const dx = Math.trunc(
      ax * Math.sin((2 * Math.PI * y) / 97 + 0.7) +
        0.5 * ax * Math.sin((2 * Math.PI * y) / 37 + 2.2) +
        0.25 * ax * Math.sin((2 * Math.PI * y) / 13 + 1.1)
    );
    rollRow(arr, warped, width, y, dx);
  }

  const temp = new Uint8Array(warped);
  for (let x = 0; x < width; x++) {
    const dy = Math.trunc(
      ay * Math.sin((2 * Math.PI * x) / 131 + 1.9) +
        0.5 * ay * Math.sin((2 * Math.PI * x) / 41 + 0.3)
    );
    rollColumn(temp, warped, width, height, x, dy);
  }

  // STAGE 2 — row-mosh bands
  const moshed = new Uint8Array(warped);
  const rowCount = Math.max(1, Math.round(0.03 * height * I));
  const blockHChoices = [
    Math.max(2, Math.round(0.004 * height)),
    Math.max(2, Math.round(0.008 * height)),
    Math.max(2, Math.round(0.015 * height)),
    Math.max(3, Math.round(0.025 * height)),
  ];
  const rowShiftMag = Math.max(1, Math.round(0.03 * width * I));
  for (let i = 0; i < rowCount; i++) {
    const bh = pick(rand, blockHChoices);
    const y0 = randint(rand, 0, Math.max(0, height - bh));
    const shift = randint(rand, -rowShiftMag, rowShiftMag);
    for (let y = y0; y < Math.min(height, y0 + bh); y++) {
      const row = new Uint8Array(width * 3);
      rollRow(moshed, row, width, y, shift);
      moshed.set(row, y * width * 3);
    }
  }

  // STAGE 3 — column-mosh bands
  const colCount = Math.max(1, Math.round(0.015 * width * I));
  const blockWChoices = [
    Math.max(2, Math.round(0.003 * width)),
    Math.max(2, Math.round(0.006 * width)),
    Math.max(3, Math.round(0.012 * width)),
    Math.max(3, Math.round(0.02 * width)),
  ];
  const colShiftMag = Math.max(1, Math.round(0.02 * height * I));
  for (let i = 0; i < colCount; i++) {
    const bw = pick(rand, blockWChoices);
    const x0 = randint(rand, 0, Math.max(0, width - bw));
    const shift = randint(rand, -colShiftMag, colShiftMag);
    for (let x = x0; x < Math.min(width, x0 + bw); x++) {
      const col = new Uint8Array(height * 3);
      for (let y = 0; y < height; y++) {
        const i0 = (y * width + x) * 3;
        col[y * 3] = moshed[i0];
        col[y * 3 + 1] = moshed[i0 + 1];
        col[y * 3 + 2] = moshed[i0 + 2];
      }
      for (let y = 0; y < height; y++) {
        const sy = (y - (shift % height) + height) % height;
        const di = (y * width + x) * 3;
        const si = sy * 3;
        moshed[di] = col[si];
        moshed[di + 1] = col[si + 1];
        moshed[di + 2] = col[si + 2];
      }
    }
  }

  // STAGE 4 — RGB channel split
  const rOff = Math.max(1, Math.round(0.005 * width * I));
  const gOff = Math.max(1, Math.round(0.004 * height * I));
  const bOff = Math.max(1, Math.round(0.01 * width * I));

  const glitch = new Uint8Array(moshed.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const xr = (x - rOff + width) % width;
      const yg = (y + gOff) % height;
      const xb = (x + bOff) % width;
      glitch[i] = moshed[(y * width + xr) * 3];
      glitch[i + 1] = moshed[(yg * width + x) * 3 + 1];
      glitch[i + 2] = moshed[(y * width + xb) * 3 + 2];
    }
  }

  // STAGE 5 — brightness streaks
  const streakCount = Math.max(1, Math.round(0.02 * height * I));
  const streakThicknessChoices = [
    1,
    Math.max(1, Math.round(0.002 * height)),
    Math.max(2, Math.round(0.004 * height)),
  ];
  const streakValMag = Math.round(50 * I);
  for (let i = 0; i < streakCount; i++) {
    const y0 = randint(rand, 0, height - 1);
    const t = pick(rand, streakThicknessChoices);
    const val = streakValMag > 0 ? randint(rand, -streakValMag, streakValMag) : 0;
    for (let y = y0; y < Math.min(height, y0 + t); y++) {
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 3;
        glitch[p] = clampByte(glitch[p] + val);
        glitch[p + 1] = clampByte(glitch[p + 1] + val);
        glitch[p + 2] = clampByte(glitch[p + 2] + val);
      }
    }
  }

  // STAGE 6 — darken/brighten columns
  const colBrightCount = Math.max(1, Math.round(0.008 * width * I));
  const colBrightWChoices = [
    1,
    Math.max(1, Math.round(0.002 * width)),
    Math.max(2, Math.round(0.004 * width)),
  ];
  const multLo = 1 - 0.25 * I;
  const multHi = 1 + 0.25 * I;
  for (let i = 0; i < colBrightCount; i++) {
    const x0 = randint(rand, 0, width - 1);
    const bw = pick(rand, colBrightWChoices);
    const mult = multLo + rand() * (multHi - multLo);
    for (let x = x0; x < Math.min(width, x0 + bw); x++) {
      for (let y = 0; y < height; y++) {
        const p = (y * width + x) * 3;
        glitch[p] = clampByte(glitch[p] * mult);
        glitch[p + 1] = clampByte(glitch[p + 1] * mult);
        glitch[p + 2] = clampByte(glitch[p + 2] * mult);
      }
    }
  }

  // STAGE 7 — block quantize+mix
  const block = Math.max(4, Math.round(0.01 * D));
  quantizeBlockMix(glitch, width, height, block);

  // STAGE 8 — horizontal smear
  const smearOff0 = Math.max(1, Math.round(0.012 * width));
  const smearOff1 = -Math.max(1, Math.round(0.018 * width));
  const smearOff2 = Math.max(1, Math.round(0.03 * width));
  let final3 = horizontalBlendShift(glitch, width, height, [
    [smearOff0, 0.18 * I],
    [smearOff1, 0.12 * I],
    [smearOff2, 0.08 * I],
  ]);

  // STAGE 9 — final per-pixel noise
  const noiseMag = Math.round(12 * I);
  if (noiseMag > 0) {
    for (let i = 0; i < final3.length; i += 3) {
      const n = randint(rand, -noiseMag, noiseMag);
      final3[i] = clampByte(final3[i] + n);
      final3[i + 1] = clampByte(final3[i + 1] + n);
      final3[i + 2] = clampByte(final3[i + 2] + n);
    }
  }

  // STAGE 10 — final band smear
  const bandCount = Math.max(1, Math.round(0.004 * height * I));
  const bandBhChoices = [
    Math.max(3, Math.round(0.006 * height)),
    Math.max(4, Math.round(0.01 * height)),
    Math.max(6, Math.round(0.018 * height)),
  ];
  const bandShiftMag = Math.max(1, Math.round(0.05 * width * I));
  for (let i = 0; i < bandCount; i++) {
    const y0 = randint(rand, 0, Math.max(0, height - bandBhChoices[0]));
    const bh = pick(rand, bandBhChoices);
    const shift = randint(rand, -bandShiftMag, bandShiftMag);
    for (let y = y0; y < Math.min(height, y0 + bh); y++) {
      for (let x = 0; x < width; x++) {
        const sx = (x - (shift % width) + width) % width;
        const p = (y * width + x) * 3;
        const s = (y * width + sx) * 3;
        final3[p] = clampByte(0.85 * final3[p] + 0.15 * final3[s]);
        final3[p + 1] = clampByte(0.85 * final3[p + 1] + 0.15 * final3[s + 1]);
        final3[p + 2] = clampByte(0.85 * final3[p + 2] + 0.15 * final3[s + 2]);
      }
    }
  }

  // STAGE 11 — final posterize (coarser with higher intensity)
  const step = Math.max(1, Math.round(16 * I));
  for (let i = 0; i < final3.length; i++) {
    final3[i] = clampByte(Math.round(final3[i] / step) * step);
  }

  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < out.length; i += 4, j += 3) {
    out[i] = final3[j];
    out[i + 1] = final3[j + 1];
    out[i + 2] = final3[j + 2];
    out[i + 3] = data[i + 3] ?? 255;
  }

  return new ImageData(out, width, height);
}

export async function decodeFileToImageBitmap(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}
