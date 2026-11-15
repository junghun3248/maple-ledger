'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type WeekChartRow = { date: string; hunting: number; boss: number };

/** 홈 "최근 7일" 막대그래프. recharts가 커서 DashboardPage에서 늦게 불러온다. */
export function WeekChart({ chart }: { chart: WeekChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chart} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickLine={false} />
        <YAxis width={48} tickFormatter={(v: number) => `${v}억`} />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          formatter={(v) => `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}억`}
        />
        <Bar
          dataKey="hunting"
          name="사냥"
          stackId="a"
          fill="var(--warning)"
          isAnimationActive={false}
        />
        <Bar
          dataKey="boss"
          name="보스"
          stackId="a"
          fill="#6a87b1"
          isAnimationActive={false}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
