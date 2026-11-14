'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { BossDefinition } from '@/contracts/boss/state';
import { schedulerSchema } from '@/contracts/boss/nexon';
import { errorMessage, ledgerRequest } from '@/lib/ledger/api';
import { dateKey } from './model';
import type { useBossBook } from './useBossBook';
import {
  NEXON_KEY_STORAGE,
  applySync,
  shouldAutoSync,
  syncTargets,
  syncTimeKey,
  type SyncResponse,
} from './auto-sync';

type Book = ReturnType<typeof useBossBook>;
const responseSchema = z.object({ results: z.array(schedulerSchema) });

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useBossSync(book: Book, catalog: BossDefinition[]) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const inFlight = useRef(false);
  const autoDone = useRef<string | null | undefined>(undefined);

  const sync = useCallback(
    async (force: boolean) => {
      if (inFlight.current) return;
      const apiKey = readStorage(NEXON_KEY_STORAGE)?.trim() || '';
      setHasKey(!!apiKey);
      const { state, name } = book.snapshot();
      const stored = Number(readStorage(syncTimeKey(name)));
      const last = Number.isFinite(stored) && stored > 0 ? stored : null;
      setLastSync(last);
      const ocids = syncTargets(state);
      if (!apiKey || !ocids.length) return;
      if (!force && !shouldAutoSync(last, Date.now())) return;
      inFlight.current = true;
      setSyncing(true);
      setMessage('');
      const responses: SyncResponse[] = [];
      try {
        for (let i = 0; i < ocids.length; i += 8) {
          const group = ocids.slice(i, i + 8);
          try {
            const { results } = responseSchema.parse(
              await ledgerRequest('nexon-schedulers', { apiKey, ocids: group, images: false }),
            );
            responses.push(...results);
          } catch (e) {
            // 실패한 묶음은 오류로 기록만 하고 기존 기록은 건드리지 않는다.
            responses.push(...group.map((ocid) => ({ ocid, error: errorMessage(e) })));
          }
        }
        const before = book.snapshot();
        const result = applySync(before.state, responses, catalog, dateKey());
        const changed = result.updated + result.added > 0;
        // 기록장이 열려 있으면 change()가 서버 자동 저장을 예약한다.
        if (changed) book.change(result.state);
        const allFailed = result.failed.length === ocids.length;
        if (!allFailed) {
          const now = Date.now();
          setLastSync(now);
          try {
            localStorage.setItem(syncTimeKey(before.name), String(now));
          } catch {}
        }
        const parts = [];
        if (result.updated) parts.push(`클리어 상태 ${result.updated}개 갱신`);
        if (result.added) parts.push(`새 주기 보스 ${result.added}개 추가`);
        if (result.failed.length) parts.push(`조회 실패: ${result.failed.join(', ')}`);
        setMessage(parts.join(' · ') || '변경 없음');
      } finally {
        inFlight.current = false;
        setSyncing(false);
      }
    },
    [book, catalog],
  );

  // 기록장을 처음 불러온 직후와 다른 기록장을 열었을 때 한 번 자동 조회한다.
  useEffect(() => {
    if (book.busy || autoDone.current === book.name) return;
    const name = book.name;
    const timer = setTimeout(() => {
      if (autoDone.current === name) return;
      autoDone.current = name;
      void sync(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [book.busy, book.name, sync]);

  // 가져오기 창에서 방금 조회한 결과를 반영했을 때 중복 조회를 막는다.
  const markSynced = useCallback(() => {
    const now = Date.now();
    setHasKey(!!readStorage(NEXON_KEY_STORAGE));
    setLastSync(now);
    setMessage('');
    try {
      localStorage.setItem(syncTimeKey(book.snapshot().name), String(now));
    } catch {}
  }, [book]);

  return { syncing, lastSync, message, hasKey, sync, markSynced };
}
