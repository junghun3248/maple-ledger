import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bottomStrip,
  changedPixels,
  CHANGED_MIN,
  findExpText,
  IDLE_MS,
  IDLE_REPEAT_MS,
  initialIdle,
  trackIdle,
} from '@/features/hunting/live/detectors/exp';
import type { Pixels } from '@/features/hunting/live/detectors/template';

type Paint = (x: number, y: number) => number[] | null;
function image(width: number, height: number, ...layers: Paint[]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let color = [40, 40, 50];
      for (const layer of layers) color = layer(x, y) ?? color;
      data.set([...color, 255], (y * width + x) * 4);
    }
  return { width, height, data };
}
const rect =
  (x0: number, y0: number, x1: number, y1: number, color: number[]): Paint =>
  (x, y) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1 ? color : null;
/** 가운데에 흰 숫자 같은 무늬(세로 획을 2px 간격으로) */
const digits =
  (x0: number, x1: number, y0: number, y1: number): Paint =>
  (x, y) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1 && x % 3 === 0 ? [255, 255, 253] : null;

// 600×120 화면 아래 띠: 위쪽 HP 바 숫자, 맨 아래 노란 경험치 바와 숫자, 왼쪽은 채팅창이 가림
const scene = (expText: Paint) =>
  image(
    600,
    120,
    rect(200, 40, 400, 52, [200, 40, 80]),
    digits(260, 340, 42, 50),
    rect(0, 108, 480, 116, [230, 230, 20]),
    rect(0, 95, 180, 119, [20, 20, 30]),
    expText,
  );

test('the exp text is the lowest white text band at the bottom centre', () => {
  const box = findExpText(scene(digits(250, 350, 109, 115)));
  assert.ok(box, 'found');
  assert.ok(box.y >= 100, `exp bar, not the HP numbers (y=${box.y})`);
  assert.ok(box.x <= 250 && box.x + box.w >= 350, 'covers the digits with room to grow');
  assert.equal(findExpText(image(600, 120)), null, 'no text, no bar');
});

test('the strip covers the bottom quarter of the screen within limits', () => {
  assert.deepEqual(bottomStrip(1366, 768), { x: 0, y: 576, w: 1366, h: 192 });
  assert.deepEqual(bottomStrip(1920, 1080), { x: 0, y: 880, w: 1920, h: 200 });
  assert.equal(bottomStrip(800, 100).h, 60);
});

test('only real digit changes count as a change', () => {
  const a = scene(digits(250, 350, 109, 115));
  const b = scene(digits(250, 353, 109, 115));
  assert.equal(changedPixels(a.data, a.data), 0);
  assert.ok(changedPixels(a.data, b.data) >= CHANGED_MIN);
});

test('stuck exp alerts after ten seconds while hunting, then every thirty', () => {
  let state = initialIdle(0);
  const alerts: number[] = [];
  for (let t = 500; t <= 60_000; t += 500) {
    const r = trackIdle(state, false, true, t);
    state = r.state;
    if (r.alert) alerts.push(t);
  }
  assert.deepEqual(alerts, [IDLE_MS, IDLE_MS + IDLE_REPEAT_MS]);
  // 숫자가 오르면 다시 센다.
  const moved = trackIdle(state, true, true, 61_000).state;
  assert.equal(trackIdle(moved, false, true, 61_000 + IDLE_MS - 1).alert, false);
  assert.equal(trackIdle(moved, false, true, 61_000 + IDLE_MS).alert, true);
  // 재획 중이 아니거나 바를 못 찾으면 알리지 않는다.
  assert.equal(trackIdle(initialIdle(0), false, false, 20_000).alert, false);
  assert.equal(trackIdle(initialIdle(0), null, true, 20_000).alert, false);
});
