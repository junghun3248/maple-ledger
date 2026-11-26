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

/** 아이콘 위 남은 시간 글자로 볼 픽셀: 검은 테두리, 노란 글자, 흰 글자 */
const overlay = (d: Uint8ClampedArray, i: number) =>
  Math.max(d[i], d[i + 1], d[i + 2]) <= 80 ||
  (d[i] >= 170 && d[i + 1] >= 150 && d[i + 2] < 110 && d[i + 1] >= d[i] - 60) ||
  Math.min(d[i], d[i + 1], d[i + 2]) >= 215;

/**
 * 사이트에 넣어 둔 고정 아이콘(재물 획득의 비약, 룬 쿨타임)이 맞는지 보는 점수(0~1).
 * 남은 시간 글자(흰 분 "13", 노란 "4:44")는 늘 바뀌므로 어느 쪽이든 글자로 보이는 픽셀은 빼고,
 * 나머지 아이콘 그림 전체를 비교한다. 비교할 픽셀이 30%도 안 남으면 0.
 */
export function iconScore(search: Pixels, template: Pixels, x: number, y: number, step = 1) {
  const { width: sw, data: s } = search;
  const { width: tw, height: th, data: t } = template;
  // 버프 아이콘은 반투명이라 사냥터 배경에 따라 밝기·대비가 달라진다. 그래서 색 차이가 아니라
  // 채널별 정규화 상관(밝기·대비가 달라도 같은 그림이면 1)으로 비교한다.
  const n = [0, 0, 0];
  const st = [0, 0, 0];
  const ss = [0, 0, 0];
  const tt = [0, 0, 0];
  const sst = [0, 0, 0];
  const s2 = [0, 0, 0];
  let count = 0;
  for (let ty = 0; ty < th; ty += step)
    for (let tx = 0; tx < tw; tx += step) {
      const si = ((y + ty) * sw + x + tx) * 4;
      const ti = (ty * tw + tx) * 4;
      if (overlay(t, ti) || overlay(s, si)) continue;
      count++;
      for (let c = 0; c < 3; c++) {
        const a = s[si + c];
        const b = t[ti + c];
        n[c]++;
        ss[c] += a;
        tt[c] += b;
        st[c] += a * b;
        s2[c] += a * a;
        sst[c] += b * b;
      }
    }
  if (count < (tw / step) * (th / step) * 0.3) return 0;
  let total = 0;
  for (let c = 0; c < 3; c++) {
    const cov = st[c] - (ss[c] * tt[c]) / n[c];
    const va = s2[c] - (ss[c] * ss[c]) / n[c];
    const vb = sst[c] - (tt[c] * tt[c]) / n[c];
    total += va > 1 && vb > 1 ? cov / Math.sqrt(va * vb) : 0;
  }
  return Math.max(0, total / 3);
}

/** 고정 아이콘이 있다고 보는 점수. 실제 화면: 맞는 아이콘 0.65~1, 다른 아이콘 0.54 안팎 */
export const FIXED_MIN = 0.6;

const black = (d: Uint8ClampedArray, i: number) => Math.max(d[i], d[i + 1], d[i + 2]) <= 60;

/**
 * 고정 아이콘을 찾는다. 버프 아이콘의 검은 테두리는 불투명해서 배경과 관계없이 같으므로,
 * 템플릿 가장자리 3px 안의 검은 픽셀이 85% 이상 검은 자리만 후보로 고르고(빠름),
 * 후보에서만 그림을 iconScore로 재서 가장 높은 자리를 돌려준다.
 */
export function findFixedIcon(search: Pixels, template: Pixels) {
  const { width: sw, height: sh, data: s } = search;
  const { width: tw, height: th, data: t } = template;
  if (tw > sw || th > sh) return { score: 0, x: 0, y: 0 };
  const rim: number[] = [];
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      const edge = x < 3 || y < 3 || x >= tw - 3 || y >= th - 3;
      if (edge && black(t, (y * tw + x) * 4)) rim.push(y, x);
    }
  const allowed = Math.floor((rim.length / 2) * 0.15);
  let best = { score: 0, x: 0, y: 0 };
  for (let y = 0; y <= sh - th; y++)
    for (let x = 0; x <= sw - tw; x++) {
      let misses = 0;
      for (let k = 0; k < rim.length && misses <= allowed; k += 2)
        if (!black(s, ((y + rim[k]) * sw + x + rim[k + 1]) * 4)) misses++;
      if (misses > allowed) continue;
      // 어두운 배경에서는 테두리 후보가 많아, 듬성듬성 잰 점수가 낮으면 바로 넘어간다.
      if (iconScore(search, template, x, y, 3) < FIXED_MIN - 0.15) continue;
      const score = iconScore(search, template, x, y);
      if (score > best.score) best = { score, x, y };
    }
  return best;
}

/**
 * 0~1 점수(1이 똑같음). 비슷한 픽셀부터 keep 비율만큼의 평균 차이로 계산한다.
 * 버프는 남은 시간 숫자가 아이콘 일부를 덮어도 알아보도록 가장 많이 다른 40%를 뺀다(KEEP_RATIO).
 * 어두운 칸은 빼면 배경과 구분이 안 되므로 그런 칸은 전부(1) 비교한다.
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

/** 게임 숫자 색: 흰색(버프 분·야누스)과 노란~주황색(버프 초). 모두 검은 테두리가 있다. */
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
 * 남은 시간 숫자 모양만 남긴 흑백 마스크. 테두리 옆 밝은 픽셀(textMask)에서 시작해
 * 이어진 밝은 픽셀까지 채운다. 테두리 없는 아이콘 그림의 밝은 부분은 들어오지 않는다.
 * 글자는 한 가지 색이므로 흰색·노란색 중 더 많은 쪽만 남긴다(테두리에 닿은 아이콘 그림 색을 뺀다).
 * art(같은 크기)가 있으면 그 픽셀은 뺀다. 노란 글자(버프의 초 숫자)인지도 알려 준다.
 */
/** only: 'white'·'yellow'이면 그 색 글자만 남긴다. */
export function glyphMask(pixels: Pixels, box: Box, art?: Uint8Array, only?: 'white' | 'yellow') {
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
  const yellow = only ? only === 'yellow' : yellows > whites;
  const same = (i: number) => (yellow ? yellowish(data, i) : white(data, i));
  const near = (i: number) => (yellow ? yellowSoft(data, i) : whiteSoft(data, i));
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

/** 상하좌우로 이어진 덩어리가 한 픽셀뿐인 점(아이콘 그림 잡티)을 지운다. 콜론 점은 2픽셀이라 남는다. */
export function dropSpecks(mask: Uint8Array, w: number, h: number) {
  const out = mask.slice();
  out.forEach((v, i) => {
    if (!v) return;
    const x = i % w;
    const y = (i - x) / w;
    const alone =
      (x === 0 || !mask[i - 1]) &&
      (x === w - 1 || !mask[i + 1]) &&
      (y === 0 || !mask[i - w]) &&
      (y === h - 1 || !mask[i + w]);
    if (alone) out[i] = 0;
  });
  return out;
}

/** 아이콘 테두리와 바깥 배경(주황 배경은 노란 글자처럼 보인다)을 빼려고 안쪽으로 줄이는 폭 */
export const CLOCK_INSET = 2;

/**
 * "분+초" 표시의 남은 시간("3:21", 10분 이상이면 "23")은 아이콘 폭 안에 노란 글자로 뜬다.
 * 숫자 칸을 따로 고르지 않고 아이콘 안쪽 전체에서 노란 글자만 골라 잘라 낸다.
 * 흰 글자(겹침 수 "13" 등)와 아이콘 그림은 들어오지 않는다.
 */
export function clockMask(pixels: Pixels, icon: Box) {
  const box = {
    x: icon.x + CLOCK_INSET,
    y: icon.y + CLOCK_INSET,
    w: icon.w - CLOCK_INSET * 2,
    h: icon.h - CLOCK_INSET * 2,
  };
  const glyph = glyphMask(pixels, box, undefined, 'yellow');
  const clean = dropSpecks(glyph.mask, glyph.w, glyph.h);
  let total = 0;
  clean.forEach((v) => {
    if (v) total++;
  });
  return { total, trimmed: trimMask(clean, glyph.w, glyph.h) };
}

/**
 * 버프 아이콘은 게임 화면 위쪽에만 있다. 아래쪽 스킬 단축키 칸에도 같은 그림(야누스 등)이 있어
 * 화면 위쪽 절반만 찾는다.
 */
export function upperHalf(width: number, height: number): Box {
  return { x: 0, y: 0, w: width, h: Math.round(height / 2) };
}

/** 지난번 찾은 자리 둘레(아이콘 두 개 폭)만 먼저 본다. 버프가 생기고 사라지며 한두 칸 밀려도 따라간다. */
export function nearBox(at: { x: number; y: number }, iw: number, ih: number, limit: Box): Box {
  const x = Math.max(limit.x, at.x - iw * 2);
  const y = Math.max(limit.y, at.y - ih * 2);
  return {
    x,
    y,
    w: Math.min(limit.x + limit.w, at.x + iw * 3) - x,
    h: Math.min(limit.y + limit.h, at.y + ih * 3) - y,
  };
}
