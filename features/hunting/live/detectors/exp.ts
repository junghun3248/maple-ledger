import type { Pixels } from './template';

/**
 * 동꼽 방지: 화면 맨 아래 경험치 바 가운데 숫자("719,579,315,493,148 [82.672%]")가
 * 오르는지 본다. 경험치 바는 해상도와 관계없이 같은 크기로 게임 화면 맨 아래에 있고,
 * 숫자는 흰 글자로 가운데에 있다. 위쪽 HP·MP 바 숫자도 흰 글자라, 가장 아래 줄을 고른다.
 * 왼쪽이 채팅창에 가려져도 가운데 숫자만 보면 된다.
 */
export type Box = { x: number; y: number; w: number; h: number };

const white = (d: Uint8ClampedArray, i: number) =>
  d[i] >= 225 && d[i + 1] >= 225 && d[i + 2] >= 215;

/** 화면 아래쪽에서 살펴볼 띠(경험치 바 + 위쪽 여유) */
export function bottomStrip(width: number, height: number): Box {
  const h = Math.min(height, Math.max(60, Math.min(200, Math.round(height * 0.25))));
  return { x: 0, y: height - h, w: width, h };
}

export const TEXT_MIN = 6;
export const BAND_MIN = 4;
export const BAND_MAX = 14;

/**
 * 띠(strip) 안에서 경험치 숫자 줄을 찾아 strip 기준 좌표로 돌려준다.
 * 가운데 40% 폭에서 흰 글자 픽셀이 TEXT_MIN개 이상인 행이 4~14줄 이어진 묶음 중 가장 아래 것.
 */
export function findExpText(strip: Pixels): Box | null {
  const { width, height, data } = strip;
  const x0 = Math.floor(width * 0.3);
  const x1 = Math.ceil(width * 0.7);
  const counts = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = x0; x < x1; x++) if (white(data, (y * width + x) * 4)) counts[y]++;
  let y = height - 1;
  while (y >= 0) {
    if (counts[y] < TEXT_MIN) {
      y--;
      continue;
    }
    const bottom = y;
    while (y >= 0 && counts[y] >= TEXT_MIN) y--;
    const top = y + 1;
    const rows = bottom - top + 1;
    if (rows >= BAND_MIN && rows <= BAND_MAX) {
      let left = x1;
      let right = x0;
      for (let r = top; r <= bottom; r++)
        for (let x = x0; x < x1; x++)
          if (white(data, (r * width + x) * 4)) {
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
      // 자릿수가 늘어도 들어오도록 좌우를 넉넉히, 위아래는 한 줄씩 둔다.
      const pad = Math.max(24, Math.round((right - left) * 0.25));
      const bx = Math.max(0, left - pad);
      const by = Math.max(0, top - 1);
      return {
        x: bx,
        y: by,
        w: Math.min(width, right + pad + 1) - bx,
        h: Math.min(height, bottom + 2) - by,
      };
    }
  }
  return null;
}

/** 두 화면 조각에서 눈에 띄게 바뀐 픽셀 수(채널 차이 40 초과) */
export function changedPixels(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  if (a.length !== b.length) return Infinity;
  let count = 0;
  for (let i = 0; i < a.length; i += 4)
    if (
      Math.max(
        Math.abs(a[i] - b[i]),
        Math.abs(a[i + 1] - b[i + 1]),
        Math.abs(a[i + 2] - b[i + 2]),
      ) > 40
    )
      count++;
  return count;
}
export const CHANGED_MIN = 3;

/**
 * 공유 화면 전체를 줄인 작은 그림 두 장이 똑같은지. 사냥 중인 게임 화면은 늘 조금씩 움직이므로,
 * 똑같으면 화면 공유가 새 화면을 보내지 않은 것(창 최소화·공유 멈춤 등)이라 경험치가 그대로인지 알 수 없다.
 */
export function sameFrame(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const IDLE_MS = 5_000;
export const IDLE_REPEAT_MS = 30_000;

export type Idle = { lastChange: number; alertedAt: number | null };
export const initialIdle = (now: number): Idle => ({ lastChange: now, alertedAt: null });

/**
 * 재획 중에 경험치 숫자가 5초 넘게 그대로면 알린다. 계속 멈춰 있으면 30초마다 다시 알린다.
 * 재획 중이 아니거나 경험치 바를 못 찾거나 화면이 멈춰 있으면(창이 가려짐 등) 시간을 새로 센다.
 * changed: true(바뀜), false(그대로), null(못 찾음·알 수 없음)
 */
export function trackIdle(state: Idle, changed: boolean | null, hunting: boolean, now: number) {
  if (!hunting || changed === null || changed) return { state: initialIdle(now), alert: false };
  const stuck = now - state.lastChange >= IDLE_MS;
  const due = state.alertedAt === null || now - state.alertedAt >= IDLE_REPEAT_MS;
  if (stuck && due) return { state: { ...state, alertedAt: now }, alert: true };
  return { state, alert: false };
}
