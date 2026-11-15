'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { LedgerRecord } from '@/contracts/ledger/request';
import { ledgerRecordSchema, saveLedgerSchema } from '@/contracts/ledger/schema';
import { ApiError, errorMessage, ledgerRequest } from '@/lib/ledger/api';
const responseSchema = z.union([
  z.object({
    name: z.string(),
    records: z.array(ledgerRecordSchema),
    revision: z.number().int(),
  }),
  z.object({ name: z.string(), revision: z.number().int(), unchanged: z.literal(true) }),
]);
export function useHuntingBook() {
  const [records, setRecords] = useState<LedgerRecord[]>([]),
    [name, setName] = useState<string | null>(null),
    [status, setStatus] = useState('기록장 확인 중…'),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const lock = useRef(false),
    activeName = useRef(name),
    // 이미 받은 기록의 revision. 주기 동기화 때 서버와 같으면 기록 본문을 다시 받지 않는다.
    loaded = useRef<{ name: string; revision: number } | null>(null);
  useEffect(() => {
    activeName.current = name;
  }, [name]);
  const load = useCallback(async (quiet = false) => {
    if (lock.current) return;
    lock.current = true;
    if (!quiet) setBusy(true);
    try {
      const known = quiet ? loaded.current : null;
      let data = responseSchema.parse(
        await ledgerRequest(undefined, known ? { rev: known.revision } : {}),
      );
      if ('unchanged' in data) {
        if (known?.name === data.name) return;
        // 다른 탭에서 기록장을 바꿨다면 전체를 다시 받는다.
        data = responseSchema.parse(await ledgerRequest());
        if ('unchanged' in data) return;
      }
      loaded.current = { name: data.name, revision: data.revision };
      setRecords(data.records);
      setRevision(data.revision);
      setName(data.name);
      setStatus('서버 기록 동기화 완료');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        loaded.current = null;
        setName(null);
        setRecords([]);
        setStatus('기록장 이름과 비밀번호로 열어 주세요.');
      } else setStatus(errorMessage(e));
    } finally {
      lock.current = false;
      if (!quiet) setBusy(false);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const refresh = () => {
      if (activeName.current && !document.hidden) void load(true);
    };
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      clearTimeout(initial);
      window.removeEventListener('focus', refresh);
      clearInterval(timer);
    };
  }, [load]);
  async function persist(next: LedgerRecord[]) {
    if (!name) {
      setStatus('먼저 기록장을 열어 주세요.');
      return false;
    }
    if (lock.current) {
      setStatus('동기화 중이에요. 잠시 후 저장해 주세요.');
      return false;
    }
    const parsed = saveLedgerSchema.safeParse({ book: name, records: next, revision });
    if (!parsed.success) {
      setStatus('기록 형식과 중복 여부를 확인해 주세요.');
      return false;
    }
    lock.current = true;
    setBusy(true);
    try {
      const result = z
        .object({ revision: z.number().int() })
        .parse(await ledgerRequest('save', parsed.data));
      setRecords(next);
      setRevision(result.revision);
      loaded.current = { name, revision: result.revision };
      setStatus('서버 저장 완료');
      return true;
    } catch (e) {
      setStatus(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        lock.current = false;
        await load();
        setStatus('다른 기기의 변경을 불러왔어요. 입력 내용을 확인하고 다시 저장해 주세요.');
      }
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function close() {
    if (lock.current) return;
    try {
      await ledgerRequest('close');
      loaded.current = null;
      setName(null);
      setRecords([]);
      setStatus('기록장을 닫았어요. 서버 기록은 보관됩니다.');
    } catch (e) {
      setStatus(errorMessage(e));
    }
  }
  return { records, name, status, setStatus, busy, revision, load, persist, close };
}
