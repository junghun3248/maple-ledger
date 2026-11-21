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

/** 게임 숫자 색: 흰색(분)과 노란색(초). 둘 다 검은 테두리가 있다. */
const bright = (d: Uint8ClampedArray, i: number) => d[i] >= 190 && d[i + 1] >= 170;
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
 * 아이콘 그림 자체의 글자처럼 보이는 픽셀(art)은 빼고, 지금 화면의 글자 픽셀을 센다.
 * art는 등록한 아이콘에서 숫자 칸(number) 밖의 글자 픽셀이다.
 * 분 숫자(아래)든 초 숫자(가운데)든 남은 시간이 보이면 수가 크고, 숫자가 사라지면 거의 0이 된다.
 */
export function artMask(template: Pixels, number: Box) {
  const mask = textMask(template);
  for (let y = number.y; y < number.y + number.h; y++)
    for (let x = number.x; x < number.x + number.w; x++)
      if (x < template.width && y < template.height) mask[y * template.width + x] = 0;
  return mask;
}

export function numberPixels(
  search: Pixels,
  at: { x: number; y: number },
  art: Uint8Array,
  w: number,
  h: number,
) {
  const now = textMask(search, at, w, h);
  let count = 0;
  for (let i = 0; i < now.length; i++) if (now[i] && !art[i]) count++;
  return count;
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
