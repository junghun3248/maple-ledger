import { useState } from 'react';
import type { Equipment } from '@/contracts/simulator/schema';
import { maxStars, starRates, starRoll, restoreItems, starCost } from './starforce';
import { money } from './PotentialPanel';
export function StarforcePanel({ item }: { item: Equipment }) {
  const max = maxStars(item.level);
  const [discount, setDiscount] = useState(false),
    [mvp, setMvp] = useState(0);
  const priceAt = (star: number) => starCost(item.level, star, safe, discount, mvp);
  const [stars, setStars] = useState(Math.min(item.stars, max)),
    [target, setTarget] = useState(Math.min(Math.max(item.stars + 1, 22), max));
  const [safe, setSafe] = useState(false),
    [reduce, setReduce] = useState(false),
    [guaranteed, setGuaranteed] = useState(false);
  const [trace, setTrace] = useState<number | null>(null),
    [count, setCount] = useState(0),
    [booms, setBooms] = useState(0),
    [spares, setSpares] = useState(0);
  const [history, setHistory] = useState<string[]>([]),
    [message, setMessage] = useState('');
  const [costs, setCosts] = useState<Record<number, string>>({}),
    [spent, setSpent] = useState(0),
    [unknown, setUnknown] = useState(0);
  const [restoreCost, setRestoreCost] = useState(''),
    [sparePrice, setSparePrice] = useState('');
  const rates = stars < max ? starRates(stars, safe, reduce, guaranteed) : null;
  function finalPrice(star: number) {
    const input = costs[star];
    return input?.trim() && Number.isSafeInteger(Number(input)) && Number(input) >= 0
      ? Number(input)
      : priceAt(star);
  }
  function run(limit: number) {
    if (trace !== null || stars >= target) return;
    let s = stars,
      n = 0,
      b = booms,
      total = spent;
    const logs: string[] = [];
    let destroyed: number | null = null;
    while (n < limit && s < target) {
      total += finalPrice(s);
      const previous = s,
        result = starRoll(s, safe, reduce, guaranteed);
      s = result.stars;
      n++;
      logs.unshift(count + n + '회 · ' + previous + '성 → ' + s + '성 · ' + result.result);
      if (result.result === '파괴') {
        b++;
        destroyed = s;
        break;
      }
    }
    setStars(s);
    setCount(count + n);
    setSpent(total);
    setBooms(b);
    setTrace(destroyed);
    setHistory((h) => [...logs.slice(0, 50), ...h].slice(0, 50));
    setMessage(
      destroyed !== null
        ? '장비가 파괴됐어요. 아래에서 복구 방법을 선택해 주세요.'
        : s >= target
          ? '목표에 도달했어요!'
          : limit + '회 제한에 도달했어요. 이어서 진행할 수 있습니다.',
    );
  }
  function restore(full: boolean) {
    if (
      sparePrice.trim() &&
      (!Number.isSafeInteger(Number(sparePrice)) || Number(sparePrice) < 0)
    ) {
      setMessage('장비 가격은 0 이상의 정수로 입력해 주세요.');
      return;
    }
    if (trace === null) return;
    const amount = full ? restoreItems(trace) : 1;
    if (
      full &&
      (!restoreCost.trim() || !Number.isSafeInteger(Number(restoreCost)) || Number(restoreCost) < 0)
    )
      return;
    const price = sparePrice.trim() ? Number(sparePrice) : null;
    setSpent((v) => v + (full ? Number(restoreCost) : 0) + (price === null ? 0 : price * amount));
    if (price === null) setUnknown((v) => v + 1);
    setSpares((v) => v + amount);
    setStars(full ? trace : 12);
    setTrace(null);
    setMessage('복구했어요. 강화를 이어갈 수 있어요.');
  }
  return (
    <section className="sim-panel sim-forge">
      <div className="sim-forge-title">
        <div>
          <small>STAR FORCE LAB</small>
          <h2>스타포스 강화</h2>
        </div>
        <span>
          Lv.{item.level} · {item.slot}
        </span>
      </div>
      <p className="sim-note">
        일반 장비 전용 · 2026년 스타캐치 상시 적용. 슈페리얼·놀장·제로·아스트라·데스티니 등 특수
        강화는 지원하지 않습니다.
      </p>
      <div className="sim-fields">
        <label>
          시작 단계
          <input
            type="number"
            min="0"
            max={max}
            value={stars}
            disabled={count > 0}
            onChange={(e) =>
              setStars(Math.min(max, Math.max(0, Math.trunc(Number(e.target.value)))))
            }
          />
        </label>
        <label>
          목표 단계
          <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
            {Array.from({ length: max }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}성
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sim-fields">
        <label className="sim-check">
          <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} />
          15~17성 파괴 방지
        </label>
        <label className="sim-check">
          <input type="checkbox" checked={reduce} onChange={(e) => setReduce(e.target.checked)} />
          21성 이하 파괴율 30% 감소
        </label>
        <label className="sim-check">
          <input
            type="checkbox"
            checked={guaranteed}
            onChange={(e) => setGuaranteed(e.target.checked)}
          />
          5·10·15성 성공 100% 이벤트
        </label>
      </div>
      <div className="sim-star-display">
        {item.icon && <img src={item.icon} alt={item.name} width={64} height={64} />}
        <h3>{item.name}</h3>
        <span>{trace !== null ? '장비의 흔적' : 'STAR FORCE'}</span>
        <div className="sim-star-progress">
          <strong>★ {stars}</strong>
          <span>→</span>
          <strong className="sim-star-target">★ {target}</strong>
        </div>
        <small>
          목표 {target}성 / 최대 {max}성
        </small>
      </div>
      <div className="sim-summary">
        <span>
          시도 <b>{count}회</b>
        </span>
        <span>
          파괴 <b>{booms}회</b>
        </span>
        <span>
          소모 장비 <b>{spares}개</b>
        </span>
      </div>
      {rates && (
        <div className="sim-rates sim-forge-rates">
          <span>
            성공 <b>{(rates.success * 100).toFixed(3)}%</b>
          </span>
          <span>
            유지 <b>{(rates.stay * 100).toFixed(3)}%</b>
          </span>
          <span>
            파괴 <b>{(rates.boom * 100).toFixed(3)}%</b>
          </span>
        </div>
      )}
      {trace !== null ? (
        <div className="sim-restore">
          <h3>흔적 복구</h3>
          <label>
            같은 장비 1개 가격 (메소)
            <input
              type="number"
              min="0"
              step="1"
              value={sparePrice}
              onChange={(e) => setSparePrice(e.target.value)}
            />
          </label>
          <label>
            {trace}성 복구 메소 (게임 표시값)
            <input
              type="number"
              min="0"
              step="1"
              value={restoreCost}
              onChange={(e) => setRestoreCost(e.target.value)}
            />
          </label>
          <div className="sim-fields">
            <button onClick={() => restore(false)}>장비 1개로 12성 복구</button>
            <button
              onClick={() => restore(true)}
              disabled={
                !restoreCost.trim() ||
                !Number.isSafeInteger(Number(restoreCost)) ||
                Number(restoreCost) < 0
              }
            >
              {restoreItems(trace)}개 + 메소로 {trace}성 복구
            </button>
          </div>
        </div>
      ) : (
        <div className="sim-fields">
          <button className="sim-primary" onClick={() => run(1)} disabled={stars >= target}>
            1회 강화 · {stars < max ? money(finalPrice(stars)) : '최대 단계'}
          </button>
          <button onClick={() => run(1000)} disabled={stars >= target}>
            목표까지 강화 (최대 1,000회)
          </button>
        </div>
      )}
      <p role="status">{message}</p>
      <div className="sim-summary">
        <span>
          누적 비용 (추정)<b>{money(spent)}</b>
        </span>
        <span>
          다음 강화 비용
          <b>{stars < max ? money(finalPrice(stars)) : '최대 단계'}</b>
        </span>
      </div>
      {unknown > 0 && (
        <p>가격을 입력하지 않은 복구 {unknown}회가 있어 장비 구매금액은 합계에서 제외됐어요.</p>
      )}
      <div className="sim-fields">
        <label className="sim-check">
          <input
            type="checkbox"
            checked={discount}
            onChange={(e) => {
              setDiscount(e.target.checked);
              setCosts({});
            }}
          />
          강화 비용 30% 할인
        </label>
        <label>
          MVP 할인
          <select
            value={mvp}
            onChange={(e) => {
              setMvp(Number(e.target.value));
              setCosts({});
            }}
          >
            <option value="0">없음</option>
            <option value="0.03">실버 3%</option>
            <option value="0.05">골드 5%</option>
            <option value="0.1">다이아 이상 10%</option>
          </select>
        </label>
      </div>
      <details>
        <summary>비용 입력 · 합계 확인</summary>
        <p>
          일반 KMS 장비 비용 추정식으로 자동 계산합니다. 실제 게임 비용과 다르면 단계별 최종 비용을
          입력해 덮어쓸 수 있어요. 파괴 방지 추가 비용은 기본 비용의 200%이며 할인 대상이 아닙니다.
          PC방·특수 장비 혜택은 자동 적용하지 않습니다.
        </p>
        <div className="sim-cost-grid">
          {Array.from({ length: max }, (_, i) => (
            <label key={i}>
              {i} → {i + 1}성
              <input
                type="number"
                min="0"
                step="1"
                value={costs[i] || ''}
                placeholder={String(priceAt(i))}
                onChange={(e) => setCosts({ ...costs, [i]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <p>
          누적 비용 (추정): <b>{money(spent)}</b> · 가격 미입력 복구 {unknown}회{' '}
          {unknown > 0 && '(전체 비용이 아닙니다)'}
        </p>
      </details>
      <details>
        <summary>최근 강화 기록 ({history.length}개)</summary>
        <ol className="sim-history">
          {history.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}
