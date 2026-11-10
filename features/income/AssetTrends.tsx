'use client';
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import { money } from '@/lib/ledger/format';
import { dailyCashFlow, recentBalanceRows, type AssetSettings } from './asset-model';
const categories = {
  equipment: '장비 구매',
  enhancement: '강화',
  consumable: '소비',
  other: '기타',
} as const;
export function AssetTrends({
  records,
  bosses,
  assets,
  end,
}: {
  records: LedgerRecord[];
  bosses: BossState;
  assets: AssetSettings;
  end: string;
}) {
  const [days, setDays] = useState(7);
  const rows = useMemo(() => {
    const flow = dailyCashFlow(records, bosses, assets);
    return recentBalanceRows(records, bosses, assets, end, days).map((balance) => {
      const v = flow.get(balance.date) ?? {
        hunting: 0n,
        boss: 0n,
        income: 0n,
        expense: 0n,
        incomeRecorded: false,
        expenseRecorded: false,
      };
      return { ...balance, ...v, net: v.income - v.expense };
    });
  }, [records, bosses, assets, end, days]);
  const totals = rows.reduce(
    (s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense }),
    { income: 0n, expense: 0n },
  );
  const categorized = (Object.keys(categories) as Array<keyof typeof categories>).map(
    (category) => ({
      category,
      label: categories[category],
      amount: assets.expenses
        .filter(
          (e) =>
            e.date.slice(0, 7) === end.slice(0, 7) && !e.huntIncluded && e.category === category,
        )
        .reduce((n, e) => n + BigInt(e.amount), 0n),
    }),
  );
  return (
    <section className="asset-card">
      <h2>최근 {days}일 자산 흐름</h2>
      <div className="income-chart-tools">
        <div>
          {[7, 30, 90].map((n) => (
            <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>
              {n}일
            </button>
          ))}
        </div>
      </div>
      <p>
        선택한 기간의 거래 흐름입니다. 기준점 이후 거래 미기록일은 전일 잔액을 이어 표시하고, 기준점
        이전은 잔액 자료 부족으로 표시합니다. 수입·지출은 입력된 거래만 합산합니다. 거래가 없는 날은
        0으로 단정하지 않고 미기록으로 안내하며, 사냥 순증감·클리어 결정석·판매 완료 실수령을
        구분합니다.
      </p>
      <div
        className="asset-chart"
        role="img"
        aria-label="날짜별 기록 잔액과 순수익 추이. 정확한 금액은 아래 표에서 확인할 수 있습니다."
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={rows.map((r) => ({
              date: r.date.slice(5),
              balance: r.balance === null ? null : Number(r.balance) / 1e8,
              net: r.incomeRecorded || r.expenseRecorded ? Number(r.net) / 1e8 : null,
            }))}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e6ebdf" />
            <XAxis dataKey="date" minTickGap={28} />
            <YAxis width={65} tickFormatter={(v: number) => `${v.toLocaleString('ko-KR')}억`} />
            <Tooltip
              formatter={(v) =>
                `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}억 메소`
              }
            />
            <Line
              type="linear"
              dataKey="balance"
              name="기록 잔액"
              stroke="#466b4b"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="linear"
              dataKey="net"
              name="기록 순수익"
              stroke="#b28233"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p>
        초록: 기록 잔액 · 황금색: 기록 순수익. 차트는 억 단위로 반올림하며 표는 정확한 메소를
        표시합니다.
      </p>
      <div className="asset-trend-table">
        <table>
          <thead>
            <tr>
              <th>날짜</th>
              <th>기록 잔액</th>
              <th>사냥</th>
              <th>보스·판매</th>
              <th>추가 지출·사냥 감소액</th>
              <th>기록 순수익</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td>{r.known && r.balance !== null ? money(r.balance) : '데이터 부족'}</td>
                <td>{r.incomeRecorded ? money(r.hunting) : '미기록'}</td>
                <td>{r.incomeRecorded ? money(r.boss) : '미기록'}</td>
                <td>{r.expenseRecorded ? money(r.expense) : '미기록'}</td>
                <td>{r.incomeRecorded || r.expenseRecorded ? money(r.net) : '미기록'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>{days}일 합계</th>
              <td>—</td>
              <td>
                {rows.some((r) => r.incomeRecorded)
                  ? money(rows.reduce((n, r) => n + r.hunting, 0n))
                  : '미기록'}
              </td>
              <td>
                {rows.some((r) => r.incomeRecorded)
                  ? money(rows.reduce((n, r) => n + r.boss, 0n))
                  : '미기록'}
              </td>
              <td>{rows.some((r) => r.expenseRecorded) ? money(totals.expense) : '미기록'}</td>
              <td>
                {rows.some((r) => r.incomeRecorded || r.expenseRecorded)
                  ? money(totals.income - totals.expense)
                  : '미기록'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <h3>이번 달 추가 지출 분류</h3>
      {categorized.map((c) => (
        <div className="asset-category" key={c.category}>
          <span>{c.label}</span>
          <b>{money(c.amount)} 메소</b>
        </div>
      ))}
    </section>
  );
}

