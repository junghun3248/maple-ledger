'use client';
import { lazy, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookDialog } from '@/components/ledger/BookDialog';
import { money } from '@/lib/ledger/format';
import { koreaDate } from '@/lib/ledger/korea-date';
import { useAssetLedger } from '@/features/income/useAssetLedger';
import { dailyIncome, earnedBetween, recentNetHistory } from '@/features/income/asset-model';
import { NextGoalCard } from '@/features/income/GoalsPanel';
import { dashboardSummary, recentActivity } from './model';
import '@/features/income/income.css';
import '@/features/income/asset.css';
import './dashboard.css';

// recharts(약 330KB)는 첫 화면을 그린 뒤 따로 받는다.
const WeekChart = lazy(() => import('./WeekChart').then((m) => ({ default: m.WeekChart })));

const short = (date: string) => `${Number(date.slice(5, 7))}.${Number(date.slice(8))}`;

export function DashboardPage() {
  const { records, bosses, name, busy, assets, load } = useAssetLedger();
  const [opened, setOpened] = useState(false);
  const router = useRouter();
  const today = koreaDate();
  const summary = dashboardSummary(records, bosses, today);
  const activity = recentActivity(records, bosses);
  // 홈에는 오늘까지 기록한 전체 수입을 보여준다 (예전 보유 메소 입력값은 쓰지 않음)
  const total = earnedBetween(dailyIncome(records, bosses), null, today);
  const weekEnd = new Date(summary.weekStart + 'T00:00:00Z');
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const chart = summary.last7.map((d) => ({
    date: short(d.date),
    hunting: Number(d.hunting) / 1e8,
    boss: Number(d.boss) / 1e8,
  }));
  return (
    <div className="income-page dashboard">
      <main>
        <section className="dash-hero">
          <div>
            <h1>쌓이는 기록만큼, 가까워지는 목표</h1>
            <p>사냥 메소와 보스 수익을 기록하는 메이플 가계부예요.</p>
          </div>
          <button disabled={busy} onClick={() => setOpened(true)}>
            {name ? `${name} · 기록장` : '기록장 열기'}
          </button>
        </section>
        {!name && !busy ? (
          <section className="dash-welcome">
            <h2>기록장을 열면 내 기록이 여기에 모여요</h2>
            <p>기록장 이름과 비밀번호만 있으면 다른 기기에서도 이어서 볼 수 있어요.</p>
            <div>
              <button className="primary" onClick={() => setOpened(true)}>
                기록장 열기 · 만들기
              </button>
              <Link href="/hunting">사냥 기록하기</Link>
              <Link href="/boss">보스 정산하기</Link>
            </div>
          </section>
        ) : (
          <>
            <section className="dash-cards">
              <article className="dash-primary">
                <span>
                  이번 주 수익 · {short(summary.weekStart)}~
                  {short(weekEnd.toISOString().slice(0, 10))}
                </span>
                <strong>{money(summary.week.hunting + summary.week.boss)} 메소</strong>
                <small>
                  사냥 {money(summary.week.hunting)} · 보스 {money(summary.week.boss)}
                </small>
              </article>
              <article>
                <span>{Number(today.slice(5, 7))}월 수익</span>
                <strong>{money(summary.month.hunting + summary.month.boss)} 메소</strong>
                <small>
                  사냥 {money(summary.month.hunting)} · 보스 {money(summary.month.boss)}
                </small>
              </article>
              <article>
                <span>지금까지 모은 메소</span>
                <strong>{money(total)} 메소</strong>
                <Link href="/income">수입 그래프 보기 →</Link>
              </article>
            </section>
            <div className="dash-grid">
              <section className="dash-panel">
                <h2>최근 7일</h2>
                <div className="dash-chart" role="img" aria-label="최근 7일 일별 사냥·보스 수입">
                  <Suspense fallback={<div style={{ height: 220 }} />}>
                    <WeekChart chart={chart} />
                  </Suspense>
                </div>
                <p className="dash-legend">
                  <span data-kind="hunting">사냥</span>
                  <span data-kind="boss">보스</span>
                </p>
              </section>
              <NextGoalCard
                goals={assets.goals}
                ledger={{ records, bosses }}
                history={recentNetHistory(records, bosses, today)}
                onOpen={() => router.push('/income')}
                onCreate={() => router.push('/income?goal=new')}
              />
            </div>
            <section className="dash-panel">
              <div className="dash-panel-head">
                <h2>최근 활동</h2>
                <Link href="/hunting">기록 보기 →</Link>
              </div>
              {activity.length ? (
                <ul className="dash-activity">
                  {activity.map((a, i) => (
                    <li key={a.date + a.kind + i}>
                      <span className="dash-kind" data-kind={a.kind}>
                        {a.kind}
                      </span>
                      <span className="dash-title">{a.title}</span>
                      <time>{short(a.date)}</time>
                      <b data-negative={a.amount < 0n || undefined}>
                        {a.amount > 0n ? '+' : ''}
                        {money(a.amount)}
                      </b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="goal-empty">아직 기록이 없어요. 사냥이나 보스를 기록해 보세요.</p>
              )}
            </section>
          </>
        )}
      </main>
      {opened && <BookDialog onClose={() => setOpened(false)} onOpened={load} />}
    </div>
  );
}
