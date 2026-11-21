/** 캔버스 ImageData와 같은 모양. 테스트에서는 직접 만든다. */
export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

/**
 * 등록한 아이콘(template)이 영역(search) 안에서 가장 비슷한 곳을 찾는다.
 * 점수는 0~1(1이 똑같음)이며 RGB 차이의 평균으로 계산한다.
 * 아이콘은 한 변에 12개 안팎의 표본 픽셀만 비교하고(큰 아이콘일수록 듬성듬성),
 * 지금까지의 최선보다 나빠지면 그 위치는 바로 멈춘다.
 */
export function matchTemplate(search: Pixels, template: Pixels) {
  const { width: sw, height: sh, data: s } = search;
  const { width: tw, height: th, data: t } = template;
  if (tw < 1 || th < 1 || tw > sw || th > sh) return { score: 0, x: 0, y: 0 };
  const stride = Math.max(2, Math.round(Math.max(tw, th) / 12));
  const samples: number[] = [];
  for (let y = 0; y < th; y += stride)
    for (let x = 0; x < tw; x += stride) samples.push(y, x, (y * tw + x) * 4);
  const count = samples.length / 3;
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
  return { score: 1 - best / (count * 3 * 255), x: bx, y: by };
}
