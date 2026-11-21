import test from 'node:test';
import assert from 'node:assert/strict';
import { matchTemplate, type Pixels } from '@/features/hunting/live/detectors/template';
import {
  COOLDOWN_MS,
  initialPresence,
  observe,
  type Presence,
  type WatchMode,
} from '@/features/hunting/live/detectors/state';
import { prefillSchema, readLiveState } from '@/features/hunting/live/session';

function image(width: number, height: number, paint: (x: number, y: number) => number[]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  return { width, height, data };
}
// 어두운 미니맵 배경 위의 8×8 체크무늬 아이콘
const icon = image(8, 8, (x, y) => ((x + y) % 2 ? [240, 90, 200] : [40, 220, 255]));
const background = (x: number, y: number) => [20 + ((x * 7) % 30), 30, 40 + ((y * 5) % 20)];
const withIcon = (ix: number, iy: number) =>
  image(60, 40, (x, y) => {
    const inside = x >= ix && x < ix + 8 && y >= iy && y < iy + 8;
    if (!inside) return background(x, y);
    const i = ((y - iy) * 8 + (x - ix)) * 4;
    return [icon.data[i], icon.data[i + 1], icon.data[i + 2]];
  });

test('template matching finds the icon anywhere in the area', () => {
  const found = matchTemplate(withIcon(37, 21), icon);
  assert.equal(found.score, 1);
  assert.deepEqual([found.x, found.y], [37, 21]);
  const empty = matchTemplate(image(60, 40, background), icon);
  assert.ok(empty.score < 0.7, `no icon scores low (${empty.score})`);
  assert.equal(matchTemplate(icon, withIcon(0, 0)).score, 0, 'icon bigger than the area');
});

function run(mode: WatchMode, frames: boolean[], start = 0, step = 1000) {
  let state: Presence = initialPresence;
  const alerts: number[] = [];
  frames.forEach((matched, i) => {
    const now = start + i * step;
    const result = observe(state, matched, mode, now);
    state = result.state;
    if (result.alert) alerts.push(i);
  });
  return { state, alerts };
}

test('appear alerts need two matching frames and ignore single flickers', () => {
  assert.deepEqual(run('appear', [true, false, true, false]).alerts, []);
  assert.deepEqual(run('appear', [false, true, true, true]).alerts, [2]);
});

test('disappear alerts only after the icon was seen, then missed three times', () => {
  assert.deepEqual(run('disappear', [false, false, false, false]).alerts, [], 'never seen');
  assert.deepEqual(
    run('disappear', [true, true, false, false, true, false, false, false]).alerts,
    [7],
  );
});

test('the same alert waits for the cooldown', () => {
  // 1초 간격으로 나타남(2프레임) → 사라짐(3프레임) → 다시 나타남: 쿨다운 안이라 한 번만 울린다.
  const flicker = [true, true, false, false, false, true, true];
  assert.deepEqual(run('appear', flicker).alerts, [1]);
  assert.deepEqual(run('appear', flicker, 0, COOLDOWN_MS / 4).alerts, [1, 6]);
});

test('old saved state without watchers still loads, and readings flow into the prefill', () => {
  const old = { session: null, timers: [], sound: true, volume: 0.5 };
  const state = readLiveState(JSON.stringify(old));
  assert.deepEqual(state.watchers, []);
  assert.deepEqual(state.readings, {});
  assert.equal(
    prefillSchema.safeParse({ date: '2026-11-21', minutes: 60, bm: '12345' }).success,
    true,
  );
  assert.equal(
    prefillSchema.safeParse({ date: '2026-11-21', minutes: 60, bm: '1,234' }).success,
    false,
  );
});
