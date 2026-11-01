let bankPromise;
// Match the outlined game font at the field's own scale, independent of screen resolution.
async function read(source) {
  const bank = await (bankPromise ||= fetch('/glyphs.json?v=3').then((r) => r.json())),
    c = document.createElement('canvas'),
    candidates = [];
  for (let height = 16; height <= 26; height++) {
    c.height = height;
    c.width = Math.round((source.width * height) / source.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let top = 0; top <= height - 16; top++) {
      let value = '',
        position = 0,
        total = 0;
      for (let n = 0; n < 5; n++) {
        let best = { score: 193 };
        for (
          let left = n ? position + 8 : 0;
          left <= Math.min(n ? position + 14 : 5, c.width - 12);
          left++
        )
          for (const template of bank) {
            let score = 0;
            for (let y = 0; y < 16; y++)
              for (let x = 0; x < 12; x++) {
                const i = ((top + y) * c.width + left + x) * 4;
                if (
                  (data[i] + data[i + 1] + data[i + 2] < 390 ? 1 : 0) !==
                  template.pixels[y * 12 + x]
                )
                  score++;
              }
            if (score < best.score) best = { score, left, digit: template.digit };
          }
        if (best.score > 32) break;
        value += best.digit;
        position = best.left;
        total += best.score;
      }
      if (!value || value.length > 4) continue;
      // A later unread digit must not silently turn a count into its prefix.
      let trailing = 0;
      for (let x = position + 14; x < c.width; x++) {
        let column = 0;
        for (let y = top + 2; y < top + 13; y++) {
          const i = (y * c.width + x) * 4;
          if (data[i] + data[i + 1] + data[i + 2] < 330) column++;
        }
        if (column >= 5) trailing++;
      }
      if (trailing > 2) continue;
      candidates.push({ value: String(Number(value)), score: total / value.length });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];
  if (
    !best ||
    best.score > 25 ||
    candidates.some((c) => c.value !== best.value && c.score < best.score + 3)
  )
    return null;
  return best.value;
}

export { read };
