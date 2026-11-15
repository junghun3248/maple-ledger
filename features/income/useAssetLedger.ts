import { useCallback, useEffect, useRef, useState } from 'react';
import {
  financeResponseSchema,
  financeSavedSchema,
  assetSchema,
  type AssetSettings,
} from '@/contracts/ledger/finance-schema';
import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import { ApiError, ledgerRequest, errorMessage } from '@/lib/ledger/api';
import { emptyAssets } from './asset-model';
import { koreaDate } from '@/lib/ledger/korea-date';

export function useAssetLedger() {
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [bosses, setBosses] = useState<BossState>({ characters: [] });
  const [name, setName] = useState('');
  const [status, setStatus] = useState('기록을 불러오는 중…');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [assets, setAssets] = useState<AssetSettings>(emptyAssets);
  const identity = useRef<{ bookId: string; revision: number } | null>(null);
  const pending = useRef(false);
  const startTried = useRef('');
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    identity.current = null;
    setName('');
    setRecords([]);
    setBosses({ characters: [] });
    setAssets(emptyAssets());
    try {
      const data = financeResponseSchema.parse(await ledgerRequest('finance-read'));
      identity.current = { bookId: data.bookId, revision: data.revision };
      setRecords(data.records);
      setBosses(data.bosses);
      setAssets(data.finance ?? emptyAssets());
      setName(data.name);
      setStatus('현재 기록장과 동기화되었습니다.');
      setFailed(false);
    } catch (e) {
      setStatus(errorMessage(e));
      // 기록장이 열려 있지 않은 것(401)은 오류가 아니라 안내 상태다.
      setFailed(!(e instanceof ApiError && e.status === 401));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  const save = async (next: AssetSettings) => {
    if (pending.current) return false;
    if (!identity.current) {
      setStatus('기록장을 먼저 열어 주세요.');
      return false;
    }
    const checked = assetSchema.safeParse(next);
    if (!checked.success) {
      setStatus(checked.error.issues[0]?.message || '입력 내용을 확인해 주세요.');
      return false;
    }
    pending.current = true;
    setBusy(true);
    try {
      const response = financeSavedSchema.parse(
        await ledgerRequest('finance-save', { ...identity.current, finance: checked.data }),
      );
      identity.current = { ...identity.current, revision: response.revision };
      setAssets(checked.data);
      setStatus('저장했습니다. 다른 기기에서도 같은 기록장으로 열 수 있어요.');
      setFailed(false);
      return true;
    } catch (e) {
      setStatus(errorMessage(e));
      setFailed(true);
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  // 시작일이 없는 예전 목표는 처음 열었을 때 오늘을 시작일로 한 번 저장한다.
  // 저장하지 않으면 '오늘'이 매일 바뀌어 진행률이 계속 0으로 돌아간다.
  const needsStart = !!name && !busy && assets.goals.some((g) => !g.startDate);
  useEffect(() => {
    if (!needsStart || !identity.current) return;
    // 같은 기록장·revision에서는 한 번만 시도한다. 실패(충돌 등) 시 무한 재시도를 막는다.
    const key = identity.current.bookId + ':' + identity.current.revision;
    if (startTried.current === key) return;
    startTried.current = key;
    const today = koreaDate();
    const timer = setTimeout(
      () =>
        void save({
          ...assets,
          goals: assets.goals.map((g) => (g.startDate ? g : { ...g, startDate: today })),
        }),
      0,
    );
    return () => clearTimeout(timer);
    // save는 매 렌더 새로 만들어지지만 ref로 중복 저장을 막는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsStart]);
  return { records, bosses, name, status, busy, failed, assets, load, save };
}
