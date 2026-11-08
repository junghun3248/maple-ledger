import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findFragments } from '../features/hunting/ocr/field-detector.js';
const template = JSON.parse(
  readFileSync(new URL('../public/fragment-template.json', import.meta.url), 'utf8'),
);
test('two separated fragment icons return two fields without duplicate scale matches', () => {
  const w = 500,
    h = 250,
    data = new Uint8ClampedArray(w * h * 4).fill(210);
  for (const [x, y] of [
    [30, 40],
    [300, 130],
  ])
    for (const [dx, dy, r, g, b] of template) {
      const i = ((y + dy) * w + x + dx) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  const results = findFragments(data, w, h, template, { y: 240, coin: { x: 30, w: 12 } });
  assert.equal(results.length, 2);
  assert.ok(Math.abs(results[0].x - 30) < 4);
  assert.ok(Math.abs(results[1].x - 300) < 4);
});
