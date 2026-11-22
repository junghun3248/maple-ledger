'use client';
import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/ledger/PageHeading';
import { BookDialog } from '@/components/ledger/BookDialog';
import { useAssetLedger } from '@/features/income/useAssetLedger';
import { MVP_DISCOUNTS } from '@/features/income/enhancement-model';
import { koreaDate } from '@/lib/ledger/korea-date';
import { money } from '@/lib/ledger/format';
import { expectation, maxStar, simulate, type StarforceOptions } from './model';
import './starforce.css';

const STORAGE = 'maple-starforce';
const levels = [140, 150, 160, 200, 250];
const mvpLabels = ['없음', '실버 3%', '골드 5%', '다이아 이상 10%'];
const defaults: StarforceOptions = {
  level: 200,
  from: 17,
  to: 22,
  starCatch: true,
  sundayDiscount: false,
  sundayDestroy: false,
  mvp: 0,
  pc: false,
  safeguard: false,
  onDestroy: 'restore',
  itemPrice: 0,
};

function read(): StarforceOptions {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (saved && typeof saved === 'object') return { ...defaults, ...saved };
  } catch {}
  return defaults;
}

const meso = (n: number) => money(BigInt(Math.round(n)));
const percent = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 2 : 1)}%`;
const count = (n: number) => (n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString('ko-KR'));

export function StarforcePage() {
  const ledger = useAssetLedger();
  const [o, setO] = useState<StarforceOptions>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [luck, setLuck] = useState<ReturnType<typeof simulate> | 'busy'>('busy');
  const [goalName, setGoalName] = useState('');
  const [goalSaved, setGoalSaved] = useState('');
  const [bookOpen, setBookOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setO(read());
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(o));
    } catch {}
  }, [loaded, o]);

  const top = maxStar(o.level);
  const valid = o.from >= 0 && o.to <= top && o.from < o.to;
  const result = useMemo(() => (valid ? expectation(o) : null), [o, valid]);

  // 운 좋을 때·나쁠 때는 직접 여러 번 굴려 본다. 화면이 멈추지 않도록 입력이 멈춘 뒤에 한다.
  useEffect(() => {
    if (!valid) return;
    const timer = setTimeout(() => setLuck(simulate(o)), 250);
    return () => {
      clearTimeout(timer);
      setLuck('busy');
    };
  }, [o, valid]);

  const update = (next: Partial<StarforceOptions>) => {
    setO((current) => {
      const merged = { ...current, ...next };
      const cap = maxStar(merged.level);
      return { ...merged, from: Math.min(merged.from, cap - 1), to: Math.min(merged.to, cap) };
    });
    setGoalSaved('');
  };
  const stars = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const defaultGoalName = `스타포스 ${o.level}제 ${o.from}→${o.to}성`;

  async function saveGoal() {
    if (!result || result.meso <= 0) return;
    const name = (goalName.trim() || defaultGoalName).slice(0, 100);
    const goals = ledger.assets.goals;
    const saved = await ledger.save({
      ...ledger.assets,
      goals: [
        ...goals,
        {
          id: crypto.randomUUID(),
          name,
          amount: String(Math.round(result.meso)),
          memo: `스타포스 ${o.level}제 ${o.from}→${o.to}성 평균 · 파괴 ${count(result.destroys)}회 · 같은 장비 ${count(result.items)}개`.slice(
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
    setGoalSaved(saved ? `'${name}' 목표를 저장했어요.` : '');
  }

  return (
    <main className="starforce-page">
      <PageHeading
        title="스타포스 기대 비용"
        description="지금 별에서 목표 별까지 평균 몇 메소가 드는지, 파괴는 몇 번쯤 나는지 계산해요. 결과는 바로 목표 금액으로 등록할 수 있어요."
      />

      <div className="starforce-layout">
        <section className="starforce-card" aria-labelledby="sf-setup">
          <h2 id="sf-setup">장비와 강화 조건</h2>
          <div className="starforce-fields">
            <label>
              장비 레벨
              <select value={o.level} onChange={(e) => update({ level: Number(e.target.value) })}>
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {l}제
                  </option>
                ))}
              </select>
            </label>
            <label>
              지금 별
              <select value={o.from} onChange={(e) => update({ from: Number(e.target.value) })}>
                {stars(0, top - 1).map((s) => (
                  <option key={s} value={s}>
                    {s}성
                  </option>
                ))}
              </select>
            </label>
            <label>
              목표 별
              <select value={o.to} onChange={(e) => update({ to: Number(e.target.value) })}>
                {stars(1, top).map((s) => (
                  <option key={s} value={s}>
                    {s}성
                  </option>
                ))}
              </select>
            </label>
            <label>
              MVP 할인
              <select value={o.mvp} onChange={(e) => update({ mvp: Number(e.target.value) })}>
                {MVP_DISCOUNTS.map((d, i) => (
                  <option key={d} value={d}>
                    {mvpLabels[i]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="starforce-checks">
            <label>
              <input
                type="checkbox"
                checked={o.starCatch}
                onChange={(e) => update({ starCatch: e.target.checked })}
              />
              스타캐치 (성공 확률 1.05배)
            </label>
            <label>
              <input
                type="checkbox"
                checked={o.pc}
                onChange={(e) => update({ pc: e.target.checked })}
              />
              PC방 5% 할인
            </label>
            <label>
              <input
                type="checkbox"
                checked={o.sundayDiscount}
                onChange={(e) => update({ sundayDiscount: e.target.checked })}
              />
              썬데이 강화 비용 30% 할인
            </label>
            <label>
              <input
                type="checkbox"
                checked={o.sundayDestroy}
                onChange={(e) => update({ sundayDestroy: e.target.checked })}
              />
              썬데이 파괴 확률 30% 감소 (21성까지)
            </label>
            <label>
              <input
                type="checkbox"
                checked={o.safeguard}
                onChange={(e) => update({ safeguard: e.target.checked })}
              />
              15~17성 파괴 방지 (기본 비용 200% 추가)
            </label>
          </div>

          <fieldset className="starforce-destroy">
            <legend>파괴되면</legend>
            <label>
              <input
                type="radio"
                name="sf-destroy"
                checked={o.onDestroy === 'restore'}
                onChange={() => update({ onDestroy: 'restore' })}
              />
              흔적으로 파괴 직전 별까지 복구 (최대 22성, 메소 + 같은 장비 1~4개)
            </label>
            <label>
              <input
                type="radio"
                name="sf-destroy"
                checked={o.onDestroy === 'twelve'}
                onChange={() => update({ onDestroy: 'twelve' })}
              />
              같은 장비 1개로 12성부터 다시
            </label>
          </fieldset>
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
          <h2 id="sf-result">
            {o.level}제 {o.from}→{o.to}성 평균
          </h2>
          {!result ? (
            <p className="starforce-note">목표 별은 지금 별보다 높아야 해요.</p>
          ) : (
            <>
              <strong className="starforce-total">{meso(result.meso)} 메소</strong>
              <dl className="starforce-stats">
                <div>
                  <dt>평균 파괴</dt>
                  <dd>{count(result.destroys)}회</dd>
                </div>
                <div>
                  <dt>같은 장비 필요</dt>
                  <dd>평균 {count(result.items)}개</dd>
                </div>
                <div>
                  <dt>평균 강화 시도</dt>
                  <dd>{count(result.attempts)}회</dd>
                </div>
                <div>
                  <dt>절반의 사람은</dt>
                  <dd>
                    {luck === 'busy'
                      ? '계산 중…'
                      : luck
                        ? `${meso(luck.median)} 메소 안에 끝나요`
                        : '목표가 높아 생략'}
                  </dd>
                </div>
                <div>
                  <dt>운이 나쁜 10%는</dt>
                  <dd>
                    {luck === 'busy'
                      ? '계산 중…'
                      : luck
                        ? `${meso(luck.unlucky)} 메소 넘게 써요`
                        : '목표가 높아 생략'}
                  </dd>
                </div>
              </dl>
              {o.itemPrice === 0 && result.items > 0 && (
                <p className="starforce-note">
                  같은 장비 가격을 넣으면 평균 금액에 더해져요. 지금은 메소(강화·복구 비용)만
                  더했어요.
                </p>
              )}

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
                    <button className="starforce-primary" disabled={ledger.busy}>
                      {meso(result.meso)} 메소 목표 설정
                    </button>
                  </form>
                ) : (
                  <button type="button" disabled={ledger.busy} onClick={() => setBookOpen(true)}>
                    기록장 열고 목표 설정
                  </button>
                )}
                <p className="starforce-note" role="status">
                  {goalSaved ||
                    (ledger.name
                      ? `${ledger.name} 기록장 목표에 추가해요. 오늘부터 기록한 사냥·보스 메소가 더해져요.`
                      : '기록장을 열면 이 평균 금액을 목표로 추가할 수 있어요.')}
                </p>
              </div>

              <table className="starforce-table">
                <thead>
                  <tr>
                    <th>단계</th>
                    <th>성공</th>
                    <th>파괴</th>
                    <th>1회 비용</th>
                    <th>이 단계 평균</th>
                  </tr>
                </thead>
                <tbody>
                  {result.steps.map((s) => (
                    <tr key={s.star}>
                      <td>
                        {s.star}→{s.star + 1}성
                      </td>
                      <td>{percent(s.rate.success)}</td>
                      <td>{s.rate.destroy ? percent(s.rate.destroy) : '—'}</td>
                      <td>{meso(s.cost)}</td>
                      <td>{meso(s.meso)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="starforce-note">
            확률은 2025년 3월 개편(실패해도 별이 내려가지 않음, 최대 30성) 기준이에요. 1회 비용은
            수입·목표의 강화 비용 기록과 같은 식이고, 복구 메소는 공개된 복구 표를 레벨에 맞춰
            환산한 추정값이에요. &quot;이 단계 평균&quot;은 파괴 뒤 다시 올라오는 비용까지 넣은
            값이에요.
          </p>
        </section>
      </div>
      {bookOpen && <BookDialog onClose={() => setBookOpen(false)} onOpened={ledger.load} />}
    </main>
  );
}
