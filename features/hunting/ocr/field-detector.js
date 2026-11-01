function findMesoField(data, width, height) {
  const seen = new Uint8Array(width * height),
    results = [];
  const gold = (i) => {
    const p = i * 4;
    return (
      data[p] > 185 &&
      data[p + 1] > 120 &&
      data[p + 2] < 175 &&
      data[p] > data[p + 2] * 1.25 &&
      data[p + 1] > data[p + 2] * 1.2
    );
  };
  const white = (i) => {
    const p = i * 4;
    return data[p] > 235 && data[p + 1] > 235 && data[p + 2] > 235;
  };
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (seen[index] || !gold(index)) continue;
      const queue = [index];
      seen[index] = 1;
      let left = x,
        right = x,
        top = y,
        bottom = y;
      for (let q = 0; q < queue.length; q++) {
        const i = queue[q],
          xx = i % width,
          yy = Math.floor(i / width);
        left = Math.min(left, xx);
        right = Math.max(right, xx);
        top = Math.min(top, yy);
        bottom = Math.max(bottom, yy);
        for (const j of [i - 1, i + 1, i - width, i + width])
          if (j >= 0 && j < seen.length && !seen[j] && Math.abs((j % width) - xx) <= 1 && gold(j)) {
            seen[j] = 1;
            queue.push(j);
          }
      }
      const cw = right - left + 1,
        ch = bottom - top + 1;
      if (
        queue.length < 12 ||
        cw < 5 ||
        cw > 50 ||
        ch < 5 ||
        ch > 50 ||
        cw / ch < 0.6 ||
        cw / ch > 1.5
      )
        continue;
      const cy = Math.round((top + bottom) / 2),
        cx = Math.round((left + right) / 2);
      let seed = -1;
      for (let dx = 1; dx <= 5; dx++) {
        const i = cy * width + right + dx;
        if (right + dx < width && white(i)) {
          seed = i;
          break;
        }
      }
      if (seed < 0) continue;
      const visit = new Set([seed]),
        flood = [seed];
      let l = seed % width,
        r = l,
        t = cy,
        b = cy,
        overflow = false;
      for (let q = 0; q < flood.length; q++) {
        const i = flood[q],
          xx = i % width,
          yy = Math.floor(i / width);
        l = Math.min(l, xx);
        r = Math.max(r, xx);
        t = Math.min(t, yy);
        b = Math.max(b, yy);
        if (r - l > cw * 35 || b - t > ch * 4 || flood.length > 50000) {
          overflow = true;
          break;
        }
        for (const j of [i - 1, i + 1, i - width, i + width])
          if (
            j >= 0 &&
            j < width * height &&
            !visit.has(j) &&
            Math.abs((j % width) - xx) <= 1 &&
            white(j)
          ) {
            visit.add(j);
            flood.push(j);
          }
      }
      if (
        overflow ||
        l > cx ||
        r - l < cw * 6 ||
        b - t < ch * 0.8 ||
        b - t > ch * 3 ||
        cx - l > (r - l) * 0.2
      )
        continue;
      results.push({
        x: right + Math.max(2, Math.round(cw * 0.25)),
        y: t,
        w: r - right - Math.max(2, Math.round(cw * 0.25)),
        h: b - t + 1,
        coin: { x: left, y: top, w: cw, h: ch },
        score: (r - l) / cw,
      });
    }
  results.sort((a, b) => b.score - a.score);
  return results[0] || null;
}
function findFragment(data, width, height, template, meso) {
  const candidates = [];
  function score(x, y, s, quick) {
    let sum = 0,
      n = 0;
    for (let i = 0; i < template.length; i += quick ? 11 : 1) {
      const p = template[i],
        xx = Math.round(x + p[0] * s),
        yy = Math.round(y + p[1] * s);
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) return 255;
      const j = (yy * width + xx) * 4;
      sum += Math.abs(data[j] - p[2]) + Math.abs(data[j + 1] - p[3]) + Math.abs(data[j + 2] - p[4]);
      n += 3;
    }
    return sum / n;
  }
  const left = meso ? Math.max(0, meso.coin.x - meso.coin.w) : 0;
  const right = meso ? Math.min(width, meso.coin.x + meso.coin.w * 1.6) : width;
  const bottom = meso ? meso.y : height;
  for (let si = 7; si <= 20; si++) {
    const s = si / 10;
    let best = null;
    for (let y = 0; y < bottom - 40 * s; y += 2)
      for (let x = left; x < Math.min(right, width - 40 * s); x += 2) {
        const q = score(x, y, s, true);
        if (q > 32) continue;
        const v = score(x, y, s, false);
        if (v < 32 && (!best || v < best.score)) best = { x, y, s, score: v };
      }
    if (best) candidates.push(best);
  }
  let best = null;
  for (const c of candidates)
    for (let ds = -1; ds <= 1; ds++)
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const x = c.x + dx,
            y = c.y + dy,
            s = c.s + ds * 0.03,
            v = score(x, y, s, false);
          if (v < 25 && (!best || v < best.score)) best = { x, y, s, score: v };
        }
  if (!best) return null;
  const s = Math.round(best.s * 10) / 10;
  return {
    x: Math.max(0, best.x),
    y: Math.max(0, best.y + 29 * s),
    w: Math.min(40 * s, width - best.x),
    h: Math.min(15 * s, height - best.y - 29 * s),
    icon: { x: best.x, y: best.y, w: 41 * s, h: 45 * s },
    score: best.score,
  };
}
function parseMeso(text) {
  const value = text.replace(/[\s,]/g, '');
  if (!value || !/^[0-9조억만]+$/.test(value)) return null;
  if (/^\d{1,16}$/.test(value)) return BigInt(value).toString();
  const match = value.match(/^(?:(\d{1,4})조)?(?:(\d{1,4})억)?(?:(\d{1,4})만)?(\d{1,4})?$/);
  if (!match) return null;
  return (
    BigInt(match[1] || 0) * 1000000000000n +
    BigInt(match[2] || 0) * 100000000n +
    BigInt(match[3] || 0) * 10000n +
    BigInt(match[4] || 0)
  ).toString();
}

export { findMesoField, findFragment, parseMeso };
