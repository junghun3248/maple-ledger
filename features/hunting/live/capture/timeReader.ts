import { engine } from '../../ocr';

/**
 * 남은 시간 숫자를 읽는다. 사냥 기록 사진 인식과 같은 Tesseract를 쓰되 숫자 전용 작업자를 따로 둔다.
 * 숫자 마스크(흰 바탕 검은 글자)를 4배로 키워 넘기고, 한 번에 하나씩만 읽는다.
 */
type Reader = {
  setParameters: (p: Record<string, string>) => Promise<unknown>;
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
};
type Library = { createWorker: (lang: string) => Promise<unknown> };

const isLibrary = (v: unknown): v is Library =>
  typeof v === 'object' &&
  v !== null &&
  'createWorker' in v &&
  typeof v.createWorker === 'function';
const isReader = (v: unknown): v is Reader =>
  typeof v === 'object' &&
  v !== null &&
  'recognize' in v &&
  typeof v.recognize === 'function' &&
  'setParameters' in v &&
  typeof v.setParameters === 'function';

let reader: Promise<Reader> | null = null;
let mode = '7';
let queue: Promise<unknown> = Promise.resolve();

function load() {
  return (reader ??= (async () => {
    await engine();
    const library: unknown = window.Tesseract;
    if (!isLibrary(library)) throw Error('숫자 인식 엔진을 불러오지 못했어요.');
    const worker = await library.createWorker('eng');
    if (!isReader(worker)) throw Error('숫자 인식 엔진을 불러오지 못했어요.');
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789:.',
      tessedit_pageseg_mode: '7',
    });
    return worker;
  })().catch((e) => {
    reader = null;
    throw e;
  }));
}

const SCALE = 4;
const PAD = 6;

export function maskCanvas(mask: Uint8Array, w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = (w + PAD * 2) * SCALE;
  canvas.height = (h + PAD * 2) * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('이 브라우저는 화면 분석을 지원하지 않아요.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) ctx.fillRect((x + PAD) * SCALE, (y + PAD) * SCALE, SCALE, SCALE);
  return canvas;
}

/**
 * 숫자 마스크를 읽은 글자를 돌려준다. 초로 바꾸는 것은 감지 종류에 맞춰 한다.
 * sparse: 여러 글자가 흩어진 넓은 칸(부스터 자동 읽기)은 한 줄이 아니라 흩어진 글자로 읽는다.
 */
export function readSeconds(mask: Uint8Array, w: number, h: number, sparse = false) {
  const canvas = maskCanvas(mask, w, h);
  const job = queue.then(async () => {
    const worker = await load();
    const want = sparse ? '11' : '7';
    if (mode !== want) {
      await worker.setParameters({ tessedit_pageseg_mode: want });
      mode = want;
    }
    const { data } = await worker.recognize(canvas);
    return data.text.trim();
  });
  queue = job.catch(() => undefined);
  return job;
}
