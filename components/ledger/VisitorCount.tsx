'use client';
import { useEffect, useState } from 'react';
import { visitResponseSchema } from '@/contracts/visitors/schema';
import { untilKoreaMidnight } from '@/lib/ledger/korea-date';
export function VisitorCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let busy = false;
    let last = 0;
    async function refresh() {
      if (!active || busy) return;
      busy = true;
      last = Date.now();
      try {
        const identify = () => {
          let id = localStorage.getItem('meso-storage-visitor');
          if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
            id = crypto.randomUUID();
            localStorage.setItem('meso-storage-visitor', id);
          }
          return id;
        };
        const visitor = navigator.locks
          ? await navigator.locks.request('meso-visitor-id', identify)
          : identify();
        const response = await fetch('/api/visitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitor }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw Error();
        const data = visitResponseSchema.parse(await response.json());
        if (active) setCount(data.count);
      } catch {
        if (active) setCount(null);
      } finally {
        busy = false;
        if (active) {
          clearTimeout(timer);
          timer = setTimeout(refresh, untilKoreaMidnight() + 1000);
        }
      }
    }
    // 탭을 오갈 때마다 집계 요청(DB 쓰기)을 보내지 않도록 5분에 한 번만 다시 확인한다.
    const visible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 300000) void refresh();
    };
    void refresh();
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return (
    <span className="visitor-count" title="한국 시간 기준 · 같은 브라우저는 하루 한 번 집계">
      오늘 방문자 {count === null ? '—' : count.toLocaleString('ko-KR')}명
    </span>
  );
}
