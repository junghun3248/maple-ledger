/** 캔버스 ImageData와 같은 모양. 테스트에서는 직접 만든다. */
export type Pixels = { width: number; height: number; data: Uint8ClampedArray };
export type Box = { x: number; y: number; w: number; h: number };

/**
 * 등록한 아이콘(template)이 영역(search) 안에서 가장 비슷한 위치를 찾는다.
 * 아이콘은 한 변에 12개 안팎의 표본 픽셀만 비교하고(큰 아이콘일수록 듬성듬성),
 * 지금까지의 최선보다 나빠지면 그 위치는 바로 멈춘다.
 * 점수는 그 위치에서 robustScore로 다시 계산한다.
 */
export function matchTemplate(search: Pixels, template: Pixels, keep = 1) {
  const { width: sw, height: sh, data: s } = search;
  const { width: tw, height: th, data: t } = template;
  if (tw < 1 || th < 1 || tw > sw || th > sh) return { score: 0, x: 0, y: 0 };
  const stride = Math.max(2, Math.round(Math.max(tw, th) / 12));
  const samples: number[] = [];
  for (let y = 0; y < th; y += stride)
    for (let x = 0; x < tw; x += stride) samples.push(y, x, (y * tw + x) * 4);
  let best = Infinity,
    bx = 0,
    by = 0;
  for (let y = 0; y <= sh - th; y++)
    for (let x = 0; x <= sw - tw; x++) {
      let sum = 0;
      for (let i = 0; i < samples.length && sum < best; i += 3) {
        const si = ((y + samples[i]) * sw + x + samples[i + 1]) * 4;
        const ti = samples[i + 2];
        sum +=
          Math.abs(s[si] - t[ti]) +
          Math.abs(s[si + 1] - t[ti + 1]) +
          Math.abs(s[si + 2] - t[ti + 2]);
      }
      if (sum < best) {
        best = sum;
        bx = x;
        by = y;
      }
    }
  return { score: robustScore(search, template, bx, by, keep), x: bx, y: by };
}

export const KEEP_RATIO = 0.6;

/**
 * 0~1 점수(1이 똑같음). 비슷한 픽셀부터 keep 비율만큼의 평균 차이로 계산한다.
 * 버프는 남은 시간 숫자가 아이콘 일부를 덮어도 알아보도록 가장 많이 다른 40%를 뺀다(KEEP_RATIO).
 * 어두운 칸(부스터 "남은시간")은 빼면 배경과 구분이 안 되므로 전부(1) 비교한다.
 */
export function robustScore(search: Pixels, template: Pixels, x: number, y: number, keepRatio = 1) {
  const { width: sw, data: s } = search;
  const { width: tw, height: th, data: t } = template;
  const diffs = new Array<number>(tw * th);
  for (let ty = 0; ty < th; ty++)
    for (let tx = 0; tx < tw; tx++) {
      const si = ((y + ty) * sw + x + tx) * 4;
      const ti = (ty * tw + tx) * 4;
      diffs[ty * tw + tx] =
        Math.abs(s[si] - t[ti]) + Math.abs(s[si + 1] - t[ti + 1]) + Math.abs(s[si + 2] - t[ti + 2]);
    }
  diffs.sort((a, b) => a - b);
  const keep = Math.max(1, Math.floor(diffs.length * keepRatio));
  let sum = 0;
  for (let i = 0; i < keep; i++) sum += diffs[i];
  return 1 - sum / (keep * 3 * 255);
}

/** 게임 숫자 색: 흰색(버프 분·야누스)과 노란~주황색(버프 초·부스터). 모두 검은 테두리가 있다. */
const white = (d: Uint8ClampedArray, i: number) => Math.min(d[i], d[i + 1], d[i + 2]) >= 195;
const yellowish = (d: Uint8ClampedArray, i: number) =>
  d[i] >= 200 && d[i + 1] >= 130 && d[i + 2] < 150;
const bright = (d: Uint8ClampedArray, i: number) => white(d, i) || yellowish(d, i);
/**
 * 작은 글자는 가장자리가 회색·연한 주황으로 번진다(안티에일리어싱). 글자 획을 채울 때는
 * 같은 계열의 덜 밝은 픽셀까지 넣어야 "0"이 "3"처럼 끊겨 보이지 않는다.
 */
const whiteSoft = (d: Uint8ClampedArray, i: number) => {
  const lo = Math.min(d[i], d[i + 1], d[i + 2]);
  return lo >= 130 && Math.max(d[i], d[i + 1], d[i + 2]) - lo <= 40;
};
const yellowSoft = (d: Uint8ClampedArray, i: number) =>
  d[i] >= 160 && d[i + 1] >= 100 && d[i + 2] < d[i] - 50;
const dark = (d: Uint8ClampedArray, i: number) => Math.max(d[i], d[i + 1], d[i + 2]) <= 80;

/** 밝은 글자색 픽셀 바로 옆(상하좌우)에 어두운 테두리가 있으면 글자 픽셀이다. */
export function textMask(
  pixels: Pixels,
  origin = { x: 0, y: 0 },
  w = pixels.width,
  h = pixels.height,
) {
  const { width, height, data } = pixels;
  const mask = new Uint8Array(w * h);
  // 아이콘 칸 바깥(배경)은 테두리로 보지 않는다. 아이콘 가장자리를 글자로 오해하지 않게 한다.
  const at = (x: number, y: number) =>
    x >= Math.max(0, origin.x) &&
    y >= Math.max(0, origin.y) &&
    x < Math.min(width, origin.x + w) &&
    y < Math.min(height, origin.y + h)
      ? (y * width + x) * 4
      : -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = origin.x + x;
      const py = origin.y + y;
      const i = at(px, py);
      if (i < 0 || !bright(data, i)) continue;
      const near = [at(px - 1, py), at(px + 1, py), at(px, py - 1), at(px, py + 1)];
      if (near.some((n) => n >= 0 && dark(data, n))) mask[y * w + x] = 1;
    }
  return mask;
}

/**
 * 아이콘 그림 자체의 글자처럼 보이는 픽셀. 등록한 아이콘에서 숫자 칸(number) 밖의 글자 픽셀이다.
 * glyphMask에서 빼면 분 숫자(아래)든 초 숫자(가운데)든 남은 시간 글자만 남는다.
 */
export function artMask(template: Pixels, number: Box) {
  const mask = textMask(template);
  for (let y = number.y; y < number.y + number.h; y++)
    for (let x = number.x; x < number.x + number.w; x++)
      if (x < template.width && y < template.height) mask[y * template.width + x] = 0;
  return mask;
}

/** 등록할 때 숫자 칸에서 센 글자 픽셀의 4분의 1 이상 보이면 숫자가 있다고 본다. */
export const numberVisible = (count: number, registered: number) =>
  count >= Math.max(4, Math.round(registered * 0.25));

/** 등록 화면용: 아이콘의 숫자 칸 안 글자 픽셀 수 */
export function registeredDigits(template: Pixels, number: Box) {
  const mask = textMask(template);
  let count = 0;
  for (let y = number.y; y < number.y + number.h; y++)
    for (let x = number.x; x < number.x + number.w; x++)
      if (x < template.width && y < template.height && mask[y * template.width + x]) count++;
  return count;
}

/**
 * 남은 시간 숫자 모양만 남긴 흑백 마스크. 테두리 옆 밝은 픽셀(textMask)에서 시작해
 * 이어진 밝은 픽셀까지 채운다. 테두리 없는 아이콘 그림의 밝은 부분은 들어오지 않는다.
 * 글자는 한 가지 색이므로 흰색·노란색 중 더 많은 쪽만 남긴다(테두리에 닿은 아이콘 그림 색을 뺀다).
 * art(같은 크기)가 있으면 그 픽셀은 뺀다. 노란 글자(버프의 초 숫자)인지도 알려 준다.
 */
/**
 * only: 'white'·'yellow'은 그 색 글자만, 'any'는 둘 다 남긴다(부스터 금색 숫자는 위는 흰색, 아래는 주황으로 번진다).
 */
export function glyphMask(
  pixels: Pixels,
  box: Box,
  art?: Uint8Array,
  only?: 'white' | 'yellow' | 'any',
) {
  const { width, height, data } = pixels;
  const { w, h } = box;
  const mask = textMask(pixels, box, w, h);
  if (art) for (let i = 0; i < mask.length; i++) if (art[i]) mask[i] = 0;
  const index = (i: number) => {
    const x = i % w;
    return ((box.y + (i - x) / w) * width + box.x + x) * 4;
  };
  let whites = 0;
  let yellows = 0;
  mask.forEach((v, i) => {
    if (!v) return;
    if (white(data, index(i))) whites++;
    else yellows++;
  });
  const any = only === 'any';
  const yellow = only && !any ? only === 'yellow' : yellows > whites;
  const same = (i: number) =>
    any ? bright(data, i) : yellow ? yellowish(data, i) : white(data, i);
  const near = (i: number) =>
    any
      ? whiteSoft(data, i) || yellowSoft(data, i)
      : yellow
        ? yellowSoft(data, i)
        : whiteSoft(data, i);
  mask.forEach((v, i) => {
    if (v && !same(index(i))) mask[i] = 0;
  });
  const queue: number[] = [];
  mask.forEach((v, i) => v && queue.push(i));
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      const px = box.x + nx;
      const py = box.y + ny;
      if (mask[j] || (art && art[j]) || px < 0 || py < 0 || px >= width || py >= height) continue;
      if (!near((py * width + px) * 4)) continue;
      mask[j] = 1;
      queue.push(j);
    }
  }
  let total = 0;
  mask.forEach((v) => {
    if (v) total++;
  });
  return { mask, w, h, total, yellow: total > 0 && yellow };
}

/** 글자 픽셀이 있는 부분만 남기도록 마스크를 잘라 낸다(넓은 칸을 읽을 때 빈 곳을 줄인다). */
export function trimMask(mask: Uint8Array, w: number, h: number) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  mask.forEach((v, i) => {
    if (!v) return;
    const x = i % w;
    const y = (i - x) / w;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  });
  if (x1 < 0) return null;
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const out = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) out[y * tw + x] = mask[(y + y0) * w + x + x0];
  return { mask: out, w: tw, h: th };
}

const purple = (d: Uint8ClampedArray, i: number) => {
  const r = d[i];
  const g = d[i + 1];
  const b = d[i + 2];
  return r >= 130 && b >= 160 && g <= Math.min(r, b) - 50 && b >= r * 0.75;
};
/** 미니맵 표시 테두리의 거의 흰색(빨간 점·룬 표시 모두 흰 테두리가 있다). 맵 그림의 보라색 옆은 푸른 회색이다. */
const rim = (d: Uint8ClampedArray, i: number) => {
  const lo = Math.min(d[i], d[i + 1], d[i + 2]);
  return lo >= 160 && Math.max(d[i], d[i + 1], d[i + 2]) - lo <= 70;
};

export const RUNE_PIXELS = 6;
export const RUNE_MAX = 30;
export const RIM_RATIO = 0.12;

/**
 * 미니맵의 룬 표시(보라색 마름모)를 센다. 보라색 덩어리마다 크기(6px 이상, 30×30 이하)와
 * 둘레 3px 안의 흰 테두리 비율을 본다. 테두리 없는 맵 그림 속 보라색은 룬으로 보지 않는다.
 */
export function runeMarks(pixels: Pixels) {
  const { width, height, data } = pixels;
  const seen = new Uint8Array(width * height);
  let marks = 0;
  let biggest = 0;
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !purple(data, start * 4)) continue;
    const queue = [start];
    seen[start] = 1;
    let count = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    while (queue.length) {
      const i = queue.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      count++;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        if (j < 0 || j >= width * height || seen[j]) continue;
        if (Math.abs((j % width) - x) > 1) continue;
        if (!purple(data, j * 4)) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (count < RUNE_PIXELS || w > RUNE_MAX || h > RUNE_MAX) continue;
    // 표시는 네모에 가까운 덩어리다(가로세로 비 1.8 이하, 상자의 30% 이상을 채움). 맵 그림 조각은 길쭉하거나 듬성하다.
    if (Math.max(w, h) > Math.min(w, h) * 1.8 || count < w * h * 0.3) continue;
    let ring = 0;
    let light = 0;
    for (let y = y0 - 3; y <= y1 + 3; y++)
      for (let x = x0 - 3; x <= x1 + 3; x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        ring++;
        if (rim(data, (y * width + x) * 4)) light++;
      }
    if (ring && light / ring >= RIM_RATIO) {
      marks++;
      biggest = Math.max(biggest, count);
    }
  }
  return { marks, biggest };
}

/** w×h 마스크의 좌우에 pad칸씩 빈 칸을 붙인다(넓힌 칸에 아이콘 그림 마스크를 맞출 때). */
export function padMask(mask: Uint8Array, w: number, h: number, pad: number) {
  const width = w + pad * 2;
  const out = new Uint8Array(width * h);
  for (let y = 0; y < h; y++) out.set(mask.subarray(y * w, y * w + w), y * width + pad);
  return out;
}
