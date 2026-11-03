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
        setStatus(
          saved
            ? '이 기기에 저장된 보스 정보를 복원했어요 · 다른 기기와 공유하려면 기록장에 저장해 주세요.'
            : '기기 저장 공간이 부족해요. 기록장에 저장해 주세요.',
        );
      } else {
        try {
          localStorage.removeItem(bossDraftKey(response.name));
        } catch {}
        setStatus('서버 기록을 불러왔어요.');
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const cached = readBossDraft(localStorage, null);
        if (restore && cached) {
          revision.current = cached.revision;
          install(cached.state, null, true);
          setStatus(
            '이 기기의 보스 정보를 복원했어요 · 기록장을 열면 다른 기기에도 저장할 수 있어요.',
          );
        } else {
          setName(null);
          current.current.name = null;
          setStatus('기록장을 열면 다른 기기에서도 이어서 저장할 수 있어요.');
        }
      } else setStatus(errorMessage(e));
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load(false, true);
  }, [load]);
  function change(next: BossState) {
    const result = bossStateSchema.safeParse(next);
    if (!result.success) {
      setStatus('입력값과 기록 수 한도를 확인해 주세요.');
      return false;
    }
    install(result.data, current.current.name, true);
    const saved = writeBossDraft(localStorage, current.current.name, result.data, revision.current);
    setStatus(
      saved
        ? '이 기기에 자동 저장됨 · 다른 기기와 공유하려면 기록장에 저장해 주세요.'
        : '이 기기에 저장하지 못했어요. 이동 전에 기록장에 저장하거나 백업해 주세요.',
    );
    return true;
  }
  async function save() {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    const snapshot = current.current;
    try {
      const response = z
        .object({ revision: z.number().int() })
        .parse(
          await ledgerRequest('boss-save', { revision: revision.current, state: snapshot.state }),
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
      setStatus('서버 저장 완료 · 같은 기록장으로 다른 기기에서도 열 수 있어요.');
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }
  return { state, name, status, setStatus, busy, dirty, change, load, save };
}
