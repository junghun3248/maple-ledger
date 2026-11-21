import type { Pixels } from '../detectors/template';
import type { Area } from '../session';

/** 프레임은 메모리의 캔버스에만 그리고, 저장하거나 서버로 보내지 않는다. */
export function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('이 브라우저는 화면 분석을 지원하지 않아요.');
  return ctx;
}

export function pixelsOf(canvas: HTMLCanvasElement, area: Area): Pixels {
  return context(canvas).getImageData(area.x, area.y, area.w, area.h);
}

export function cropCanvas(source: HTMLCanvasElement, area: Area) {
  const canvas = document.createElement('canvas');
  canvas.width = area.w;
  canvas.height = area.h;
  context(canvas).drawImage(source, area.x, area.y, area.w, area.h, 0, 0, area.w, area.h);
  return canvas;
}

export async function iconPixels(dataUrl: string): Promise<Pixels> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = context(canvas);
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** 기존 사진 인식 엔진은 HTMLImageElement를 받으므로 프레임을 이미지로 바꾼다. */
export async function canvasImage(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw Error('화면을 이미지로 바꾸지 못했어요.');
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return { image, release: () => URL.revokeObjectURL(url) };
}

export const sameArea = (a: Area, frame: { w: number; h: number }) =>
  a.x + a.w <= frame.w && a.y + a.h <= frame.h;
