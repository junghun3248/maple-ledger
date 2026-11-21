'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { context } from './frames';

/** TypeScript DOM 타입에 아직 없는 ImageCapture.grabFrame(Chrome·Edge) */
type FrameGrabber = { grabFrame(): Promise<ImageBitmap> };
const isGrabber = (v: unknown): v is FrameGrabber =>
  typeof v === 'object' && v !== null && 'grabFrame' in v && typeof v.grabFrame === 'function';
function frameGrabber(track: MediaStreamTrack): FrameGrabber | null {
  const Capture: unknown = Reflect.get(globalThis, 'ImageCapture');
  if (typeof Capture !== 'function') return null;
  const grabber: unknown = Reflect.construct(Capture, [track]);
  return isGrabber(grabber) ? grabber : null;
}

export const captureSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/**
 * 사용자가 버튼을 눌렀을 때만 화면 공유를 시작한다. 공유가 끊기면(브라우저의 "공유 중지" 포함)
 * 바로 정리한다. grab()은 현재 화면 한 장을 메모리 캔버스에 그린다.
 */
export function useScreenCapture() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement | null>(null);
  const capture = useRef<FrameGrabber | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const current = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    current.current?.getTracks().forEach((t) => t.stop());
    current.current = null;
    capture.current = null;
    if (video.current) video.current.srcObject = null;
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (!captureSupported()) {
      setError('이 브라우저는 화면 공유를 지원하지 않아요. PC의 Chrome이나 Edge를 써 주세요.');
      return;
    }
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5, max: 10 } },
        audio: false,
      });
      const [track] = next.getVideoTracks();
      track.addEventListener('ended', stop);
      const element = (video.current ??= document.createElement('video'));
      element.muted = true;
      element.playsInline = true;
      element.srcObject = next;
      await element.play();
      // Chrome·Edge는 탭이 가려져도 트랙에서 직접 프레임을 받을 수 있다.
      capture.current = frameGrabber(track);
      current.current = next;
      setStream(next);
    } catch (e) {
      stop();
      if (e instanceof DOMException && e.name === 'NotAllowedError') return;
      setError('화면 공유를 시작하지 못했어요.');
    }
  }, [stop]);

  const pending = useRef<Promise<HTMLCanvasElement | null> | null>(null);

  const draw = useCallback(async () => {
    const element = video.current;
    if (!current.current || !element) return null;
    const target = (canvas.current ??= document.createElement('canvas'));
    let bitmap: ImageBitmap | null = null;
    try {
      // grabFrame이 응답하지 않는 경우가 있어 1초 안에 안 오면 영상에서 그린다.
      const grabbed = capture.current?.grabFrame();
      bitmap = grabbed
        ? await Promise.race([
            grabbed,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
          ])
        : null;
      if (!bitmap) void grabbed?.then((late) => late.close()).catch(() => {});
    } catch {
      bitmap = null;
    }
    const width = bitmap?.width ?? element.videoWidth;
    const height = bitmap?.height ?? element.videoHeight;
    if (!width || !height) {
      bitmap?.close();
      return null;
    }
    if (target.width !== width) target.width = width;
    if (target.height !== height) target.height = height;
    context(target).drawImage(bitmap ?? element, 0, 0, width, height);
    bitmap?.close();
    return target;
  }, []);

  /** 감지 루프와 등록 화면이 동시에 불러도 프레임은 한 번에 하나만 받는다. */
  const grab = useCallback(() => {
    pending.current ??= draw().finally(() => {
      pending.current = null;
    });
    return pending.current;
  }, [draw]);

  useEffect(() => stop, [stop]);

  return { stream, active: !!stream, error, start, stop, grab };
}

export type ScreenCapture = ReturnType<typeof useScreenCapture>;
