import test from 'node:test';
import assert from 'node:assert/strict';
import {
  artMask,
  trimMask,
  glyphMask,
  KEEP_RATIO,
  matchTemplate,
  numberVisible,
  registeredDigits,
  runeMarks,
  type Pixels,
} from '@/features/hunting/live/detectors/template';
import { COOLDOWN_MS, initialAppear, observeAppear } from '@/features/hunting/live/detectors/state';
import {
  findDecimal,
  initialCountdown,
  parseSeconds,
  track,
  type Seen,
} from '@/features/hunting/live/detectors/countdown';

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
  assert.ok(withSeconds.score >= 0.9, `seconds digit covers the icon (${withSeconds.score})`);
  const gone = matchTemplate(bar(null), template, KEEP_RATIO);
  assert.ok(gone.score < 0.85, `no buff scores low (${gone.score})`);
});

test('buff digits ignore the icon art and tell white minutes from yellow seconds', () => {
  const template = icon(...minutes);
  const registered = registeredDigits(template, NUMBER_BOX);
  assert.ok(registered >= 20, `white digits with outline are counted (${registered})`);
  const mask = artMask(template, NUMBER_BOX);
  const glyph = (variant: Pixels) => glyphMask(bar(variant), { x: 30, y: 3, w: 24, h: 24 }, mask);
  const white = glyph(icon(...minutes));
  assert.equal(numberVisible(white.total, registered), true);
  assert.equal(white.yellow, false, 'minutes are white');
  const yellow = glyph(icon(...seconds));
  assert.equal(numberVisible(yellow.total, registered), true);
  assert.equal(yellow.yellow, true, 'seconds are yellow');
  assert.equal(
    glyph(icon()).total,
    0,
    'the white star in the art and the bright edge are not digits',
  );
});

test('the digit mask fills whole strokes, not just their outlines', () => {
  // 테두리가 있는 3px 두께 흰 획: 가운데 픽셀도 글자로 채워져야 Tesseract가 읽기 좋다.
  const digit = image(12, 12, () => [40, 60, 90], rect(2, 2, 9, 9, BLACK), rect(3, 3, 8, 8, WHITE));
  const glyph = glyphMask(digit, { x: 0, y: 0, w: 12, h: 12 });
  assert.equal(glyph.total, 36);
  assert.equal(glyph.mask[5 * 12 + 5], 1, 'stroke centre is filled');
  // 테두리 없는 밝은 그림은 글자가 아니다.
  const plain = image(12, 12, () => [40, 60, 90], rect(3, 3, 8, 8, WHITE));
  assert.equal(glyphMask(plain, { x: 0, y: 0, w: 12, h: 12 }).total, 0);
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

test('remaining time text becomes seconds only in the shape each timer shows', () => {
  // 야누스 "m:ss"
  assert.equal(parseSeconds('1:11', 'clock'), 71);
  assert.equal(parseSeconds(' 0:09\n', 'clock'), 9);
  for (const misread of ['410', '.4', '1.1', '18', '1:75', '1:1:1', ''])
    assert.equal(parseSeconds(misread, 'clock'), null, misread);
  // 부스터 "ss.ss"
  assert.equal(parseSeconds('53.73', 'decimal'), 53.73);
  assert.equal(parseSeconds('1:05', 'decimal'), 65);
  assert.equal(parseSeconds('5373', 'decimal'), null);
  assert.equal(parseSeconds('0.4', 'decimal'), null);
  // 버프 초 "45"(1~59)
  assert.equal(parseSeconds('45', 'seconds'), 45);
  assert.equal(parseSeconds('60', 'seconds'), null);
  assert.equal(parseSeconds('0:45', 'seconds'), null);
});

/** 0.5초마다 프레임을 넣고 알림이 난 시각(초)을 모은다. */
function simulate(frames: (t: number) => Seen, until: number) {
  let state = initialCountdown;
  const alerts: number[] = [];
  for (let ms = 0; ms <= until * 1000; ms += 500) {
    const result = track(state, frames(ms / 1000), ms);
    state = result.state;
    if (result.alert) alerts.push(ms / 1000);
  }
  return alerts;
}
// 1초마다 읽는 야누스 시계. 다시 쓰면 start가 바뀐다.
const janus =
  (duration: number, starts: number[], misread?: (t: number) => number | null) =>
  (t: number): Seen => {
    const start = Math.max(...starts.filter((s) => s <= t));
    const left = duration - (t - start);
    if (left <= 0) return { icon: false };
    const reading = Number.isInteger(t) ? (misread?.(t) ?? Math.floor(left)) : undefined;
    return { icon: true, seconds: reading };
  };

test('timers alert once ten seconds before the end', () => {
  assert.deepEqual(simulate(janus(71, [0]), 90), [61]);
});

test('reusing before the end does not alert, and the next cycle alerts again', () => {
  // 40초에 다시 써서 71초로 늘어남 → 그때는 알리지 않고 40+61=101초에 알린다.
  assert.deepEqual(simulate(janus(71, [0, 40]), 130), [101]);
});

test('a single misread does not trigger the alert', () => {
  assert.deepEqual(
    simulate(
      janus(71, [0], (t) => (t === 20 ? 8 : null)),
      50,
    ),
    [],
  );
});

test('watching starts late: under 15 seconds left stays quiet', () => {
  assert.deepEqual(simulate(janus(12, [0]), 20), []);
});

/** 70초 남은 버프. 60초 넘게 남으면 흰 분 숫자, 그 아래는 노란 초 숫자, 5초 남으면 숫자가 사라진다. */
const buffFrames =
  (opts: { readable: boolean; yellowSeen: boolean; from?: number }) =>
  (t: number): Seen => {
    const left = 70 - (t + (opts.from ?? 0));
    if (left <= 0) return { icon: false };
    if (left > 60) return { icon: true, long: true, number: true };
    if (left <= 5) return { icon: true, long: false, number: false };
    return {
      icon: true,
      long: false,
      number: opts.yellowSeen,
      seconds: opts.readable && Number.isInteger(t) ? Math.floor(left) : undefined,
    };
  };

test('buffs alert ten seconds before the end, never at the one-minute switch', () => {
  // 노란 초 숫자를 읽을 수 있을 때
  assert.deepEqual(simulate(buffFrames({ readable: true, yellowSeen: true }), 80), [60]);
  // 실제 게임처럼 노란 초 숫자를 못 읽고 숫자로도 못 알아볼 때: 흰 분 숫자가 사라진 때를 59초로 잡는다.
  const alerts = simulate(buffFrames({ readable: false, yellowSeen: false }), 80);
  assert.equal(alerts.length, 1, 'one alert only');
  assert.ok(alerts[0] >= 59 && alerts[0] <= 61, `10 seconds left, not 60 (${alerts[0]})`);
});

test('when watching starts under a minute with an unreadable time, buffs stay quiet', () => {
  // 남은 시간을 모르면 엉뚱한 때 울리지 않도록 알리지 않는다(야누스와 같다).
  assert.deepEqual(simulate(buffFrames({ readable: false, yellowSeen: true, from: 30 }), 50), []);
  // 초 숫자를 읽을 수 있으면 10초 전에 알린다.
  assert.deepEqual(simulate(buffFrames({ readable: true, yellowSeen: true, from: 30 }), 50), [30]);
});

test('runes are purple diamonds on the minimap and alert when they appear', () => {
  // 미니맵 표시는 흰 테두리 → 어두운 줄 → 색 순서로 그려진다(빨간 점과 같은 모양).
  const mark = (x: number, y: number, fill: number[]): Paint[] => [
    rect(x - 2, y - 2, x + 6, y + 6, [225, 215, 230]),
    rect(x - 1, y - 1, x + 5, y + 5, [60, 20, 50]),
    rect(x, y, x + 4, y + 4, fill),
  ];
  const minimap = (rune: boolean) =>
    image(
      60,
      40,
      () => [70, 50, 90],
      // 맵 그림 속 보라색 수정(흰 테두리 없음, 주변은 푸른 회색)
      rect(2, 24, 9, 30, [110, 115, 155]),
      rect(3, 25, 8, 29, [175, 100, 215]),
      ...mark(12, 6, [60, 200, 60]),
      ...mark(22, 18, [240, 220, 40]),
      ...mark(44, 28, [230, 60, 120]),
      ...(rune ? mark(32, 8, [205, 95, 235]) : []),
    );
  assert.equal(
    runeMarks(minimap(false)).marks,
    0,
    'map art, portal, player and party marks are not runes',
  );
  assert.equal(runeMarks(minimap(true)).marks, 1);

  let state = initialAppear;
  const alerts: number[] = [];
  const frames = [false, true, true, true, false, false, false, false, false, true, true, true];
  frames.forEach((seen, i) => {
    const result = observeAppear(state, seen, i * 500);
    state = result.state;
    if (result.alert) alerts.push(i);
  });
  assert.deepEqual(alerts, [2], 'second appearance is inside the cooldown');
  assert.ok(COOLDOWN_MS >= 60000);
});

test('white digits over a yellow icon ring keep only the digits', () => {
  // 야누스처럼 아이콘 그림(노란 고리)이 숫자 테두리에 닿아 있어도 고리는 숫자가 아니다.
  const janus = image(
    20,
    14,
    () => [75, 111, 208],
    rect(0, 0, 19, 3, [224, 208, 112]),
    rect(4, 4, 15, 12, BLACK),
    rect(6, 6, 7, 10, WHITE),
    rect(11, 6, 13, 10, WHITE),
  );
  const glyph = glyphMask(janus, { x: 0, y: 0, w: 20, h: 14 });
  assert.equal(glyph.yellow, false);
  assert.equal(glyph.total, 10 + 15, 'two white strokes only');
});

test('the booster time is picked out of scattered text, damage numbers are ignored', () => {
  assert.equal(findDecimal('53.73'), 53.73);
  assert.equal(findDecimal('남은시간 53.73초'), 53.73);
  assert.equal(findDecimal('9.05 4'), 9.05);
  assert.equal(findDecimal('53.734'), 53.73, '"초" misread as a digit');
  // 작은 소수점이 빠지거나 그 자리에서 끊겨 읽혀도 받는다.
  assert.equal(findDecimal('5373'), 53.73);
  assert.equal(findDecimal('973'), 9.73);
  assert.equal(findDecimal('53 73'), 53.73);
  // 긴 데미지 숫자는 버린다(짧은 엉뚱한 값은 두 번 연속 맞아야 믿는 track()에서 걸러진다).
  assert.equal(findDecimal('3756885481 375688'), null);
  assert.equal(findDecimal('53.73 5116'), 53.73, 'a real decimal wins over a bare number');
  assert.equal(findDecimal(''), null);
});

test('a stray booster misread does not move the countdown', () => {
  // 1초마다 53, 52, …를 읽다가 한 번 데미지 숫자 "51.16"(5116)을 읽어도 추정은 그대로다.
  let state = initialCountdown;
  for (let t = 0; t <= 4; t++)
    state = track(state, { icon: true, seconds: 53 - t }, t * 1000).state;
  const stray = track(state, { icon: true, seconds: 11.6 }, 5000);
  assert.equal(stray.alert, false);
  assert.equal(Math.round(stray.remaining ?? 0), 48);
});

test('masks are trimmed to the text before reading', () => {
  const mask = new Uint8Array(6 * 4);
  mask[1 * 6 + 2] = 1;
  mask[2 * 6 + 4] = 1;
  assert.deepEqual(trimMask(mask, 6, 4), { mask: Uint8Array.from([1, 0, 0, 0, 0, 1]), w: 3, h: 2 });
  assert.equal(trimMask(new Uint8Array(4), 2, 2), null);
});

test('a cut-off first seconds digit (59 read as 9, 8, …) does not alert at one minute', () => {
  // 70초 남은 버프: 1분 아래로 바뀌면 두 자리 초 숫자의 앞자리가 잘려 끝자리만 읽힌다.
  const frames = (t: number): Seen => {
    const left = 70 - t;
    if (left <= 0) return { icon: false };
    if (left > 60) return { icon: true, long: true, number: true };
    const shown = Math.floor(left);
    return {
      icon: true,
      long: false,
      number: true,
      seconds: Number.isInteger(t) ? shown % 10 || null : undefined,
    };
  };
  const alerts = simulate(frames, 80);
  assert.equal(alerts.length, 1, 'one alert only');
  assert.ok(alerts[0] >= 59, `not at one minute (${alerts[0]})`);
});
