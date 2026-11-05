import signatures from './badges.json' with { type: 'json' };
import type { Pixels, Portrait } from './detect';
export function badgeFeatures(image: Pixels, p: Portrait) {
  const out: number[] = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 12; i++) {
      const x0 = Math.floor(p.x + p.width * (0.23 + (i * 0.85) / 12)),
        x1 = Math.max(x0 + 1, Math.floor(p.x + p.width * (0.23 + ((i + 1) * 0.85) / 12)));
      const y0 = Math.floor(p.y + p.width * (0.86 + (j * 0.25) / 3)),
        y1 = Math.max(y0 + 1, Math.floor(p.y + p.width * (0.86 + ((j + 1) * 0.25) / 3)));
      if (x0 < 0 || y0 < 0 || x1 > image.width || y1 > image.height) return [];
      const rgb = [0, 0, 0];
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++)
          for (let c = 0; c < 3; c++) rgb[c] += image.data[(y * image.width + x) * 4 + c];
      out.push(...rgb.map((v) => Math.round(v / ((x1 - x0) * (y1 - y0)))));
    }
  return out;
}
export function matchBadge(image: Pixels, p: Portrait) {
  const values = badgeFeatures(image, p);
  if (!values.length) return '';
  const scores = new Map<string, number>();
  for (const ref of signatures as { label: string; values: number[] }[]) {
    const score = values.reduce((s, v, i) => s + Math.abs(v - ref.values[i]), 0) / values.length;
    scores.set(ref.label, Math.min(scores.get(ref.label) ?? Infinity, score));
  }
  const sorted = [...scores].sort((a, b) => a[1] - b[1]);
  return sorted[0] && sorted[0][1] < 24 && (sorted[1]?.[1] ?? Infinity) - sorted[0][1] > 4
    ? sorted[0][0]
    : '';
}
