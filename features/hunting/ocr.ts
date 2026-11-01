export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Fields {
  meso: Region | null;
  fragment: Region | null;
}
export interface OcrEngine {
  detect: (image: HTMLImageElement) => Promise<Fields>;
  read: (
    image: HTMLImageElement,
    fields: Fields,
    report: (text: string) => void,
  ) => Promise<{
    meso: string | null;
    fragment: string | null;
    assisted: boolean;
    fragmentIssue: string | null;
  }>;
  rawCrop: (image: HTMLImageElement, box: Region) => HTMLCanvasElement;
  enlarged: (canvas: HTMLCanvasElement, scale: number) => HTMLCanvasElement;
  resetWorkers: () => Promise<void>;
}
declare global {
  interface Window {
    MapleOCR: OcrEngine;
    Tesseract?: unknown;
  }
}
let ready: Promise<OcrEngine> | undefined;
function script(src: string) {
  return new Promise<void>((resolve, reject) => {
    const element = document.createElement('script');
    element.src = src;
    const timer = setTimeout(() => {
      element.remove();
      reject(Error('인식 엔진 연결 시간 초과'));
    }, 20000);
    element.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    element.onerror = () => {
      clearTimeout(timer);
      element.remove();
      reject(Error('인식 엔진을 불러오지 못했어요.'));
    };
    document.head.appendChild(element);
  });
}
export function engine() {
  return (ready ||= (async () => {
    const ocr = await import('./ocr/ocr-reader.js');
    window.MapleOCR = ocr;
    if (!window.Tesseract)
      await script('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
    return window.MapleOCR;
  })().catch((e) => {
    ready = undefined;
    throw e;
  }));
}
export const defaults: Region[] = [
  { x: 590, y: 881, w: 45, h: 18 },
  { x: 654, y: 881, w: 43, h: 18 },
  { x: 719, y: 881, w: 44, h: 18 },
  { x: 536, y: 380, w: 60, h: 18 },
];
export function manualFields(image: HTMLImageElement, regions: Region[]): Fields {
  const scale = (r: Region) => ({
    x: (r.x * image.width) / 1920,
    y: (r.y * image.height) / 1080,
    w: (r.w * image.width) / 1920,
    h: (r.h * image.height) / 1080,
  });
  const parts = regions.slice(0, 3),
    x = Math.min(...parts.map((r) => r.x)),
    y = Math.min(...parts.map((r) => r.y));
  return {
    meso: scale({
      x,
      y,
      w: Math.max(...parts.map((r) => r.x + r.w)) - x,
      h: Math.max(...parts.map((r) => r.y + r.h)) - y,
    }),
    fragment: scale(regions[3]),
  };
}
