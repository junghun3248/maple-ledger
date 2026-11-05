'use client';
import { useEffect, useState } from 'react';
import { Gift, Sparkles } from 'lucide-react';
import { boutique } from './data/boutique';
import {
  amounts,
  expectation,
  meso,
  openBoxes,
  restorePrices,
  validPrice,
  validateBox,
} from './model';
import '@/components/ledger/ledger.css';
import '@/features/simulator/simulator.css';
import './cash.css';
const box = boutique;
validateBox(box);
const storage = 'maple-cash-prices:v1:' + box.id;
export function CashSimulator() {
  const [prices, setPrices] = useState(() => restorePrices(box, null)),
    [ready, setReady] = useState(false),
    [storageIssue, setStorageIssue] = useState(false);
  const [count, setCount] = useState<(typeof amounts)[number]>(10),
    [result, setResult] = useState<ReturnType<typeof openBoxes> | null>(null),
    [roll, setRoll] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setPrices(restorePrices(box, JSON.parse(localStorage.getItem(storage) || 'null')));
      } catch {
        setStorageIssue(true);
      }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storage, JSON.stringify(prices));
      } catch {
        setStorageIssue(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [prices, ready]);
  const [search, setSearch] = useState(''),
    [sort, setSort] = useState('unit');
  const visibleItems = box.items.filter((i) =>
    i.name.replace(/\s/g, '').includes(search.trim().replace(/\s/g, '')),
  );
  const drops = result
    ? [...result.drops].sort((a, b) =>
        sort === 'total'
          ? b.price * b.quantity - a.price * a.quantity
          : sort === 'qty'
            ? b.quantity - a.quantity
            : b.price - a.price,
      )
    : [];
  const ev = expectation(box, prices);
  const featured = result?.drops.find((i) => i.price >= 100000);
  return (
    <main className="sim-page cash-page">
      <header className="sim-header">
        <div>
          <h1>캐시 뽑기 시뮬레이터</h1>
        </div>
        <a href="/simulator">강화 시뮬레이터 ↗</a>
      </header>
      <div className="cash-layout">
        <section className="sim-panel cash-opening">
          <Gift size={42} />
          <h2>{box.name}</h2>
          <p>
            상자 1개에 {box.ticket} {box.ticketsPerBox}장
          </p>
          <label>
            티켓 1장 가격 (만 메소)
            <input
              type="number"
              min="0"
              max="1000000000"
              disabled={!ready}
              value={prices.ticket}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (validPrice(n)) setPrices((p) => ({ ...p, ticket: n }));
              }}
            />
          </label>
          <div className="cash-amounts" aria-label="개봉 횟수">
            {amounts.map((n) => (
              <button key={n} aria-pressed={count === n} onClick={() => setCount(n)}>
                {n.toLocaleString()}회
              </button>
            ))}
          </div>
          <button
            className="sim-primary"
            disabled={!ready}
            onClick={() => {
              setResult(openBoxes(box, prices, count));
              setRoll((v) => v + 1);
            }}
          >
            {count.toLocaleString()}회 개봉 · {meso(ev.cost * count)} 메소
          </button>
        </section>
        <section className="sim-panel">
          <h2>1회 개봉 기대값</h2>
          <dl className="cash-stats">
            {[
              ['개봉 비용', meso(ev.cost)],
              ['기대 가치', meso(ev.value)],
              ['기대 순손익', meso(ev.net)],
              ['예상 수익률', ev.roi === null ? '비용 0 · 계산 불가' : ev.roi.toFixed(2) + '%'],
            ].map(([label, v]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p>입력한 시세 기준 · 단위 메소</p>
        </section>
      </div>
      {result && (
        <section className="sim-panel cash-result" aria-live="polite">
          <h2>최근 {result.count.toLocaleString()}회 개봉 결과</h2>
          {featured && (
            <div className="cash-hit" key={roll}>
              <Sparkles /> 고가 아이템 획득 · {featured.name} ({meso(featured.price)} 메소)
            </div>
          )}
          <dl className="cash-stats">
            {[
              ['총 획득 가치', result.value],
              ['총 비용', result.cost],
              ['순손익', result.net],
            ].map(([label, v]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{meso(Number(v))}</dd>
              </div>
            ))}
          </dl>
          <label className="cash-sort">
            결과 정렬
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="unit">개당 시세순</option>
              <option value="total">총 가치순</option>
              <option value="qty">획득 수량순</option>
            </select>
          </label>
          <ul>
            {drops.map((i) => (
              <li key={i.name}>
                <span className={i.probability <= 2 ? 'cash-rare' : 'cash-common'}>{i.name}</span>
                <b>× {i.quantity}</b>
                <span>{meso(i.price * i.quantity)} 메소</span>
              </li>
            ))}
          </ul>
          <small>개봉 당시 입력한 가격 기준</small>
        </section>
      )}
      <details className="sim-panel cash-table">
        <summary>아이템 확률·시세 수정 ({box.items.length}종)</summary>
        <p>첨부 데이터 기준 · 확률 합계 100% · 시세 단위 만 메소</p>
        {storageIssue && <p role="status">이 기기의 가격 저장 기능을 확인해 주세요.</p>}
        <label>
          아이템 검색
          <input
            type="search"
            placeholder="이름으로 시세 찾기"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {!visibleItems.length && <p role="status">일치하는 아이템이 없습니다.</p>}
        <table>
          <thead>
            <tr>
              <th>아이템</th>
              <th>확률</th>
              <th>시세 (만)</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((i) => (
              <tr key={i.name}>
                <td className={i.probability <= 2 ? 'cash-rare' : 'cash-common'}>{i.name}</td>
                <td>{i.probability}%</td>
                <td>
                  <input
                    aria-label={i.name + ' 가격 (만 메소)'}
                    type="number"
                    min="0"
                    max="1000000000"
                    value={prices.items[i.name]}
                    disabled={!ready}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (validPrice(n))
                        setPrices((p) => ({ ...p, items: { ...p.items, [i.name]: n } }));
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </main>
  );
}
