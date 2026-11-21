import test from 'node:test';
import assert from 'node:assert/strict';
import {
  artMask,
  KEEP_RATIO,
  matchTemplate,
  numberPixels,
  numberVisible,
  registeredDigits,
  type Pixels,
} from '@/features/hunting/live/detectors/template';
import {
  COOLDOWN_MS,
  initialPresence,
  observe,
  type Presence,
  type WatchAlert,
  type WatchMode,
} from '@/features/hunting/live/detectors/state';

type Paint = (x: number, y: number) => number[] | null;
function image(width: number, height: number, ...layers: Paint[]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let color = [0, 0, 0];
      for (const layer of layers) color = layer(x, y) ?? color;
      data.set([...color, 255], (y * width + x) * 4);
    }
  return { width, height, data };
}
const rect =
  (x0: number, y0: number, x1: number, y1: number, color: number[]): Paint =>
  (x, y) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1 ? color : null;

const BLACK = [10, 10, 10];
const WHITE = [250, 250, 250];
const YELLOW = [255, 220, 20];
// 아이콘 그림: 파란 그라데이션 + 검은 테두리가 있는 흰 별(그림 속 글자처럼 보이는 부분)
const art: Paint[] = [
  (x, y) => [40 + x * 6, 90 + y * 4, 200 - x * 3],
  rect(2, 2, 7, 7, BLACK),
  rect(3, 3, 6, 6, WHITE),
  // 가장자리의 밝은 줄: 화면에서는 바깥 어두운 배경과 붙지만 글자가 아니다.
  rect(23, 0, 23, 23, [255, 230, 100]),
];
// 분 숫자 "30": 아래쪽 흰 글자, 초 숫자 "6": 가운데 노란 큰 글자
const minutes = [
  rect(9, 16, 22, 22, BLACK),
  rect(10, 17, 13, 21, WHITE),
  rect(16, 17, 21, 21, WHITE),
];
const seconds = [rect(8, 6, 16, 17, BLACK), rect(10, 8, 14, 15, YELLOW)];
const icon = (...text: Paint[]) => image(24, 24, ...art, ...text);
const NUMBER_BOX = { x: 9, y: 16, w: 14, h: 7 };

// 버프 줄: 다른 아이콘 두 개 뒤 (30, 3)에 등록한 버프
const bar = (buff: Pixels | null) =>
  image(60, 30, (x, y) => {
    if (x < 26) return [(x * 37) % 255, 60, (y * 23) % 255];
    if (!buff || x < 30 || y < 3 || x >= 54 || y >= 27) return [30, 30, 40];
    const i = ((y - 3) * 24 + (x - 30)) * 4;
    return [buff.data[i], buff.data[i + 1], buff.data[i + 2]];
  });

test('the buff icon is found while its number changes, and not when it is gone', () => {
  const template = icon(...minutes);
  const withMinutes = matchTemplate(bar(icon(...minutes)), template, KEEP_RATIO);
  assert.deepEqual([withMinutes.x, withMinutes.y, withMinutes.score], [30, 3, 1]);
  const withSeconds = matchTemplate(bar(icon(...seconds)), template, KEEP_RATIO);
  assert.deepEqual([withSeconds.x, withSeconds.y], [30, 3]);
  assert.ok(
    withSeconds.score >= 0.9,
    `seconds digit covers part of the icon (${withSeconds.score})`,
  );
  const gone = matchTemplate(bar(null), template, KEEP_RATIO);
  assert.ok(gone.score < 0.85, `no buff scores low (${gone.score})`);
});

test('number pixels ignore the icon art and follow minutes or seconds', () => {
  const template = icon(...minutes);
  const registered = registeredDigits(template, NUMBER_BOX);
  assert.ok(registered >= 20, `white digits with outline are counted (${registered})`);
  const mask = artMask(template, NUMBER_BOX);
  const count = (variant: Pixels) => numberPixels(bar(variant), { x: 30, y: 3 }, mask, 24, 24);
  assert.equal(numberVisible(count(icon(...minutes)), registered), true, 'minutes');
  assert.equal(numberVisible(count(icon(...seconds)), registered), true, 'yellow seconds');
  assert.equal(count(icon()), 0, 'the white star in the art is not a number');
  assert.equal(numberVisible(count(icon()), registered), false);
});

type Frame = { icon: boolean; number?: boolean };
function run(mode: WatchMode, frames: Frame[], step = 500) {
  let state: Presence = initialPresence;
  const alerts: [number, WatchAlert][] = [];
  frames.forEach((frame, i) => {
    const result = observe(
      state,
      frame,
      mode,
      i * step,
      frames.some((f) => f.number !== undefined),
    );
    state = result.state;
    if (result.alert) alerts.push([i, result.alert]);
  });
  return alerts;
}
const times = (n: number, frame: Frame) => Array.from({ length: n }, () => frame);

test('buffs alert once when the number disappears, and again after recasting', () => {
  const showing = { icon: true, number: true };
  const fiveLeft = { icon: true, number: false };
  const off = { icon: false };
  const frames = [
    ...times(4, showing),
    ...times(4, fiveLeft),
    ...times(6, off),
    ...times(4, showing),
    ...times(4, fiveLeft),
  ];
  assert.deepEqual(run('disappear', frames), [
    [6, 'soon'],
    [20, 'soon'],
  ]);
  // 숫자가 한 프레임만 안 읽혀도 울리지 않는다.
  assert.deepEqual(run('disappear', [...times(4, showing), fiveLeft, ...times(4, showing)]), []);
});

test('a buff that vanishes with its number still alerts once', () => {
  const frames = [...times(4, { icon: true, number: true }), ...times(6, { icon: false })];
  assert.deepEqual(run('disappear', frames), [[8, 'gone']]);
});

test('the booster timer alerts when it disappears for two seconds', () => {
  const frames = [
    ...times(4, { icon: true }),
    { icon: false },
    { icon: true },
    ...times(6, { icon: false }),
  ];
  assert.deepEqual(run('disappear', frames), [[10, 'gone']]);
});

test('runes alert when they appear, with a cooldown', () => {
  assert.deepEqual(run('appear', [{ icon: false }, { icon: true }, { icon: false }]), []);
  const flicker = [
    ...times(3, { icon: true }),
    ...times(6, { icon: false }),
    ...times(3, { icon: true }),
  ];
  assert.deepEqual(run('appear', flicker), [[1, 'appear']]);
  assert.deepEqual(run('appear', flicker, COOLDOWN_MS / 5), [
    [1, 'appear'],
    [10, 'appear'],
  ]);
});

test('a dark booster panel is not confused with a dark background', () => {
  // 어두운 칸 위의 흰 시계·글자(전체의 4분의 1)
  const panel = image(
    40,
    12,
    () => [17, 17, 17],
    rect(2, 2, 9, 9, WHITE),
    rect(14, 4, 37, 7, WHITE),
  );
  const scene = (shown: boolean) =>
    image(60, 20, (x, y) => {
      if (!shown || x < 10 || y < 4 || x >= 50 || y >= 16) return [34, 34, 51];
      const i = ((y - 4) * 40 + (x - 10)) * 4;
      return [panel.data[i], panel.data[i + 1], panel.data[i + 2]];
    });
  assert.equal(matchTemplate(scene(true), panel).score, 1);
  const gone = matchTemplate(scene(false), panel).score;
  assert.ok(gone < 0.85, `panel gone scores low (${gone})`);
  assert.ok(
    matchTemplate(scene(false), panel, KEEP_RATIO).score > 0.9,
    'trimming would hide the difference, so the booster compares every pixel',
  );
});
