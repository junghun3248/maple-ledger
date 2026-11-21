'use client';
import { useEffect, useRef, useState } from 'react';
import type { Area } from '../session';
import { context } from './frames';

/** 멈춘 화면 위에서 드래그로 사각형을 고른다. 결과는 원본 픽셀 좌표다. */
export function RegionPicker({
  source,
  value,
  onChange,
  label,
}: {
  source: HTMLCanvasElement;
  value: Area | null;
  onChange: (area: Area | null) => void;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    target.width = source.width;
    target.height = source.height;
    context(target).drawImage(source, 0, 0);
  }, [source]);

  function point(e: React.PointerEvent) {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * source.width;
    const y = ((e.clientY - box.top) / box.height) * source.height;
    return {
      x: Math.max(0, Math.min(source.width, Math.round(x))),
      y: Math.max(0, Math.min(source.height, Math.round(y))),
    };
  }
  function area(a: { x: number; y: number }, b: { x: number; y: number }): Area | null {
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);
    return w && h ? { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w, h } : null;
  }
  const pct = (n: number, total: number) => `${(n / total) * 100}%`;

  return (
    <div
      className="live-picker"
      role="application"
      aria-label={label}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // 포인터 캡처가 안 돼도 드래그 자체는 동작한다.
        }
        const p = point(e);
        setStart(p);
        onChange(null);
      }}
      onPointerMove={(e) => {
        if (start) onChange(area(start, point(e)));
      }}
      onPointerUp={(e) => {
        if (start) onChange(area(start, point(e)));
        setStart(null);
      }}
    >
      <canvas ref={canvas} />
      {value && (
        <i
          style={{
            left: pct(value.x, source.width),
            top: pct(value.y, source.height),
            width: pct(value.w, source.width),
            height: pct(value.h, source.height),
          }}
        />
      )}
    </div>
  );
}
