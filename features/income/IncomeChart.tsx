'use client';
import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import { dateKey, money } from '@/lib/ledger/format';
import { incomeSeries } from './model';

const series = [
  ['total', '전체', 'var(--text)'],
  ['hunting', '사냥', 'var(--warning)'],
  ['boss', '보스', '#6a87b1'],
] as const;

/** 사냥 전후 차액과 보스 정산액을 날짜별로 누적한 그래프 */
export function IncomeChart({ records, bosses }: { records: LedgerRecord[]; bosses: BossState }) {
  const [days, setDays] = useState(30),
    [view, setView] = useState<'total' | 'hunting' | 'boss' | 'all'>('all'),
    [recordedOnly, setRecordedOnly] = useState(true);
  const end = dateKey();
  const start = new Date(end + 'T12:00:00');
  start.setDate(start.getDate() - days + 1);
  const rows = incomeSeries(records, bosses, dateKey(start), end);
  const last = rows.at(-1);
  const earned = rows.reduce(
    (v, r) => ({ hunting: v.hunting + r.dailyHunting, boss: v.boss + r.dailyBoss }),
    { hunting: 0n, boss: 0n },
  );
  const chart = rows.map((r) => ({
    date: r.date,
    total: Number(r.total) / 1e8,
    hunting: Number(r.hunting) / 1e8,
    boss: Number(r.boss) / 1e8,
  }));
  const tableRows = rows
    .filter((r) => !recordedOnly || r.dailyHunting !== 0n || r.dailyBoss !== 0n)
    .reverse();
  const empty = !records.length && !bosses.characters.some((c) => c.runs.length);
  return (
    <>
      <section className="income-stats">
        <article>
          <span>최근 {days === 365 ? '1년' : `${days}일`} 수입</span>
          <strong>{money(earned.hunting + earned.boss)} 메소</strong>
          <small>
            사냥 {money(earned.hunting)} · 보스 {money(earned.boss)}
          </small>
        </article>
        <article>
          <span>누적 사냥</span>
          <strong>{money(last?.hunting ?? 0n)} 메소</strong>
        </article>
        <article>
          <span>누적 보스</span>
          <strong>{money(last?.boss ?? 0n)} 메소</strong>
        </article>
      </section>
      <section className="income-chart">
        <div className="income-chart-tools">
          <h2>누적 수입</h2>
          <div>
            {[7, 30, 90, 365].map((n) => (
              <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>
                {n === 365 ? '1년' : n + '일'}
              </button>
            ))}
          </div>
        </div>
        <div className="income-tabs">
          {(
            [
              ['all', '함께 보기'],
              ['total', '전체'],
              ['hunting', '사냥'],
              ['boss', '보스'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="income-plot" role="img" aria-label="날짜별 누적 메소 수입 그래프">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chart} margin={{ top: 20, right: 20, left: 5, bottom: 10 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} minTickGap={30} />
              <YAxis tickFormatter={(v: number) => v.toLocaleString('ko-KR') + '억'} width={70} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                formatter={(value) =>
                  Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '억 메소'
                }
              />
              {series
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
        {empty && <p className="income-empty">사냥·보스 기록을 저장하면 그래프가 채워져요.</p>}
        <p className="income-note">
          사냥은 전후 메소 차이, 보스는 클리어한 결정석과 물욕템 정산액을 더한 기록 기준 수입이에요.
        </p>
      </section>
      <details className="income-table">
        <summary>날짜별 금액</summary>
        <label className="income-date-filter">
          <input
            type="checkbox"
            checked={recordedOnly}
            onChange={(e) => setRecordedOnly(e.target.checked)}
          />
          기록한 날짜만
        </label>
        {!tableRows.length && <p>이 기간에 기록한 날짜가 없어요.</p>}
        <div>
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>사냥</th>
                <th>보스</th>
                <th>누적</th>
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
    </>
  );
}
