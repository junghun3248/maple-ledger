'use client';
import { PageHeading } from '@/components/ledger/PageHeading';
import { BookDialog } from '@/components/ledger/BookDialog';
import { useMemo, useState, type FormEvent } from 'react';
import { useAssetLedger } from './useAssetLedger';
import { money } from '@/lib/ledger/format';
import { koreaDate } from '@/lib/ledger/korea-date';
import {
  balanceWithBoss,
  deriveSaleSources,
  recentNetHistory,
  ledgerBalance,
  summarizeWeek,
  type ExpenseCategory,
} from './asset-model';
import '@/components/ledger/ledger.css';
import './income.css';
import './asset.css';
import { AssetTrends } from './AssetTrends';
import { AmountHint } from './AmountHint';
import { GoalsPanel, NextGoalCard } from './GoalsPanel';
const labels: Record<ExpenseCategory, string> = {
  equipment: '장비 구매',
  enhancement: '강화',
  consumable: '소비',
  other: '기타',
};
const rid = () => crypto.randomUUID();
const dateKey = () => koreaDate();
const dateStamp = (date: string) => new Date(`${date}T12:00:00+09:00`).toISOString();
const localDateTime = () => {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
};
export function AssetPage() {
  const { records, bosses, name, status, busy, assets, load, save } = useAssetLedger();
  const [opened, setOpened] = useState(false);
  const [tab, setTab] = useState<'status' | 'expense' | 'goals'>('status');
  const [amount, setAmount] = useState(''),
    [month, setMonth] = useState(dateKey().slice(0, 7)),
    [date, setDate] = useState(dateKey()),
    [category, setCategory] = useState<ExpenseCategory>('equipment'),
    [memo, setMemo] = useState(''),
    [huntIncluded, setHuntIncluded] = useState(false),
    [editing, setEditing] = useState<string | null>(null);
  const [openingAmount, setOpeningAmount] = useState(''),
    [openingAt, setOpeningAt] = useState(localDateTime()),
    [realAmount, setRealAmount] = useState(''),
    [adjustReason, setAdjustReason] = useState('');
  const [creatingGoal, setCreatingGoal] = useState(false);
  const today = dateKey(),
    base = ledgerBalance(records, assets),
    current = base === null ? null : balanceWithBoss(base, bosses, assets.opening),
    week = summarizeWeek(records, bosses, assets, today),
    sources = useMemo(() => deriveSaleSources(bosses, assets.sales), [bosses, assets.sales]);
  const netHistory = recentNetHistory(records, bosses, assets, today),
    monthly = assets.expenses.filter((e) => e.date.slice(0, 7) === month),
    monthTotal = monthly.reduce((s, e) => s + (e.huntIncluded ? 0n : BigInt(e.amount)), 0n);
  const activity = [
    ...assets.expenses
      .filter((e) => !e.huntIncluded)
      .map((e) => ({
        date: e.date,
        stamp: dateStamp(e.date),
        type: '지출',
        text: `${labels[e.category]}${e.memo ? ' · ' + e.memo : ''}`,
        value: -BigInt(e.amount),
      })),
    ...assets.adjustments.map((a) => ({
      date: koreaDate(Date.parse(a.at)),
      stamp: a.at,
      type: '잔액 조정',
      text: a.reason,
      value: BigInt(a.delta),
    })),
    ...records.map((r) => ({
      date: r.date,
      stamp: dateStamp(r.date),
      type: '사냥',
      text: '전후 메소 차액',
      value: BigInt(r.am) - BigInt(r.bm),
    })),
    ...bosses.characters.flatMap((c) =>
      c.runs
        .filter((r) => r.cleared)
        .map((r) => ({
          date: r.date,
          stamp: dateStamp(r.date),
          type: '보스 결정석',
          text: `${c.name} · ${r.name} ${r.difficulty}`,
          value: BigInt(r.crystal) / BigInt(r.party),
        })),
    ),
    ...assets.sales.map((s) => ({
      date: s.date,
      stamp: dateStamp(s.date),
      type: '물욕템 판매',
      text: s.itemName,
      value: BigInt(s.proceeds),
    })),
  ]
    .sort((a, b) => b.stamp.localeCompare(a.stamp))
    .slice(0, 20);
  const openingSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{1,16}$/.test(openingAmount)) return;
    if (
      assets.opening &&
      !confirm(
        '시작 기준을 변경하면 잔액이 다시 계산됩니다. 현재 잔액만 맞추려면 아래 잔액 조정을 사용하세요. 기준을 변경할까요?',
      )
    )
      return;
    const next = {
      ...assets,
      opening: {
        amount: openingAmount,
        at: new Date(`${openingAt}:00+09:00`).toISOString(),
        legacyDateChoice: null,
      } as const,
    };
    await save(next);
  };
  const expenseSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{1,16}$/.test(amount)) return;
    const row = {
        id: editing || rid(),
        amount,
        date,
        category,
        memo: memo.slice(0, 200),
        huntIncluded,
        createdAt:
          assets.expenses.find((x) => x.id === editing)?.createdAt ?? new Date().toISOString(),
      },
      expenses = editing
        ? assets.expenses.map((x) => (x.id === editing ? row : x))
        : [...assets.expenses, row];
    if (!(await save({ ...assets, expenses }))) return;
    setAmount('');
    setMemo('');
    setEditing(null);
  };
  const reconcile = async (e: FormEvent) => {
    e.preventDefault();
    if (current === null || !/^\d{1,16}$/.test(realAmount) || !adjustReason.trim()) return;
    const delta = BigInt(realAmount) - current;
    const saved = await save({
      ...assets,
      adjustments: [
        ...assets.adjustments,
        {
          id: rid(),
          before: current.toString(),
          after: realAmount,
          delta: delta.toString(),
          reason: adjustReason.trim(),
          at: new Date().toISOString(),
        },
      ],
    });
    if (!saved) return;
    setRealAmount('');
    setAdjustReason('');
  };
  return (
    <div className="income-page">
      <main>
        <PageHeading title="자산·지출">
          <button disabled={busy} onClick={() => setOpened(true)}>
            {name || '기록장 열기'}
          </button>
        </PageHeading>
        <div className="income-status">
          <span role="status">{status}</span>
          <button disabled={busy} onClick={() => void load()}>
            새로고침
          </button>
        </div>
        <nav className="asset-tabs" aria-label="자산·지출 메뉴">
          {(
            [
              ['status', '현황'],
              ['expense', '지출'],
              ['goals', '목표'],
            ] as const
          ).map(([k, v]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {v}
            </button>
          ))}
        </nav>
        <fieldset className="asset-workspace" disabled={busy || !name}>
          {!assets.opening && (
            <section className="asset-card asset-warning">
              <h2>시작 잔액을 설정해 주세요</h2>
              <p>게임 내 현재 잔액을 입력하면 이후 기록으로 잔액을 계산해요.</p>
            </section>
          )}
          {tab === 'status' && (
            <>
              <section className="income-stats">
                <article>
                  <span>현재 기록 기준 잔액</span>
                  <strong>
                    {current === null ? '기준 잔액 설정 필요' : money(current) + ' 메소'}
                  </strong>
                </article>
                <article>
                  <span>이번 주 총수입 · 목요일~수요일</span>
                  <strong>{week.incomeRecorded ? `${money(week.income)} 메소` : '미기록'}</strong>
                </article>
                <article>
                  <span>이번 주 총지출 · 순수익</span>
                  <strong>
                    {week.expenseRecorded ? money(week.expense) : '미기록'} ·{' '}
                    {week.incomeRecorded || week.expenseRecorded ? money(week.net) : '미기록'}
                  </strong>
                </article>
              </section>
              <NextGoalCard
                goals={assets.goals}
                current={current}
                history={netHistory}
                onOpen={() => setTab('goals')}
                onCreate={() => {
                  setTab('goals');
                  setCreatingGoal(true);
                }}
              />
              <section className="asset-card">
                <h2>시작 잔액과 기준 시각</h2>
                {assets.opening && (
                  <p>
                    저장된 기준: {money(assets.opening.amount)} 메소 ·{' '}
                    {new Date(assets.opening.at).toLocaleString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                    })}{' '}
                    (한국 시간)
                  </p>
                )}
                <p className="asset-hint">잔액 = 기준 잔액 + 기록 수입 − 기록 지출 ± 조정</p>
                <form onSubmit={openingSave} className="asset-form">
                  <label>
                    시작 잔액
                    <AmountHint value={openingAmount} />
                    <input
                      inputMode="numeric"
                      maxLength={16}
                      value={openingAmount}
                      onChange={(e) => setOpeningAmount(e.target.value)}
                      placeholder={assets.opening?.amount || '실제 잔액 입력'}
                      required
                    />
                  </label>
                  <label>
                    기준 날짜·시각
                    <input
                      type="datetime-local"
                      value={openingAt}
                      onChange={(e) => setOpeningAt(e.target.value)}
                      required
                    />
                  </label>
                  <button disabled={busy}>기준 저장</button>
                </form>
                {assets.opening && (
                  <div className="asset-callout">
                    <strong>
                      기준일의 기존 거래 ·{' '}
                      {assets.opening.legacyDateChoice === 'include'
                        ? '포함 중'
                        : assets.opening.legacyDateChoice === 'exclude'
                          ? '제외 중'
                          : '선택 필요'}
                    </strong>
                    <p>
                      사냥·보스 및 날짜만 저장된 기존 거래는 시간 정보가 없어 포함 여부를 직접
                      정합니다. 기준 저장 후 새로 입력한 당일 지출·판매는 자동 반영됩니다.
                    </p>
                    <button
                      aria-pressed={assets.opening.legacyDateChoice === 'include'}
                      onClick={() =>
                        void save({
                          ...assets,
                          opening: { ...assets.opening!, legacyDateChoice: 'include' },
                        })
                      }
                    >
                      기준일 기록 포함
                    </button>
                    <button
                      aria-pressed={assets.opening.legacyDateChoice === 'exclude'}
                      onClick={() =>
                        void save({
                          ...assets,
                          opening: { ...assets.opening!, legacyDateChoice: 'exclude' },
                        })
                      }
                    >
                      기준일 기록 제외
                    </button>
                  </div>
                )}
                <form onSubmit={reconcile} className="asset-form">
                  <label>
                    현재 실제 잔액
                    <AmountHint value={realAmount} />
                    <input
                      inputMode="numeric"
                      maxLength={16}
                      value={realAmount}
                      onChange={(e) => setRealAmount(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    조정 사유
                    <input
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      maxLength={200}
                      required
                    />
                  </label>
                  <button disabled={current === null || busy}>실제 잔액으로 맞추기</button>
                </form>
                {assets.adjustments.length > 0 && (
                  <details>
                    <summary>잔액 조정 내역</summary>
                    {assets.adjustments
                      .slice()
                      .reverse()
                      .map((a) => (
                        <p key={a.id}>
                          {new Date(a.at).toLocaleString('ko-KR')} · {money(a.before)} →{' '}
                          {money(a.after)} · 차액 {a.delta.startsWith('-') ? '-' : ''}
                          {money(a.delta.replace('-', ''))} · {a.reason}
                        </p>
                      ))}
                  </details>
                )}
              </section>
              <AssetTrends records={records} bosses={bosses} assets={assets} end={today} />
              <section className="asset-card">
                <h2>최근 활동</h2>
                {activity.length ? (
                  activity.map((a, i) => (
                    <div className="asset-activity" key={a.type + a.stamp + a.text + i}>
                      <time>{a.date}</time>
                      <span>
                        {a.type} · {a.text}
                      </span>
                      <b>
                        {a.value < 0n ? '-' : ''}
                        {money(a.value < 0n ? -a.value : a.value)}
                      </b>
                    </div>
                  ))
                ) : (
                  <p>저장된 활동이 없습니다.</p>
                )}
              </section>
              <section className="asset-card">
                <h2>물욕템 판매 확인</h2>
                <p className="asset-hint">판매 완료한 실수령액만 잔액에 더해져요.</p>
                {sources.length ? (
                  sources.map((s) => (
                    <div className="asset-activity" key={s.sourceId}>
                      <span>
                        {s.itemName} · {s.pending ? '판매 확인 필요' : '판매 완료'}
                        {s.estimated && s.pending ? ` · 예상 본인 몫 ${money(s.estimated)}` : ''}
                      </span>
                      {!s.pending && (
                        <button
                          onClick={() => {
                            const sale = assets.sales.find((row) => row.sourceId === s.sourceId);
                            if (!sale) return;
                            const proceeds = prompt('판매 실수령 메소 수정', sale.proceeds);
                            if (proceeds === null || !/^\d{1,16}$/.test(proceeds)) return;
                            void save({
                              ...assets,
                              sales: assets.sales.map((row) =>
                                row.id === sale.id ? { ...row, proceeds } : row,
                              ),
                            });
                          }}
                        >
                          판매액 수정
                        </button>
                      )}
                      {!s.pending && (
                        <button
                          onClick={() => {
                            if (confirm('판매 확인을 취소할까요? 원래 획득 기록은 유지됩니다.'))
                              void save({
                                ...assets,
                                sales: assets.sales.filter((row) => row.sourceId !== s.sourceId),
                              });
                          }}
                        >
                          판매 취소
                        </button>
                      )}
                      {s.pending && (
                        <button
                          onClick={() => {
                            const proceeds = prompt(
                              '분배·수수료 반영 후 본인 실수령 메소를 입력하세요.',
                            );
                            if (!proceeds || !/^\d{1,16}$/.test(proceeds)) return;
                            void save({
                              ...assets,
                              sales: [
                                ...assets.sales,
                                {
                                  id: rid(),
                                  sourceId: s.sourceId,
                                  itemName: s.itemName,
                                  proceeds,
                                  createdAt: new Date().toISOString(),
                                  date: dateKey(),
                                  memo: '',
                                },
                              ],
                            });
                          }}
                        >
                          판매 완료·금액 입력
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p>확인할 물욕템 획득 기록이 없습니다.</p>
                )}
              </section>
            </>
          )}
          {tab === 'expense' && (
            <>
              <section className="income-stats">
                <article>
                  <span>{month} 추가 차감 지출</span>
                  <strong>{money(monthTotal)} 메소</strong>
                </article>
                <article>
                  <span>건수</span>
                  <strong>{monthly.length}건</strong>
                </article>
                <article>
                  <span>사냥 차액에 포함</span>
                  <strong>{monthly.filter((e) => e.huntIncluded).length}건</strong>
                </article>
              </section>
              <section className="asset-card">
                <h2>{editing ? '지출 수정' : '지출 추가'}</h2>
                <form className="asset-form" onSubmit={expenseSave}>
                  <label>
                    메소 금액
                    <AmountHint value={amount} />
                    <input
                      inputMode="numeric"
                      maxLength={16}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    날짜
                    <input
                      type="date"
                      max={today}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    분류
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    >
                      {Object.entries(labels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    메모
                    <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} />
                  </label>
                  <label className="asset-check">
                    <input
                      type="checkbox"
                      checked={huntIncluded}
                      onChange={(e) => setHuntIncluded(e.target.checked)}
                    />{' '}
                    사냥 차액에 이미 포함 (잔액 재차감·지출합계 중복 제외)
                  </label>
                  <button disabled={busy}>{editing ? '수정 저장' : '지출 저장'}</button>
                  {editing && (
                    <button type="button" onClick={() => setEditing(null)}>
                      취소
                    </button>
                  )}
                </form>
              </section>
              <section className="asset-card">
                <h2>날짜별 지출</h2>
                <label className="asset-month">
                  월 선택
                  <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </label>
                {monthly.length ? (
                  monthly
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((e) => (
                      <div className="asset-activity" key={e.id}>
                        <time>{e.date}</time>
                        <span>
                          {labels[e.category]} · {e.memo || '메모 없음'}
                          {e.huntIncluded ? ' · 사냥 차액에 포함' : ''}
                        </span>
                        <b>{money(e.amount)}</b>
                        <button
                          onClick={() => {
                            setEditing(e.id);
                            setAmount(e.amount);
                            setDate(e.date);
                            setCategory(e.category);
                            setMemo(e.memo);
                            setHuntIncluded(e.huntIncluded);
                          }}
                        >
                          수정
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('지출 기록을 삭제할까요?'))
                              void save({
                                ...assets,
                                expenses: assets.expenses.filter((x) => x.id !== e.id),
                              });
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    ))
                ) : (
                  <p>이번 달 기록된 지출이 없습니다.</p>
                )}
              </section>
            </>
          )}
          {tab === 'goals' && (
            <GoalsPanel
              assets={assets}
              current={current}
              history={netHistory}
              busy={busy}
              save={save}
              onSetOpening={() => setTab('status')}
              creating={creatingGoal}
              setCreating={setCreatingGoal}
            />
          )}
        </fieldset>
      </main>
      {opened && <BookDialog onClose={() => setOpened(false)} onOpened={load} />}
    </div>
  );
}
