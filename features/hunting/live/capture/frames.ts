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

/**
 * 저장한 아이콘 PNG를 픽셀로 바꾼다. 재획 타이머 탭은 보통 게임 뒤에 가려져 있는데,
 * 가려진 탭에서는 image.decode()가 끝나지 않으므로 createImageBitmap을 쓴다.
 */
export async function iconPixels(dataUrl: string): Promise<Pixels> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = context(canvas);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** 기존 사진 인식 엔진은 HTMLImageElement를 받으므로 프레임을 이미지로 바꾼다. */
export async function canvasImage(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw Error('화면을 이미지로 바꾸지 못했어요.');
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    // 가려진 탭에서도 끝나도록 decode() 대신 load 이벤트를 기다린다.
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(Error('화면을 이미지로 바꾸지 못했어요.'));
      image.src = url;
    });
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return { image, release: () => URL.revokeObjectURL(url) };
}

/** 조각 칸 둘레를 넉넉히(칸 크기의 60%) 잘라 3배로 키운 PNG. 사용자가 보고 직접 입력한다. */
export function slotCrop(image: HTMLImageElement, box: Area) {
  const pad = Math.max(box.w, box.h) * 0.6;
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  const w = Math.min(image.width - x, Math.ceil(box.w + pad * 2));
  const h = Math.min(image.height - y, Math.ceil(box.h + pad * 2));
  const canvas = document.createElement('canvas');
  canvas.width = w * 3;
  canvas.height = h * 3;
  const ctx = context(canvas);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export const sameArea = (a: Area, frame: { w: number; h: number }) =>
  a.x + a.w <= frame.w && a.y + a.h <= frame.h;
