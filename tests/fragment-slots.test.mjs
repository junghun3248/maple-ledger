import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findFragment } from '../features/hunting/ocr/field-detector.js';
const template = JSON.parse(
  readFileSync(new URL('../public/fragment-template.json', import.meta.url), 'utf8'),
);
test('original detector reads the left fragment slot instead of a second stack elsewhere', () => {
  const w = 500,
    h = 250,
    data = new Uint8ClampedArray(w * h * 4).fill(210);
  const meso = { y: 240, coin: { x: 30, w: 12 } };
  assert.equal(findFragment(data, w, h, template, meso), null);
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
  const field = findFragment(data, w, h, template, meso);
  assert.ok(field);
  assert.ok(Math.abs(field.x - 30) < 4);
});
