'use client';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ledgerRecordSchema } from '@/contracts/ledger/schema';
import type { LedgerRecord } from '@/contracts/ledger/request';
import { bossResponseSchema } from '@/contracts/boss/schema';
import type { BossState } from '@/contracts/boss/state';
import { ledgerRequest, errorMessage } from '@/lib/ledger/api';
import { dateKey, money } from '@/lib/ledger/format';
import { PageLink } from '@/components/ledger/Navigation';
import { BookDialog } from '@/components/ledger/BookDialog';
import { incomeSeries } from './model';
import '@/components/ledger/ledger.css';
import './income.css';
const recordResponse = z.object({ name: z.string(), records: z.array(ledgerRecordSchema) });
export function IncomePage() {
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [bosses, setBosses] = useState<BossState>({ characters: [] });
  const [name, setName] = useState(''),
    [status, setStatus] = useState('기록을 불러오는 중…');
  const [busy, setBusy] = useState(false),
    [opened, setOpened] = useState(false);
  const [days, setDays] = useState(30),
    [view, setView] = useState('total');
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [ledger, boss] = await Promise.all([
        ledgerRequest().then((r) => recordResponse.parse(r)),
        ledgerRequest('boss-read').then((r) => bossResponseSchema.parse(r)),
      ]);
      if (ledger.name !== boss.name) throw Error('기록장이 바뀌었어요. 다시 불러와 주세요.');
      setRecords(ledger.records);
      setBosses(boss.state);
      setName(ledger.name);
      setStatus('서버에 저장된 사냥·보스 기록 기준');
    } catch (e) {
      setRecords([]);
      setBosses({ characters: [] });
      setName('');
      setStatus(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const end = dateKey();
  const startDate = new Date(end + 'T12:00:00');
  startDate.setDate(startDate.getDate() - days + 1);
  const rows = incomeSeries(records, bosses, dateKey(startDate), end);
  const [recordedOnly, setRecordedOnly] = useState(false);
  const recordedDates = new Set([
    ...records.map((r) => r.date),
    ...bosses.characters.flatMap((c) => c.runs.map((r) => r.date)),
  ]);
  const tableRows = rows.filter((r) => !recordedOnly || recordedDates.has(r.date)).reverse();
  const last = rows.at(-1);
  const earned = rows.reduce((v, r) => v + r.dailyHunting + r.dailyBoss, 0n);
  const chart = rows.map((r) => ({
    date: r.date,
    total: Number(r.total) / 1e8,
    hunting: Number(r.hunting) / 1e8,
    boss: Number(r.boss) / 1e8,
  }));
  return (
    <div className="income-page">
      <header>
        <PageLink href="/">메이플 가계부</PageLink>
        <button onClick={() => setOpened(true)}>{name || '기록장 열기'}</button>
      </header>
      <main>
        <p className="income-eyebrow">MESO HISTORY</p>
        <h1>메소 수입 추이</h1>
        <p>사냥과 보스로 기록한 메소가 얼마나 쌓였는지 확인하세요.</p>
        <div className="income-status">
          <span role="status">{status}</span>
          <button disabled={busy} onClick={() => void load()}>
            새로고침
          </button>
        </div>
        <section className="income-stats">
          <article>
            <span>전체 누적 수입</span>
            <strong>{money(last?.total ?? 0n)} 메소</strong>
          </article>
          <article>
            <span>최근 {days}일 수입</span>
            <strong>{money(earned)} 메소</strong>
          </article>
          <article>
            <span>누적 사냥 / 보스</span>
            <b>
              {money(last?.hunting ?? 0n)} / {money(last?.boss ?? 0n)}
            </b>
          </article>
        </section>
        <section className="income-chart">
          <div className="income-chart-tools">
            <h2>누적 수입 변동</h2>
            <div>
              {[10, 30, 90, 365].map((n) => (
                <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>
                  {n === 365 ? '1년' : n + '일'}
                </button>
              ))}
            </div>
          </div>
          <div className="income-tabs">
            {[
              ['total', '전체'],
              ['hunting', '사냥'],
              ['boss', '보스'],
              ['all', '함께 보기'],
            ].map(([id, label]) => (
              <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>
          <div
            className="income-plot"
            role="img"
            aria-label="날짜별 누적 메소 수입 그래프. 정확한 금액은 아래 날짜별 기록에서 확인할 수 있습니다."
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chart} margin={{ top: 20, right: 20, left: 5, bottom: 10 }}>
                <CartesianGrid stroke="#e7eddf" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} minTickGap={30} />
                <YAxis tickFormatter={(v: number) => v.toLocaleString('ko-KR') + '억'} width={80} />
                <Tooltip
                  formatter={(value) =>
                    Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 4 }) + '억 메소'
                  }
                />
                {[
                  ['total', '전체', '#466b4b'],
                  ['hunting', '사냥', '#a78a4c'],
                  ['boss', '보스', '#6a87b1'],
                ]
                  .filter(([id]) => view === 'all' || view === id)
                  .map(([id, label, color]) => (
                    <Line
                      key={id}
                      type="linear"
                      dataKey={id}
                      name={label}
                      stroke={color}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {!records.length && !bosses.characters.some((c) => c.runs.length) && (
            <p className="income-empty">
              저장된 기록이 없어요. 사냥·보스 기록을 저장하면 그래프가 채워집니다.
            </p>
          )}
          <p className="income-note">
            실제 보유 잔액이 아닌 기록된 누적 수입입니다. 사냥은 전후 메소 차이, 보스는 등록 날짜의
            결정석과 획득 물욕템 정산액을 합산합니다. 장비 평가액·조각 시세는 포함하지 않습니다.
            보스 메뉴에서 변경한 내용은 ‘기록장에 저장’ 후 반영됩니다.
          </p>
        </section>
        <details className="income-table">
          <summary>날짜별 기록 · 정확한 금액</summary>
          <label className="income-date-filter">
            <input
              type="checkbox"
              checked={recordedOnly}
              onChange={(e) => setRecordedOnly(e.target.checked)}
            />
            기록한 날짜만 보기
          </label>
          {!tableRows.length && <p>이 기간에 기록한 날짜가 없어요.</p>}
          <div>
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>사냥 증감</th>
                  <th>보스 정산</th>
                  <th>누적 메소</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    <td>{money(r.dailyHunting)}</td>
                    <td>{money(r.dailyBoss)}</td>
                    <td>{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </main>
      {opened && <BookDialog onClose={() => setOpened(false)} onOpened={load} />}
    </div>
  );
}
