'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { BossState } from '@/contracts/boss/state';
import { bossResponseSchema, bossStateSchema } from '@/contracts/boss/schema';
import { ApiError, errorMessage, ledgerRequest } from '@/lib/ledger/api';
import { bossDraftKey, readBossDraft, writeBossDraft } from './draft-storage';

export function useBossBook() {
  const [state, setState] = useState<BossState>({ characters: [] });
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState('기록장 확인 중…');
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const revision = useRef(0);
  const current = useRef({ state, dirty, name });
  const loading = useRef(false);
  const autosave = useRef<ReturnType<typeof setTimeout> | null>(null);
  function install(next: BossState, bookName: string | null, changed: boolean) {
    current.current = { state: next, name: bookName, dirty: changed };
    setState(next);
    setName(bookName);
    setDirty(changed);
  }
  const load = useCallback(async (merge = false, restore = false) => {
    if (loading.current) return;
    if (
      !merge &&
      !restore &&
      current.current.dirty &&
      !confirm('저장하지 않은 변경사항을 서버 기록으로 바꿀까요?')
    )
      return;
    loading.current = true;
    setBusy(true);
    try {
      const response = bossResponseSchema.parse(await ledgerRequest('boss-read'));
      const cached = restore || merge ? readBossDraft(localStorage, response.name) : null;
      let next = cached?.state || response.state;
      let changed = !!cached;
      // Only an unsigned draft may be merged into a newly opened book.
      if (merge && current.current.name === null && current.current.dirty) {
        const guest = structuredClone(current.current.state);
        for (const c of guest.characters) {
          c.id = crypto.randomUUID();
          for (const r of c.runs) r.id = crypto.randomUUID();
        }
        next = bossStateSchema.parse({
          characters: [...next.characters, ...guest.characters],
          presets: [...(next.presets || []), ...(guest.presets || [])].slice(0, 20),
        });
        changed = true;
      }
      revision.current = cached?.revision ?? response.revision;
      install(next, response.name, changed);
      if (changed) {
        const saved = writeBossDraft(localStorage, response.name, next, revision.current);
        if (saved && merge) {
          try {
            localStorage.removeItem(bossDraftKey(null));
          } catch {}
        }
        setStatus(saved ? '저장 안 된 변경을 복원했어요' : '기기 저장 공간이 부족해요');
        if (saved) scheduleSave();
      } else {
        try {
          localStorage.removeItem(bossDraftKey(response.name));
        } catch {}
        setStatus('저장됨');
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const cached = readBossDraft(localStorage, null);
        if (restore && cached) {
          revision.current = cached.revision;
          install(cached.state, null, true);
          setStatus('이 기기에만 저장됨');
        } else {
          setName(null);
          current.current.name = null;
          setStatus('기록장을 열면 다른 기기에서도 볼 수 있어요');
        }
      } else setStatus(errorMessage(e));
    } finally {
      loading.current = false;
      setBusy(false);
    }
    // scheduleSave는 ref만 사용하므로 첫 렌더의 함수를 써도 동작이 같다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void load(false, true);
  }, [load]);
  useEffect(
    () => () => {
      if (autosave.current) clearTimeout(autosave.current);
    },
    [],
  );
  function change(next: BossState) {
    const result = bossStateSchema.safeParse(next);
    if (!result.success) {
      setStatus('입력값과 기록 수 한도를 확인해 주세요.');
      return false;
    }
    install(result.data, current.current.name, true);
    const saved = writeBossDraft(localStorage, current.current.name, result.data, revision.current);
    if (current.current.name) {
      setStatus('저장 중…');
      scheduleSave();
    } else setStatus(saved ? '이 기기에만 저장됨' : '이 기기에 저장하지 못했어요. 백업해 주세요.');
    return true;
  }
  // 기록장이 열려 있으면 변경 후 잠시 뒤 서버에 자동 저장한다. 연속 입력은 한 번으로 묶는다.
  function scheduleSave(delay = 1200) {
    if (autosave.current) clearTimeout(autosave.current);
    autosave.current = setTimeout(() => {
      autosave.current = null;
      if (current.current.name && current.current.dirty) void save();
    }, delay);
  }
  async function save() {
    if (loading.current) {
      scheduleSave(800);
      return;
    }
    loading.current = true;
    setBusy(true);
    const snapshot = current.current;
    try {
      const response = z.object({ revision: z.number().int() }).parse(
        await ledgerRequest('boss-save', {
          book: snapshot.name,
          revision: revision.current,
          state: snapshot.state,
        }),
      );
      revision.current = response.revision;
      if (current.current.state === snapshot.state) {
        install(snapshot.state, snapshot.name, false);
        try {
          localStorage.removeItem(bossDraftKey(snapshot.name));
        } catch {}
      } else
        writeBossDraft(
          localStorage,
          current.current.name,
          current.current.state,
          response.revision,
        );
      setStatus('저장됨');
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }
  // 비동기 작업이 끝난 뒤 최신 상태를 기준으로 반영하기 위해 사용한다.
  const snapshot = useCallback(() => current.current, []);
  return { state, name, status, setStatus, busy, dirty, change, load, save, snapshot };
}
