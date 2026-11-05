import { engine } from '@/features/hunting/ocr';
import { matchBadge } from './badge';
import { findPortraits } from './detect';
import { parseDifficulty, parseRatio, type RatioResult } from './result';
interface Worker {
  setParameters(params: Record<string, string>): Promise<void>;
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<void>;
}
interface Tesseract {
  createWorker(language: string): Promise<Worker>;
}
export async function readRatios(file: File, report: (s: string) => void, signal: AbortSignal) {
  if (file.size > 15 * 1024 * 1024) throw Error('이미지는 15MB 이하로 올려 주세요.');
  const image = await createImageBitmap(file);
  let worker: Worker | undefined;
  try {
    if (image.width * image.height > 20000000)
      throw Error('너무 큰 이미지예요. 보스 카드 영역만 잘라서 올려 주세요.');
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    report('보스 초상화와 카드 위치를 찾고 있어요…');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const boxes = await findPortraits(pixels, () => signal.throwIfAborted());
    signal.throwIfAborted();
    if (!boxes.length)
      throw Error(
        '알려진 보스 초상화를 찾지 못했어요. 보스 카드 전체가 보이도록 선명하게 올려 주세요.',
      );
    report(`${boxes.length}개 카드 발견 · 문자 인식 엔진 준비 중…`);
    await engine();
    worker = await (window.Tesseract as Tesseract).createWorker('eng+kor');
    signal.throwIfAborted();
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    function crop(x: number, y: number, w: number, h: number, binary = false, zoom = 4) {
      const out = document.createElement('canvas');
      out.width = Math.ceil(w * zoom);
      out.height = Math.ceil(h * zoom);
      const c = out.getContext('2d', { willReadFrequently: true })!;
      c.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
      if (binary) {
        const pixels = c.getImageData(0, 0, out.width, out.height),
          d = pixels.data;
        // Dark and light themes are both accepted. Preserve colored ratio digits.
        const light = d[0] + d[1] + d[2] > 540;
        for (let i = 0; i < d.length; i += 4) {
          const ink = light
            ? Math.min(d[i], d[i + 1], d[i + 2]) < 140
            : Math.max(d[i], d[i + 1], d[i + 2]) > 125;
          d[i] = d[i + 1] = d[i + 2] = ink ? 0 : 255;
        }
        c.putImageData(pixels, 0, 0);
      }
      return out;
    }
    const results: RatioResult[] = [];
    for (let i = 0; i < boxes.length; i++) {
      signal.throwIfAborted();
      const p = boxes[i],
        w = p.width;
      report(`난이도·배율 읽는 중 · ${i + 1} / ${boxes.length}`);
      const label = crop(p.x - w * 0.16, p.y + w * 0.8, w * 1.32, w * 0.4);
      const ratioArgs = [p.x - w * 0.38, p.y + w * 2.35, w * 1.75, w * 0.55] as const;
      const difficultyData = (await worker.recognize(label)).data;
      const first = (await worker.recognize(crop(...ratioArgs))).data;
      const second = (await worker.recognize(crop(...ratioArgs, true))).data;
      const a = parseRatio(first.text),
        b = parseRatio(second.text);
      const badge = matchBadge(pixels, p);
      const difficulty = parseDifficulty(badge || difficultyData.text);
      const party = a.party || b.party;
      const ratio = a.ratio ?? b.ratio;
      results.push({
        id: String(i),
        name: p.name,
        difficulty,
        ratio,
        party,
        confident:
          !!difficulty &&
          !party &&
          a.ratio !== null &&
          a.ratio === b.ratio &&
          Math.min(first.confidence, second.confidence) >= 65 &&
          p.error < 14,
        text: `${difficultyData.text.trim()} / ${first.text.trim()} / ${second.text.trim()}`,
        preview: crop(p.x - w * 0.35, p.y - w * 0.3, w * 1.7, w * 3.3, false, 1).toDataURL(
          'image/webp',
        ),
      });
    }
    signal.throwIfAborted();
    return results;
  } finally {
    image.close();
    await worker?.terminate();
  }
}
