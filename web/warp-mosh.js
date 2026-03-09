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

function quantizeBlockMix(data, width, height, block = 8) {
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
          data[i] = clampByte(Math.round((0.55 * data[i] + 0.45 * mr) / 16) * 16);
          data[i + 1] = clampByte(Math.round((0.55 * data[i + 1] + 0.45 * mg) / 16) * 16);
          data[i + 2] = clampByte(Math.round((0.55 * data[i + 2] + 0.45 * mb) / 16) * 16);
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

export function warpMoshImageData(imageData, { seed = 42 } = {}) {
  const { width, height, data } = imageData;
  const rand = createMulberry32(seed);

  const arr = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    arr[j] = data[i];
    arr[j + 1] = data[i + 1];
    arr[j + 2] = data[i + 2];
  }

  const warped = new Uint8Array(arr.length);
  for (let y = 0; y < height; y++) {
    const dx = Math.trunc(
      28 * Math.sin((2 * Math.PI * y) / 97 + 0.7) +
        14 * Math.sin((2 * Math.PI * y) / 37 + 2.2) +
        6 * Math.sin((2 * Math.PI * y) / 13 + 1.1)
    );
    rollRow(arr, warped, width, y, dx);
  }

  const temp = new Uint8Array(warped);
  for (let x = 0; x < width; x++) {
    const dy = Math.trunc(10 * Math.sin((2 * Math.PI * x) / 131 + 1.9) + 5 * Math.sin((2 * Math.PI * x) / 41 + 0.3));
    rollColumn(temp, warped, width, height, x, dy);
  }

  const moshed = new Uint8Array(warped);
  const blockHChoices = [8, 12, 16, 24, 32, 48];
  for (let i = 0; i < 180; i++) {
    const bh = pick(rand, blockHChoices);
    const y0 = randint(rand, 0, Math.max(0, height - bh));
    const shift = randint(rand, -120, 120);
    for (let y = y0; y < Math.min(height, y0 + bh); y++) {
      const row = new Uint8Array(width * 3);
      rollRow(moshed, row, width, y, shift);
      moshed.set(row, y * width * 3);
    }
  }

  for (let i = 0; i < 80; i++) {
    const bw = pick(rand, [4, 6, 8, 12, 16, 24]);
    const x0 = randint(rand, 0, Math.max(0, width - bw));
    const shift = randint(rand, -60, 60);
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

  const glitch = new Uint8Array(moshed.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const xr = (x - 9 + width) % width;
      const yg = (y + 6) % height;
      const xb = (x + 18) % width;
      glitch[i] = moshed[(y * width + xr) * 3];
      glitch[i + 1] = moshed[(yg * width + x) * 3 + 1];
      glitch[i + 2] = moshed[(y * width + xb) * 3 + 2];
    }
  }

  for (let i = 0; i < 130; i++) {
    const y0 = randint(rand, 0, height - 1);
    const t = pick(rand, [1, 2, 3, 4, 6]);
    const val = randint(rand, -50, 70);
    for (let y = y0; y < Math.min(height, y0 + t); y++) {
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 3;
        glitch[p] = clampByte(glitch[p] + val);
        glitch[p + 1] = clampByte(glitch[p + 1] + val);
        glitch[p + 2] = clampByte(glitch[p + 2] + val);
      }
    }
  }

  for (let i = 0; i < 55; i++) {
    const x0 = randint(rand, 0, width - 1);
    const bw = pick(rand, [1, 2, 3, 4, 5, 8]);
    const mult = 0.55 + rand() * (1.45 - 0.55);
    for (let x = x0; x < Math.min(width, x0 + bw); x++) {
      for (let y = 0; y < height; y++) {
        const p = (y * width + x) * 3;
        glitch[p] = clampByte(glitch[p] * mult);
        glitch[p + 1] = clampByte(glitch[p + 1] * mult);
        glitch[p + 2] = clampByte(glitch[p + 2] * mult);
      }
    }
  }

  quantizeBlockMix(glitch, width, height, 8);
  let final3 = horizontalBlendShift(glitch, width, height, [
    [18, 0.18],
    [-27, 0.12],
    [43, 0.08],
  ]);

  for (let i = 0; i < final3.length; i += 3) {
    const n = randint(rand, -12, 12);
    final3[i] = clampByte(final3[i] + n);
    final3[i + 1] = clampByte(final3[i + 1] + n);
    final3[i + 2] = clampByte(final3[i + 2] + n);
  }

  for (let i = 0; i < 24; i++) {
    const y0 = randint(rand, 0, Math.max(0, height - 10));
    const bh = pick(rand, [6, 8, 12, 18, 24]);
    const shift = randint(rand, -180, 180);
    for (let y = y0; y < Math.min(height, y0 + bh); y++) {
      for (let x = 0; x < width; x++) {
        const sx = (x - (shift % width) + width) % width;
        const p = (y * width + x) * 3;
        const s = (y * width + sx) * 3;
        final3[p] = clampByte(0.7 * final3[p] + 0.3 * final3[s]);
        final3[p + 1] = clampByte(0.7 * final3[p + 1] + 0.3 * final3[s + 1]);
        final3[p + 2] = clampByte(0.7 * final3[p + 2] + 0.3 * final3[s + 2]);
      }
    }
  }

  for (let i = 0; i < final3.length; i++) {
    final3[i] = clampByte(Math.round(final3[i] / 20) * 20);
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
