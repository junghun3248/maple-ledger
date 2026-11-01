'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { BossState } from '@/contracts/boss/state';
import { bossResponseSchema, bossStateSchema } from '@/contracts/boss/schema';
import { ApiError, errorMessage, ledgerRequest } from '@/lib/ledger/api';

export function useBossBook() {
  const [state, setState] = useState<BossState>({ characters: [] });
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState('기록장 확인 중…');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const revision = useRef(0);
  const current = useRef({ state, dirty });
  useEffect(() => {
    current.current = { state, dirty };
  }, [state, dirty]);
  const loading = useRef(false);
  const load = useCallback(async (merge = false) => {
    if (loading.current) return;
    if (
      !merge &&
      current.current.dirty &&
      !confirm('저장하지 않은 변경사항을 서버 기록으로 바꿀까요?')
    )
      return;
    loading.current = true;
    setBusy(true);
    try {
      const response = bossResponseSchema.parse(await ledgerRequest('boss-read'));
      let next = response.state;
      const keepDraft = merge && current.current.dirty;
      if (keepDraft) {
        const draft = structuredClone(current.current.state);
        for (const c of draft.characters) {
          c.id = crypto.randomUUID();
          for (const r of c.runs) r.id = crypto.randomUUID();
        }
        next = bossStateSchema.parse({
          characters: [...next.characters, ...draft.characters],
          presets: [...(next.presets || []), ...(draft.presets || [])].slice(0, 20),
        });
      }
      revision.current = response.revision;
      setState(next);
      setName(response.name);
      setDirty(keepDraft);
      setStatus(keepDraft ? '초안을 합쳤어요. 기록장에 저장해 주세요.' : '서버 기록을 불러왔어요.');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setName(null);
        setStatus('기록장을 열면 다른 기기에서도 이어서 저장할 수 있어요.');
      } else setStatus(errorMessage(e));
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (current.current.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, []);
  function change(next: BossState) {
    const result = bossStateSchema.safeParse(next);
    if (!result.success) {
      setStatus('입력값과 기록 수 한도를 확인해 주세요.');
      return false;
    }
    setState(result.data);
    setDirty(true);
    setStatus('저장 전 변경사항이 있어요 · 기록장에 저장을 눌러 주세요.');
    return true;
  }
  async function save() {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    try {
      const response = z.object({ revision: z.number().int() }).parse(
        await ledgerRequest('boss-save', {
          revision: revision.current,
          state: current.current.state,
        }),
      );
      revision.current = response.revision;
      setDirty(false);
      setStatus('서버 저장 완료');
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }
  return { state, name, status, setStatus, busy, dirty, change, load, save };
}
