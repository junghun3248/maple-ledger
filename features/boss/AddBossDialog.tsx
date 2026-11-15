'use client';
import { useState } from 'react';
import type { BossDefinition, Run } from '@/contracts/boss/state';
import { Dialog } from '@/components/ledger/Dialog';

export function AddBossDialog({
  catalog,
  monthly = false,
  date,
  onAdd,
  onClose,
}: {
  catalog: BossDefinition[];
  monthly?: boolean;
  date: string;
  onAdd: (r: Run) => boolean;
  onClose: () => void;
}) {
  const [id, setId] = useState(catalog[0]?.id || ''),
    [party, setParty] = useState(1),
    [name, setName] = useState(''),
    [difficulty, setDifficulty] = useState('직접 입력'),
    [period, setPeriod] = useState<'week' | 'month'>('week'),
    [price, setPrice] = useState('0');
  const b = catalog.find((b) => b.id === id);
  return (
    <Dialog title={monthly ? '월간 보스 추가' : '개별 보스 추가'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!b && (monthly || !name.trim())) return;
          if (
            onAdd({
              id: crypto.randomUUID(),
              name: b?.name || name.trim(),
              difficulty: b?.difficulty || difficulty,
              period: b?.period || period,
              date,
              party,
              crystal: b ? String(b.price) : price,
              fee: 500,
              cleared: true,
              drops: [],
            })
          )
            onClose();
        }}
      >
        <label>
          보스
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {catalog.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.difficulty}
              </option>
            ))}
            {!monthly && <option value="custom">직접 입력</option>}
          </select>
        </label>
        {!b && (
          <>
            <label>
              보스 이름
              <input
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              난이도
              <input
                required
                maxLength={20}
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              />
            </label>
            <label>
              주기
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value === 'month' ? 'month' : 'week')}
              >
                <option value="week">주간</option>
                <option value="month">월간</option>
              </select>
            </label>
            <label>
              결정석 가격
              <input
                required
                pattern="[0-9]{1,15}"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          파티 인원
          <select value={party} onChange={(e) => setParty(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button className="primary">추가</button>
      </form>
    </Dialog>
  );
}
