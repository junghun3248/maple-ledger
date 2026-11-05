import portraits from './portraits.json' with { type: 'json' };
export interface Portrait {
  name: string;
  x: number;
  y: number;
  width: number;
  error: number;
}
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}
// Integral RGB sums make the search independent of screenshot column order and scale.
export async function findPortraits(image: Pixels, progress: (n: number) => void = () => {}) {
  const { width: w, height: h, data } = image,
    stride = w + 1;
  const sums = new Float64Array((w + 1) * (h + 1) * 3);
  for (let y = 1; y <= h; y++) {
    const row = [0, 0, 0];
    for (let x = 1; x <= w; x++)
      for (let c = 0; c < 3; c++) {
        row[c] += data[((y - 1) * w + x - 1) * 4 + c];
        sums[(y * stride + x) * 3 + c] = sums[((y - 1) * stride + x) * 3 + c] + row[c];
      }
  }
  function descriptor(x: number, y: number, size: number) {
    const out: number[] = [],
      height = size * 0.75;
    for (let j = 0; j < 6; j++)
      for (let i = 0; i < 6; i++) {
        const x0 = Math.round(x + (i * size) / 6),
          x1 = Math.round(x + ((i + 1) * size) / 6);
        const y0 = Math.round(y + (j * height) / 6),
          y1 = Math.round(y + ((j + 1) * height) / 6);
        for (let c = 0; c < 3; c++)
          out.push(
            (sums[(y1 * stride + x1) * 3 + c] -
              sums[(y0 * stride + x1) * 3 + c] -
              sums[(y1 * stride + x0) * 3 + c] +
              sums[(y0 * stride + x0) * 3 + c]) /
              ((x1 - x0) * (y1 - y0)),
          );
      }
    return out;
  }
  const error = (a: number[], b: number[]) =>
    a.reduce((sum, n, i) => sum + Math.abs(n - b[i]), 0) / a.length;
  const candidates: Portrait[] = [];
  for (let size = 24; size <= Math.min(180, w / 1.25, h / 3); size *= 1.13) {
    const step = Math.max(3, Math.round(size / 8));
    for (let y = 0; y + size * 0.75 < h; y += step)
      for (let x = 0; x + size < w; x += step) {
        const d = descriptor(x, y, size);
        for (const ref of portraits) {
          const score = error(d, ref.pixels);
          if (score < 32) candidates.push({ name: ref.name, x, y, width: size, error: score });
        }
      }
    progress(size);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const found: Portrait[] = [];
  for (const candidate of candidates.sort((a, b) => a.error - b.error)) {
    if (
      found.some(
        (p) =>
          Math.abs(p.x - candidate.x) < p.width * 0.95 &&
          Math.abs(p.y - candidate.y) < p.width * 0.95,
      )
    )
      continue;
    let best = candidate;
    const ref = portraits.find((p) => p.name === candidate.name)!;
    const delta = Math.ceil(candidate.width / 8);
    for (
      let size = candidate.width * 0.9;
      size <= candidate.width * 1.1;
      size += Math.max(1, candidate.width * 0.03)
    ) {
      for (let y = candidate.y - delta; y <= candidate.y + delta; y += 2)
        for (let x = candidate.x - delta; x <= candidate.x + delta; x += 2) {
          if (x < 0 || y < 0 || x + size > w || y + size * 0.75 > h) continue;
          const score = error(descriptor(x, y, size), ref.pixels);
          if (score < best.error) best = { name: ref.name, x, y, width: size, error: score };
        }
    }
    if (best.error < 18) found.push(best);
    if (found.length >= 80) break;
  }
  return found.sort((a, b) =>
    Math.abs(a.y - b.y) < Math.min(a.width, b.width) * 0.5 ? a.x - b.x : a.y - b.y,
  );
}
