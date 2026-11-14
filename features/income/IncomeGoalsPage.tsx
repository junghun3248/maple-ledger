'use client';
import { useEffect, useState } from 'react';
import { PageHeading } from '@/components/ledger/PageHeading';
import { BookDialog } from '@/components/ledger/BookDialog';
import { koreaDate } from '@/lib/ledger/korea-date';
import { useAssetLedger } from './useAssetLedger';
import { recentNetHistory } from './asset-model';
import { GoalsPanel } from './GoalsPanel';
import { IncomeChart } from './IncomeChart';
import '@/components/ledger/ledger.css';
import './income.css';
import './asset.css';

/** 수입·목표: 사냥·보스 기록 그래프와 목표만 보여준다. */
export function IncomeGoalsPage() {
  const { records, bosses, name, status, busy, assets, load, save } = useAssetLedger();
  const [opened, setOpened] = useState(false),
    [creating, setCreating] = useState(false);
  // 상단 "＋ 기록 → 목표 만들기"로 들어오면 바로 만들기 창을 연다.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('goal') !== 'new') return;
    history.replaceState(null, '', '/income');
    const timer = setTimeout(() => setCreating(true), 0);
    return () => clearTimeout(timer);
  }, []);
  const netHistory = recentNetHistory(records, bosses, assets, koreaDate());
  return (
    <div className="income-page">
      <main>
        <PageHeading title="수입·목표">
          <button disabled={busy} onClick={() => setOpened(true)}>
            {name || '기록장 열기'}
          </button>
        </PageHeading>
        {!name && !busy && (
          <p className="income-status">
            <span role="status">{status}</span>
          </p>
        )}
        <fieldset className="asset-workspace" disabled={busy || !name}>
          <GoalsPanel
            assets={assets}
            ledger={{ records, bosses }}
            history={netHistory}
            busy={busy}
            save={save}
            creating={creating}
            setCreating={setCreating}
          />
          <h2 className="income-section-title">기록한 메소</h2>
          <IncomeChart records={records} bosses={bosses} />
        </fieldset>
      </main>
      {opened && <BookDialog onClose={() => setOpened(false)} onOpened={load} />}
    </div>
  );
}
