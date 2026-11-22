'use client';
import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/ledger/PageHeading';
import { BookDialog } from '@/components/ledger/BookDialog';
import { useAssetLedger } from '@/features/income/useAssetLedger';
import { MVP_DISCOUNTS } from '@/features/income/enhancement-model';
import { koreaDate } from '@/lib/ledger/korea-date';
import { money } from '@/lib/ledger/format';
import {
  cumulative,
  planned,
  GOAL_MAX,
  events,
  maxStar,
  RESTORE_TARGETS,
  SAFEGUARD_STARS,
  simulate,
  type StarforceEvent,
  type StarforceOptions,
} from './model';
import './starforce.css';

const STORAGE = 'maple-starforce-v2';

/** 자주 강화하는 장비(레벨만 정한다) */
const presets: { level: number; items: string[] }[] = [
  { level: 140, items: ['마이스터링', '데이브레이크 펜던트'] },
  { level: 150, items: ['루타비스'] },
  {
    level: 160,
    items: [
      '앱솔랩스',
      '가디언 엔젤 링',
      '루즈 컨트롤 머신 마크',
      '마력이 깃든 안대',
      '고통의 근원',
    ],
  },
  {
    level: 200,
    items: [
      '아케인셰이드',
      '몽환의 벨트',
      '커맨더 포스 이어링',
      '거대한 공포',
      '컴플리트 언더컨트롤',
    ],
  },
  {
    level: 250,
    items: [
      '에테르넬',
      '근원의 속삭임',
      '죽음의 맹세',
      '황홀한 악몽',
      '오만의 원죄',
      '굶주리는 핏빛 원혼',
    ],
  },
];
const eventLabels: Record<StarforceEvent, string> = {
  none: '노이벤',
  discount: '30% 할인',
  destroy: '30% 파괴 감소',
  shining: '샤타',
  shiningPlus: '샤타 + 15·16성 100%',
};
const mvpLabels = ['없음', '실버 3%', '골드 5%', '다이아 10%'];

type View = { item: string; mode: 'total' | 'step'; won: boolean; rate: number };
type Saved = { options: StarforceOptions; view: View };

const defaults: Saved = {
  options: {
    level: 200,
    from: 12,
    to: 22,
    event: 'none',
    mvp: 0,
    pc: false,
    safeguardStars: [],
    restoreTo: 22,
    optimize: false,
    itemPrice: 0,
  },
  view: { item: '아케인셰이드', mode: 'total', won: false, rate: 1600 },
};

const numbers = (v: unknown, allowed: number[]) =>
  Array.isArray(v) ? allowed.filter((n) => v.includes(n)) : null;
const isEvent = (v: unknown): v is StarforceEvent => events.some((e) => e === v);

/** 저장값은 이 브라우저 편의용이라, 모양이 다르면 기본값으로 채운다. */
function read(): Saved {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (!raw || typeof raw !== 'object' || !('options' in raw) || !('view' in raw)) return defaults;
    // 예전 저장값의 starCatch 같은 없어진 항목은 버린다.
    const { starCatch: _dropped, ...stored } = raw.options as Partial<StarforceOptions> & {
      starCatch?: unknown;
    };
    void _dropped;
    const o = { ...defaults.options, ...stored };
    const v = { ...defaults.view, ...(raw.view as Partial<View>) };
    return {
      options: {
        ...o,
        safeguardStars: numbers(o.safeguardStars, SAFEGUARD_STARS) ?? [],
        restoreTo: RESTORE_TARGETS.includes(o.restoreTo) ? o.restoreTo : 22,
        event: isEvent(o.event) ? o.event : 'none',
      },
      view: v,
    };
  } catch {
    return defaults;
  }
}

/** 횟수: 10 아래는 소수 둘째 자리, 1만 이상은 만·억 단위 */
const count = (n: number) =>
  n < 10
    ? n.toFixed(2)
    : n < 1e4
      ? Math.round(n).toLocaleString('ko-KR')
      : money(BigInt(Math.round(n)));
const percent = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 2 : 1)}%`;

export function StarforcePage() {
  const ledger = useAssetLedger();
  const [saved, setSaved] = useState<Saved>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [luck, setLuck] = useState<ReturnType<typeof simulate> | 'busy'>('busy');
  const [goalName, setGoalName] = useState('');
  const [goalSaved, setGoalSaved] = useState('');
  const [copied, setCopied] = useState('');
  const [bookOpen, setBookOpen] = useState(false);
  const { options: o, view } = saved;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSaved(read());
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(saved));
    } catch {}
  }, [loaded, saved]);

  const top = maxStar(o.level);
  // 최적화를 켜면 목표 별까지 가장 싼 파괴 방지·확정 복구로 바꿔서 계산한다.
  const plan = useMemo(() => planned(o), [o]);
  const rows = useMemo(() => cumulative(plan), [plan]);
  const selected = rows.find((r) => r.target === o.to) ?? null;

  // 운 좋을 때·나쁠 때는 직접 여러 번 굴려 본다. 입력이 멈춘 뒤에 해 화면이 멈추지 않게 한다.
  useEffect(() => {
    const timer = setTimeout(() => setLuck(simulate(plan)), 250);
    return () => {
      clearTimeout(timer);
      setLuck('busy');
    };
  }, [plan]);

  const update = (next: Partial<StarforceOptions>) => {
    setSaved((s) => {
      const merged = { ...s.options, ...next };
      const cap = maxStar(merged.level);
      const from = Math.min(merged.from, cap - 1);
      const to = Math.min(Math.max(merged.to, from + 1), cap);
      return { ...s, options: { ...merged, from, to } };
    });
    setGoalSaved('');
  };
  const setView = (next: Partial<View>) =>
    setSaved((s) => ({ ...s, view: { ...s.view, ...next } }));
  const toggle = (list: number[], star: number) =>
    list.includes(star) ? list.filter((s) => s !== star) : [...list, star].sort((a, b) => a - b);

  /** 메소 또는 원으로 보여 준다(1억 메소당 원 비율) */
  const unit = (meso: number) =>
    view.won
      ? `${Math.round((meso / 1e8) * view.rate).toLocaleString('ko-KR')}원`
      : `${money(BigInt(Math.round(meso)))} 메소`;
  const itemName = view.item ? `${view.item} ` : `${o.level}제 `;
  const defaultGoalName = `스타포스 ${itemName}${o.from}→${o.to}성`;

  const planText = [
    plan.safeguardStars.length ? `파괴 방지 ${plan.safeguardStars.join('·')}성` : '파괴 방지 없음',
    plan.restoreTo === 12 ? '파괴 시 12성' : `${plan.restoreTo}성 확정 복구`,
  ].join(' · ');

  async function saveGoal() {
    if (!selected || selected.meso <= 0 || selected.meso > GOAL_MAX) return;
    const name = (goalName.trim() || defaultGoalName).slice(0, 100);
    const goals = ledger.assets.goals;
    const ok = await ledger.save({
      ...ledger.assets,
      goals: [
        ...goals,
        {
          id: crypto.randomUUID(),
          name,
          amount: String(Math.round(selected.meso)),
          memo: `스타포스 ${o.level}제 ${o.from}→${o.to}성 평균 · ${planText} · 파괴 ${count(selected.destroys)}회 · 같은 장비 ${count(selected.items)}개`.slice(
            0,
            200,
          ),
          startDate: koreaDate(),
          priority: Math.max(0, ...goals.map((g) => g.priority)) + 1,
          active: true,
          completed: false,
        },
      ],
    });
    setGoalSaved(ok ? `'${name}' 목표를 저장했어요.` : '');
  }

  /** 보이는 표를 탭으로 나눈 글자로 복사한다(엑셀에 그대로 붙여 넣기). */
  async function copyTable() {
    const table =
      view.mode === 'total'
        ? [
            ['강화 단계', '기대값', '평균 파괴', '평균 시도'],
            ...rows.map((r) => [
              `${o.from}→${r.target}`,
              unit(r.meso),
              count(r.destroys),
              count(r.attempts),
            ]),
          ]
        : [
            ['강화 단계', '성공', '파괴', '1회 비용', '기대값'],
            ...rows.map((r) => [
              `${r.target - 1}→${r.target}`,
              percent(r.step.rate.success),
              percent(r.step.rate.destroy),
              `${money(BigInt(r.step.cost))} 메소`,
              unit(r.step.meso),
            ]),
          ];
    try {
      await navigator.clipboard.writeText(table.map((cells) => cells.join('\t')).join('\n'));
      setCopied('표를 복사했어요. 엑셀에 붙여 넣으세요.');
    } catch {
      setCopied('복사하지 못했어요. 브라우저가 클립보드를 막았어요.');
    }
  }

  const choiceText = (r: (typeof rows)[number]) => {
    if (r.step.choice.safeguard && r.step.rate.destroy === 0 && r.target - 1 >= 15)
      return '파괴 방지';
    if (r.step.rate.destroy === 0) return '—';
    return r.step.choice.reset === 12 ? '12성부터' : `${r.step.choice.reset}성 복구`;
  };

  return (
    <main className="starforce-page">
      <PageHeading
        title="스타포스 기대 비용"
        description="시작 별에서 각 별까지 평균 몇 메소가 드는지, 파괴는 몇 번쯤 나는지 계산해요. 표에서 목표 별을 눌러 목표 금액으로 등록할 수 있어요."
      />

      <div className="starforce-layout">
        <section className="starforce-card" aria-labelledby="sf-setup">
          <h2 id="sf-setup">장비</h2>
          <div className="sf-presets">
            {presets.map((g) => (
              <div key={g.level} className="sf-preset-row">
                <b>Lv. {g.level}</b>
                <div>
                  {g.items.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={view.item === item && o.level === g.level}
                      onClick={() => {
                        setView({ item });
                        update({ level: g.level });
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <h2 className="sf-gap">강화 조건</h2>
          <div className="sf-option">
            <span>이벤트</span>
            <div className="sf-segment sf-wrap" role="group" aria-label="이벤트">
              {events.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={o.event === e}
                  onClick={() => update({ event: e })}
                >
                  {eventLabels[e]}
                </button>
              ))}
            </div>
          </div>
          <p className="starforce-note sf-small">
            샤타: 강화 비용 30% 할인, 21성 이하 파괴 확률 30% 감소, 복구 비용 20% 할인.
            &quot;15·16성 100%&quot;는 여기에 15·16성 성공 확률 100%를 더해요.
          </p>
          <div className="sf-option">
            <span>MVP 할인</span>
            <div className="sf-segment" role="group" aria-label="MVP 할인">
              {MVP_DISCOUNTS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={o.mvp === d}
                  onClick={() => update({ mvp: d })}
                >
                  {mvpLabels[i]}
                </button>
              ))}
            </div>
          </div>
          <div className="sf-option">
            <span>PC방 할인</span>
            <div className="sf-segment" role="group" aria-label="PC방 할인">
              <button type="button" aria-pressed={o.pc} onClick={() => update({ pc: true })}>
                적용
              </button>
              <button type="button" aria-pressed={!o.pc} onClick={() => update({ pc: false })}>
                미적용
              </button>
            </div>
          </div>
          <label className="sf-switch">
            <input
              type="checkbox"
              checked={o.optimize}
              onChange={(e) => update({ optimize: e.target.checked })}
            />
            강화 최적화
          </label>
          <p className="starforce-note sf-small">
            켜면 {o.from}→{o.to}성 평균 비용이 가장 적은 파괴 방지와 확정 복구를 아래에 자동으로
            골라요. 같은 장비 가격·이벤트에 따라 답이 달라지니 노작값을 꼭 넣어 주세요. 버튼을 직접
            누르면 최적화가 꺼져요.
          </p>
          <div className="sf-option">
            <span>파괴 방지{o.optimize && <em className="sf-auto">자동</em>}</span>
            <div className="sf-segment" role="group" aria-label="파괴 방지">
              {SAFEGUARD_STARS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={plan.safeguardStars.includes(s)}
                  onClick={() =>
                    update({
                      optimize: false,
                      safeguardStars: toggle(plan.safeguardStars, s),
                      restoreTo: plan.restoreTo,
                    })
                  }
                >
                  {s}성
                </button>
              ))}
            </div>
          </div>
          <div className="sf-option">
            <span>확정 복구{o.optimize && <em className="sf-auto">자동</em>}</span>
            <div className="sf-segment sf-wrap" role="group" aria-label="파괴되면 복구할 별">
              {RESTORE_TARGETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={plan.restoreTo === s}
                  onClick={() =>
                    update({ optimize: false, restoreTo: s, safeguardStars: plan.safeguardStars })
                  }
                >
                  {s === 12 ? '12성(장비만)' : s === 22 ? '22성(직전 별)' : `${s}성`}
                </button>
              ))}
            </div>
          </div>
          <p className="starforce-note sf-small">
            파괴되면 흔적으로 고른 별까지 복구해요(메소 + 같은 장비 1~4개). 파괴 직전 별이 더 낮으면
            그 별까지만 복구되고, 22성을 고르면 늘 파괴 직전 별(최대 22성)까지 복구해요.
            &quot;12성&quot;은 같은 장비 1개만 써서 12성부터 다시 해요.
          </p>
          <label className="starforce-item">
            같은 장비(노작) 1개 가격
            <span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={o.itemPrice ? o.itemPrice / 1e8 : ''}
                placeholder="0"
                onChange={(e) =>
                  update({ itemPrice: Math.max(0, Math.round(Number(e.target.value || 0) * 1e8)) })
                }
              />
              억 메소
            </span>
          </label>
        </section>

        <section className="starforce-card starforce-result" aria-labelledby="sf-result">
          <div className="sf-result-head">
            <div className="sf-segment" role="group" aria-label="보기">
              <button
                type="button"
                aria-pressed={view.mode === 'total'}
                onClick={() => setView({ mode: 'total' })}
              >
                누적 기대값
              </button>
              <button
                type="button"
                aria-pressed={view.mode === 'step'}
                onClick={() => setView({ mode: 'step' })}
              >
                단계별 기대값
              </button>
            </div>
            <h2 id="sf-result">
              {view.item ? `${view.item} (${o.level}제)` : `${o.level}제`} · 시작 {o.from}성
            </h2>
          </div>
          <div className="sf-stars" role="group" aria-label="시작 별">
            {Array.from({ length: top }, (_, s) => (
              <button
                key={s}
                type="button"
                aria-pressed={o.from === s}
                onClick={() => update({ from: s })}
              >
                {s}성
              </button>
            ))}
          </div>
          <div className="sf-units">
            <div className="sf-segment" role="group" aria-label="단위">
              <button
                type="button"
                aria-pressed={!view.won}
                onClick={() => setView({ won: false })}
              >
                메소
              </button>
              <button type="button" aria-pressed={view.won} onClick={() => setView({ won: true })}>
                원
              </button>
            </div>
            <label>
              1억 메소 =
              <input
                type="number"
                min={0}
                value={view.rate}
                onChange={(e) => setView({ rate: Math.max(0, Number(e.target.value || 0)) })}
              />
              원
            </label>
            <button type="button" className="sf-copy" onClick={() => void copyTable()}>
              엑셀 복사
            </button>
          </div>
          {copied && <p className="starforce-note sf-small">{copied}</p>}

          {selected && (
            <div className="sf-summary">
              <div>
                <span>
                  {o.from}→{o.to}성 평균
                </span>
                <strong className="starforce-total">{unit(selected.meso)}</strong>
              </div>
              <dl className="starforce-stats">
                <div>
                  <dt>평균 파괴</dt>
                  <dd>{count(selected.destroys)}회</dd>
                </div>
                <div>
                  <dt>같은 장비 필요</dt>
                  <dd>평균 {count(selected.items)}개</dd>
                </div>
                <div>
                  <dt>절반의 사람은</dt>
                  <dd>
                    {luck === 'busy'
                      ? '계산 중…'
                      : luck
                        ? `${unit(luck.median)} 안에 끝나요`
                        : '목표가 높아 생략'}
                  </dd>
                </div>
                <div>
                  <dt>운이 나쁜 10%는</dt>
                  <dd>
                    {luck === 'busy'
                      ? '계산 중…'
                      : luck
                        ? `${unit(luck.unlucky)} 넘게 써요`
                        : '목표가 높아 생략'}
                  </dd>
                </div>
              </dl>
              <div className="starforce-goal">
                {ledger.name ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveGoal();
                    }}
                  >
                    <input
                      aria-label="목표 이름"
                      value={goalName}
                      maxLength={100}
                      placeholder={defaultGoalName}
                      onChange={(e) => {
                        setGoalName(e.target.value);
                        setGoalSaved('');
                      }}
                    />
                    <button
                      className="starforce-primary"
                      disabled={ledger.busy || selected.meso > GOAL_MAX}
                    >
                      {o.to}성까지 목표 설정
                    </button>
                  </form>
                ) : (
                  <button type="button" disabled={ledger.busy} onClick={() => setBookOpen(true)}>
                    기록장 열고 목표 설정
                  </button>
                )}
                <p className="starforce-note sf-small" role="status">
                  {goalSaved ||
                    (selected.meso > GOAL_MAX
                      ? '목표 금액이 너무 커서(1경 메소 이상) 기록장 목표로 등록할 수 없어요.'
                      : '표에서 목표 별 줄을 누르면 그 별까지의 평균 메소로 목표를 정해요.')}
                </p>
              </div>
            </div>
          )}

          <table className="starforce-table">
            <thead>
              {view.mode === 'total' ? (
                <tr>
                  <th>강화 단계</th>
                  <th>기대값</th>
                  <th>평균 파괴</th>
                  <th>평균 시도</th>
                </tr>
              ) : (
                <tr>
                  <th>강화 단계</th>
                  <th>성공</th>
                  <th>파괴</th>
                  <th>1회 비용</th>
                  <th>기대값</th>
                  <th>파괴 시</th>
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.target}
                  aria-selected={r.target === o.to}
                  onClick={() => update({ to: r.target })}
                >
                  {view.mode === 'total' ? (
                    <>
                      <td>
                        {o.from} → {r.target}성
                      </td>
                      <td>{unit(r.meso)}</td>
                      <td>{count(r.destroys)}</td>
                      <td>{count(r.attempts)}</td>
                    </>
                  ) : (
                    <>
                      <td>
                        {r.target - 1} → {r.target}성
                      </td>
                      <td>{percent(r.step.rate.success)}</td>
                      <td>{r.step.rate.destroy ? percent(r.step.rate.destroy) : '—'}</td>
                      <td>{money(BigInt(r.step.cost))}</td>
                      <td>{unit(r.step.meso)}</td>
                      <td>{choiceText(r)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="starforce-note sf-small">
            확률은 2025년 3월 개편(실패해도 별이 내려가지 않음, 최대 30성) 확률에, 2026년 스타캐치가
            없어지며 늘 적용되는 성공 확률 상승(1.05배)을 반영했어요. 1회 비용은 수입·목표의 강화
            비용 기록과 같은 식이고, 복구 메소는 공개된 복구 표를 레벨에 맞춰 환산한 추정값이에요.
            기대값은 파괴 뒤 다시 올라오는 비용까지 넣은 평균이에요.
          </p>
        </section>
      </div>
      {bookOpen && <BookDialog onClose={() => setBookOpen(false)} onOpened={ledger.load} />}
    </main>
  );
}
