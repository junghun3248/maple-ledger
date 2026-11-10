import { useCallback, useEffect, useRef, useState } from 'react';
import {
  financeResponseSchema,
  financeSavedSchema,
  assetSchema,
  type AssetSettings,
} from '@/contracts/ledger/finance-schema';
import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import { ledgerRequest, errorMessage } from '@/lib/ledger/api';
import { emptyAssets } from './asset-model';

export function useAssetLedger() {
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [bosses, setBosses] = useState<BossState>({ characters: [] });
  const [name, setName] = useState('');
  const [status, setStatus] = useState('기록을 불러오는 중…');
  const [busy, setBusy] = useState(false);
  const [assets, setAssets] = useState<AssetSettings>(emptyAssets);
  const identity = useRef<{ bookId: string; revision: number } | null>(null);
  const pending = useRef(false);
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
    } catch (e) {
      setStatus(errorMessage(e));
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
      return true;
    } catch (e) {
      setStatus(errorMessage(e));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { records, bosses, name, status, busy, assets, load, save };
}

