'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { Run, Drop, ItemDefinition } from '@/contracts/boss/state';
import { Dialog } from '@/components/ledger/Dialog';
import { money, settle } from './model';
import { BOX_REWARDS as rewards, dropsFor, isBoxReward, toggleDrop, toggleBoxReward } from './loot';
export function RunDialog({
  run,
  items,
  rules,
  update,
  remove,
  onClose,
}: {
  run: Run;
  items: ItemDefinition[];
  rules: Record<string, string[]>;
  update: (run: Run) => void;
  remove: () => void;
  onClose: () => void;
}) {
  const [box, setBox] = useState(false),
    [all, setAll] = useState(false),
    [search, setSearch] = useState(''),
    [custom, setCustom] = useState('');
  const suggested = all
    ? items.filter((i) => i.name.includes(search))
    : dropsFor(run, items, rules).filter((d) => !isBoxReward(d));
  if (run.drops.some(isBoxReward) && !suggested.some((d) => d.id === 'item-38')) {
    const chest = items.find((i) => i.id === 'item-38');
    if (chest) suggested.push(chest);
  }
  function toggle(item: ItemDefinition, fromBox = false) {
    const next = structuredClone(run);
    const changed = fromBox
      ? toggleBoxReward(next, item.id, items)
      : toggleDrop(next, item.id, [...items, item], rules);
    if (changed) update(next);
  }
  function field(id: string, patch: Partial<Drop>) {
    update({ ...run, drops: run.drops.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  }
  const total = settle(run);
  return (
    <Dialog title={run.name + ' · ' + run.difficulty} onClose={onClose} className="boss-detail">
      <label>
        파티 인원
        <select
          value={run.party}
          onChange={(e) => update({ ...run, party: Number(e.target.value) })}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}인
            </option>
          ))}
        </select>
      </label>
      <details className="raid-settings">
        <summary>결정석 가격 · 수수료 설정</summary>
        <label>
          결정석 가격
          <input
            value={run.crystal}
            inputMode="numeric"
            onChange={(e) => {
              const v = e.target.value.replace(/,/g, '');
              if (/^\d{0,15}$/.test(v)) update({ ...run, crystal: v || '0' });
            }}
          />
        </label>
        <label>
          아이템 수수료
          <select value={run.fee} onChange={(e) => update({ ...run, fee: Number(e.target.value) })}>
            {[...new Set([0, 300, 500, run.fee])].map((n) => (
              <option key={n} value={n}>
                {n / 100}%
              </option>
            ))}
          </select>
        </label>
      </details>
      <div className="loot-heading">
        <b>획득 아이템 · 먹었으면 클릭</b>
        <button className="secondary" onClick={() => setAll(!all)}>
          {all ? '추천 목록' : '＋ 더 추가'}
        </button>
      </div>
      {all && (
        <input
          placeholder="아이템 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="loot-strip">
        {suggested.map((item) => (
          <button
            key={item.id}
            className="loot-tile"
            aria-pressed={
              item.id === 'item-38'
                ? run.drops.some((d) => d.id.startsWith('box-') && d.selected)
                : run.drops.some((d) => d.id === item.id && d.selected)
            }
            onClick={() => (item.id === 'item-38' ? setBox(true) : toggle(item))}
          >
            {item.icon ? (
              <Image src={item.icon} alt="" width={36} height={36} unoptimized />
            ) : (
              <span className="item-fallback">{item.name.slice(0, 2)}</span>
            )}
            <span>{item.id === 'item-38' ? '칠흑 상자 · 내용물 선택' : item.name}</span>
          </button>
        ))}
      </div>
      {all && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) {
              toggle({ id: crypto.randomUUID(), name: custom.trim(), icon: '' });
              setCustom('');
            }
          }}
        >
          <label>
            직접 추가
            <input maxLength={80} value={custom} onChange={(e) => setCustom(e.target.value)} />
          </label>
          <button className="secondary">아이템 추가</button>
        </form>
      )}
      <div className="drops">
        {run.drops
          .filter((d) => d.selected)
          .map((d) => (
            <div key={d.id} className="drop">
              <button
                className="item-icon"
                onClick={() => field(d.id, { selected: false })}
                aria-label={d.name + ' 획득 취소'}
              >
                {d.icon && <Image src={d.icon} alt="" width={36} height={36} unoptimized />}✓
              </button>
              <div>{d.name}</div>
              <label>
                수량
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={d.qty}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 1 && n <= 99) field(d.id, { qty: n });
                  }}
                />
              </label>
              <label>
                개당 판매가 · 메소
                <input
                  inputMode="numeric"
                  value={d.price}
                  onChange={(e) => {
                    const v = e.target.value.replace(/,/g, '');
                    if (/^\d{0,15}$/.test(v)) field(d.id, { price: v });
                  }}
                />
              </label>
            </div>
          ))}
      </div>
      <div className="run-total">
        <div>
          결정석 {money(total.crystal)} + 물욕템 {money(total.loot)}
          <small>
            결정석 수수료 없음 · 아이템 {run.fee / 100}% · {run.party}인 분배
            {total.missing ? ' · 판매가 미입력 제외' : ''}
          </small>
        </div>
        <strong>내 몫 {money(total.total)} 메소</strong>
      </div>
      <button className="quiet" onClick={remove}>
        이 보스 기록 삭제
      </button>
      {box && (
        <Dialog title="칠흑 상자에서 나온 아이템" onClose={() => setBox(false)}>
          <div className="catalog">
            {items
              .filter((i) => rewards.includes(i.id))
              .map((i) => (
                <button
                  className="item-icon"
                  key={i.id}
                  aria-pressed={run.drops.some((d) => d.id === 'box-' + i.id && d.selected)}
                  onClick={() => toggle(i, true)}
                >
                  <Image src={i.icon} alt="" width={36} height={36} unoptimized />
                  {i.name}
                </button>
              ))}
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}
