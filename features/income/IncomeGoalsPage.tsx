'use client';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/ledger/PageHeading';
import { BookDialog } from '@/components/ledger/BookDialog';
import { koreaDate } from '@/lib/ledger/korea-date';
import { useAssetLedger } from './useAssetLedger';
import { recentNetHistory } from './asset-model';
import { GoalsPanel } from './GoalsPanel';
import { EnhancementPanel } from './EnhancementPanel';
import '@/components/ledger/ledger.css';
import './income.css';
import './asset.css';

// recharts(약 330KB)는 첫 화면을 그린 뒤 따로 받는다.
const IncomeChart = lazy(() => import('./IncomeChart').then((m) => ({ default: m.IncomeChart })));

/** 수입·목표: 사냥·보스 기록 그래프, 강화 비용, 목표를 보여준다. */
export function IncomeGoalsPage() {
  const { records, bosses, name, status, busy, failed, assets, load, save } = useAssetLedger();
  const [opened, setOpened] = useState(false),
    [creating, setCreating] = useState(false);
  // 상단 "＋ 기록 → 목표 만들기"로 들어오면 바로 만들기 창을 연다.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('goal') !== 'new') return;
    history.replaceState(null, '', '/income');
    const timer = setTimeout(() => setCreating(true), 0);
    return () => clearTimeout(timer);
  }, []);
  const today = koreaDate();
  const netHistory = useMemo(
    () => recentNetHistory(records, bosses, today, 28, assets.expenses),
    [records, bosses, today, assets.expenses],
  );
  return (
    <div className="income-page">
      <main>
        <PageHeading title="수입·목표">
          <button disabled={busy} onClick={() => setOpened(true)}>
            {name ? `${name} · 기록장` : '기록장 열기'}
          </button>
        </PageHeading>
        {!busy && (!name || failed) && (
          <p className="income-status">
            <span role="status">{status}</span>
            {failed && (
              <button type="button" onClick={() => void load()}>
                다시 불러오기
              </button>
            )}
          </p>
        )}
        <fieldset className="asset-workspace" disabled={busy || !name}>
          <GoalsPanel
            assets={assets}
            ledger={{ records, bosses, expenses: assets.expenses }}
            history={netHistory}
            busy={busy}
            save={save}
            creating={creating}
            setCreating={setCreating}
          />
          <h2 className="income-section-title">기록한 메소</h2>
          <Suspense fallback={<div className="income-chart" style={{ minHeight: 320 }} />}>
            <IncomeChart records={records} bosses={bosses} expenses={assets.expenses} />
          </Suspense>
          {/* 기록장이 바뀌면 패널을 새로 만들어 이전 기록장의 조회 결과·진행 중 조회를 버린다. */}
          <EnhancementPanel key={name} assets={assets} disabled={busy || !name} save={save} />
        </fieldset>
      </main>
      {opened && <BookDialog onClose={() => setOpened(false)} onOpened={load} />}
    </div>
  );
}
