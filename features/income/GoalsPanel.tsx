'use client';
import { useState, type FormEvent } from 'react';
import { Dialog } from '@/components/ledger/Dialog';
import { money } from '@/lib/ledger/format';
import { AmountHint } from './AmountHint';
import {
  closestGoal,
  estimateGoalDays,
  goalProgress,
  type AssetSettings,
  type Goal,
} from './asset-model';

type History = { values: bigint[]; enough: boolean; observed: number };
type Save = (next: AssetSettings) => Promise<boolean>;
const quickAmounts = [
  ['+1억', 100000000n],
  ['+10억', 1000000000n],
  ['+100억', 10000000000n],
] as const;

function Bar({ percent }: { percent: number }) {
  return (
    <div
      className="goal-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function etaText(goal: Goal, current: bigint, history: History) {
  const p = goalProgress(goal, current);
  if (p?.reached) return '목표 금액에 도달했어요 🎉';
  const days = estimateGoalDays(goal, current, history.values, history.enough);
  if (days !== null) return `최근 기록 기준 약 ${days}일치 더 모으면 돼요`;
  return history.enough
    ? '최근 순수익이 없어 예상 기간을 계산하지 않았어요'
    : `기록이 14일 쌓이면 예상 기간을 알려드려요 (현재 ${history.observed}일)`;
}

/** 현황 탭과 목표 탭 상단에 쓰는 "나의 다음 목표" 카드 */
export function NextGoalCard({
  goals,
  current,
  baseLabel,
  history,
  onOpen,
  onCreate,
}: {
  goals: Goal[];
  current: bigint | null;
  baseLabel: string;
  history: History;
  onOpen?: () => void;
  onCreate: () => void;
}) {
  const goal = closestGoal(goals, current);
  if (!goal)
    return (
      <section className="goal-hero goal-hero-empty">
        <span className="goal-kicker">나의 다음 목표</span>
        <p>원하는 장비나 메소 목표를 정해 보세요.</p>
        <button className="primary" onClick={onCreate}>
          ＋ 목표 만들기
        </button>
      </section>
    );
  const p = goalProgress(goal, current);
  return (
    <section className="goal-hero" data-reached={p?.reached || undefined}>
      <div className="goal-hero-head">
        <span className="goal-kicker">나의 다음 목표</span>
        {onOpen && (
          <button className="quiet" onClick={onOpen}>
            전체 목표 →
          </button>
        )}
      </div>
      <h2>{goal.name}</h2>
      <div className="goal-flow">
        <div>
          <small>{baseLabel}</small>
          <strong>{current === null ? '—' : money(current)}</strong>
        </div>
        <span aria-hidden>→</span>
        <div>
          <small>남은 메소</small>
          <strong>{p ? money(p.remaining) : '—'}</strong>
        </div>
        <span aria-hidden>→</span>
        <div>
          <small>진행률</small>
          <strong>{p ? `${p.percent}%` : '—'}</strong>
        </div>
      </div>
      <Bar percent={p?.percent ?? 0} />
      <p className="goal-eta">
        목표 {money(goal.amount)} 메소 ·{' '}
        {current === null ? '기록을 불러오면 진행률이 표시돼요' : etaText(goal, current, history)}
      </p>
    </section>
  );
}

function GoalDialog({
  initial,
  busy,
  onSubmit,
  onClose,
}: {
  initial?: Goal;
  busy: boolean;
  onSubmit: (v: { name: string; amount: string; memo: string }) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? ''),
    [amount, setAmount] = useState(initial?.amount ?? ''),
    [memo, setMemo] = useState(initial?.memo ?? '');
  const valid = name.trim() && /^\d{1,16}$/.test(amount) && BigInt(amount) > 0n;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (await onSubmit({ name: name.trim(), amount, memo })) onClose();
  }
  return (
    <Dialog title={initial ? '목표 수정' : '새 목표'} onClose={onClose} className="goal-dialog">
      <form className="goal-form" onSubmit={submit}>
        <label>
          목표 이름
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 제네시스 무기 해방, 아케인 22성"
            maxLength={100}
            required
            autoFocus
          />
        </label>
        <label>
          목표 메소
          <AmountHint value={amount} />
          <input
            inputMode="numeric"
            maxLength={16}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="숫자만 입력"
            required
          />
        </label>
        <div className="goal-quick" aria-label="금액 빠르게 더하기">
          {quickAmounts.map(([label, step]) => (
            <button
              key={label}
              type="button"
              className="secondary"
              onClick={() =>
                setAmount((prev) => {
                  const base = /^\d{1,16}$/.test(prev) ? BigInt(prev) : 0n;
                  const next = (base + step).toString();
                  return next.length <= 16 ? next : prev;
                })
              }
            >
              {label}
            </button>
          ))}
          <button type="button" className="quiet" onClick={() => setAmount('')}>
            지우기
          </button>
        </div>
        <label>
          메모 (선택)
          <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} />
        </label>
        <button className="primary" disabled={busy || !valid}>
          {initial ? '수정 저장' : '목표 만들기'}
        </button>
      </form>
    </Dialog>
  );
}

function BaseDialog({
  assets,
  busy,
  save,
  onClose,
}: {
  assets: AssetSettings;
  busy: boolean;
  save: Save;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const valid = /^\d{1,16}$/.test(amount);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const saved = await save({
      ...assets,
      // 지금 보유량을 기준으로 삼으므로 오늘 이미 기록한 사냥·보스는 다시 더하지 않는다.
      opening: { amount, at: new Date().toISOString(), legacyDateChoice: 'exclude' },
    });
    if (saved) onClose();
  }
  return (
    <Dialog title="보유 메소 입력" onClose={onClose} className="goal-dialog">
      <form className="goal-form" onSubmit={submit}>
        <p className="goal-notice">
          게임에서 지금 가진 메소를 입력하면, 이후 기록한 사냥·보스 수입을 더해 목표 진행률을
          계산해요.
        </p>
        <label>
          지금 보유 메소
          <AmountHint value={amount} />
          <input
            inputMode="numeric"
            maxLength={16}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            autoFocus
            required
          />
        </label>
        <button className="primary" disabled={busy || !valid}>
          저장
        </button>
        {assets.opening && (
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={async () => {
              if (await save({ ...assets, opening: null })) onClose();
            }}
          >
            입력값 지우고 기록 수입만 보기
          </button>
        )}
      </form>
    </Dialog>
  );
}

export function GoalsPanel({
  assets,
  base,
  history,
  busy,
  save,
  creating,
  setCreating,
}: {
  assets: AssetSettings;
  base: { value: bigint; kind: 'balance' | 'earned' };
  history: History;
  busy: boolean;
  save: Save;
  creating: boolean;
  setCreating: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState<Goal | null>(null),
    [settingBase, setSettingBase] = useState(false);
  const current = base.value;
  const baseLabel = base.kind === 'balance' ? '보유 메소' : '모은 메소';
  const sorted = assets.goals.slice().sort((a, b) => a.priority - b.priority);
  const open = sorted.filter((g) => !g.completed);
  const done = sorted.filter((g) => g.completed);
  const update = (id: string, patch: Partial<Goal>) =>
    save({ ...assets, goals: assets.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  async function move(goal: Goal, direction: -1 | 1) {
    const i = open.findIndex((g) => g.id === goal.id),
      other = open[i + direction];
    if (!other) return;
    await save({
      ...assets,
      goals: assets.goals.map((g) =>
        g.id === goal.id
          ? { ...g, priority: other.priority }
          : g.id === other.id
            ? { ...g, priority: goal.priority }
            : g,
      ),
    });
  }
  const remove = (goal: Goal) =>
    confirm(`'${goal.name}' 목표를 삭제할까요?`) &&
    void save({ ...assets, goals: assets.goals.filter((g) => g.id !== goal.id) });
  return (
    <>
      <NextGoalCard
        goals={assets.goals}
        current={current}
        baseLabel={baseLabel}
        history={history}
        onCreate={() => setCreating(true)}
      />
      <p className="goal-notice">
        {base.kind === 'balance'
          ? `기준: ${new Date(assets.opening!.at).toLocaleDateString('ko-KR')}에 입력한 보유 메소 + 이후 사냥·보스 기록`
          : '기준: 지금까지 기록한 사냥·보스 수입'}
        <button className="quiet" onClick={() => setSettingBase(true)}>
          {base.kind === 'balance' ? '보유 메소 다시 입력' : '보유 메소 입력'}
        </button>
      </p>
      <div className="goal-toolbar">
        <h2>
          진행 중 <span>{open.length}</span>
        </h2>
        <button className="primary" onClick={() => setCreating(true)}>
          ＋ 목표 만들기
        </button>
      </div>
      {open.length ? (
        <div className="goal-grid">
          {open.map((g, i) => {
            const p = goalProgress(g, current);
            return (
              <article
                className="goal-card"
                key={g.id}
                data-paused={!g.active || undefined}
                data-reached={p?.reached || undefined}
              >
                <header>
                  <strong>{g.name}</strong>
                  {!g.active ? (
                    <span className="goal-badge">일시정지</span>
                  ) : p?.reached ? (
                    <span className="goal-badge goal-badge-ok">달성 가능</span>
                  ) : null}
                </header>
                <b className="goal-amount">{money(g.amount)} 메소</b>
                <Bar percent={p?.percent ?? 0} />
                <p className="goal-meta">
                  {p ? `${p.percent}% · 남은 ${money(p.remaining)}` : '잔액 입력 후 표시'}
                </p>
                {g.memo && <p className="goal-memo">{g.memo}</p>}
                <footer>
                  <button
                    className="secondary"
                    onClick={() => void update(g.id, { completed: true })}
                  >
                    ✓ 완료
                  </button>
                  <button className="quiet" onClick={() => setEditing(g)}>
                    수정
                  </button>
                  <details className="goal-more">
                    <summary aria-label={`${g.name} 더보기`}>⋯</summary>
                    <div>
                      <button disabled={i === 0} onClick={() => void move(g, -1)}>
                        위로
                      </button>
                      <button disabled={i === open.length - 1} onClick={() => void move(g, 1)}>
                        아래로
                      </button>
                      <button onClick={() => void update(g.id, { active: !g.active })}>
                        {g.active ? '일시정지' : '다시 진행'}
                      </button>
                      <button className="danger" onClick={() => remove(g)}>
                        삭제
                      </button>
                    </div>
                  </details>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="goal-empty">진행 중인 목표가 없어요.</p>
      )}
      {done.length > 0 && (
        <details className="goal-done">
          <summary>완료한 목표 {done.length}</summary>
          <ul>
            {done.map((g) => (
              <li key={g.id}>
                <span>
                  ✓ {g.name} <small>{money(g.amount)} 메소</small>
                </span>
                <span>
                  <button className="quiet" onClick={() => void update(g.id, { completed: false })}>
                    되돌리기
                  </button>
                  <button className="quiet" onClick={() => remove(g)}>
                    삭제
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {creating && (
        <GoalDialog
          busy={busy}
          onClose={() => setCreating(false)}
          onSubmit={(v) =>
            save({
              ...assets,
              goals: [
                ...assets.goals,
                {
                  id: crypto.randomUUID(),
                  ...v,
                  priority: Math.max(0, ...assets.goals.map((g) => g.priority)) + 1,
                  active: true,
                  completed: false,
                },
              ],
            })
          }
        />
      )}
      {settingBase && (
        <BaseDialog assets={assets} busy={busy} save={save} onClose={() => setSettingBase(false)} />
      )}
      {editing && (
        <GoalDialog
          initial={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSubmit={(v) => update(editing.id, v)}
        />
      )}
    </>
  );
}
