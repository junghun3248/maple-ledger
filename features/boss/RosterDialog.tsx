'use client';
import { useMemo, useState } from 'react';
import Image from 'next/image';
import type { BossDefinition, Character, Run, RosterChoice } from '@/contracts/boss/state';
import { Dialog } from '@/components/ledger/Dialog';
import { weekKey, money } from './model';
import { presets, selectionsFor } from './presets';
export function RosterDialog({
  character,
  catalog,
  date,
  saved,
  onSavePreset,
  onApply,
  onClose,
}: {
  character: Character;
  catalog: BossDefinition[];
  date: string;
  saved: { name: string; selection: RosterChoice[] }[];
  onSavePreset: (name: string, selection: RosterChoice[]) => void;
  onApply: (runs: Run[]) => boolean;
  onClose: () => void;
}) {
  const week = weekKey(date);
  const current = useMemo(
    () => character.runs.filter((r) => r.period === 'week' && weekKey(r.date) === week),
    [character.runs, week],
  );
  const [selection, setSelection] = useState(current),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [party, setParty] = useState(1),
    [preset, setPreset] = useState('builtin-0');
  function fromBoss(b: BossDefinition, n = party): Run {
    const old = current.find((r) => r.name === b.name);
    return {
      ...(old || { id: crypto.randomUUID(), date, fee: 500, cleared: true, drops: [] }),
      name: b.name,
      difficulty: b.difficulty,
      soloRatio: old?.difficulty === b.difficulty ? old.soloRatio : undefined,
      ratioMinutes: old?.difficulty === b.difficulty ? old.ratioMinutes : undefined,
      period: b.period,
      party: old?.party || n,
      crystal: old?.difficulty === b.difficulty ? old.crystal : String(b.price),
    };
  }
  function choose(b: BossDefinition) {
    const old = selection.find((r) => r.name === b.name);
    if (old?.difficulty === b.difficulty) {
      setSelection(selection.filter((r) => r !== old));
      return;
    }
    if (!old && selection.length >= 12) {
      setError('주간 보스는 최대 12마리까지 선택하세요.');
      return;
    }
    const r = fromBoss(b);
    setSelection(
      old
        ? selection.map((x) => (x === old ? { ...r, party: old.party, drops: old.drops } : x))
        : [...selection, r],
    );
    setError('');
  }
  const groups = useMemo(() => {
    const byName = new Map<string, BossDefinition[]>();
    for (const boss of catalog) {
      const group = byName.get(boss.name);
      if (group) group.push(boss);
      else byName.set(boss.name, [boss]);
    }
    const names = new Set(
      catalog.filter((b) => b.period === 'week' && b.name.includes(search)).map((b) => b.name),
    );
    return [...names].map((name) => [name, byName.get(name)!] as const);
  }, [catalog, search]);
  const selectedByName = useMemo(() => new Map(selection.map((r) => [r.name, r])), [selection]);
  return (
    <Dialog title={character.name + ' · 주간 보스 구성'} onClose={onClose}>
      <div className="preset-tools">
        <label>
          빠른 구성
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {presets.map((p, i) => (
              <option value={'builtin-' + i} key={'b' + i}>
                {p.name}
              </option>
            ))}
            {saved.map((p, i) => (
              <option value={'saved-' + i} key={'s' + i}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          onClick={() => {
            try {
              const [kind, index] = preset.split('-');
              const choices: RosterChoice[] =
                kind === 'builtin'
                  ? selectionsFor(presets[Number(index)], catalog, party)
                  : saved[Number(index)].selection;
              const rows = choices.map((c) => {
                const b = catalog.find((b) => b.id === c.bossId);
                if (!b) throw Error('현재 목록에 없는 보스가 있어요.');
                return { ...fromBoss(b, c.party), party: c.party };
              });
              setSelection(rows);
              setError('');
            } catch (e) {
              setError(e instanceof Error ? e.message : '구성을 확인해 주세요.');
            }
          }}
        >
          구성 불러오기
        </button>
        <button
          className="quiet"
          onClick={() => {
            const name = prompt('프리셋 이름');
            if (!name?.trim()) return;
            onSavePreset(
              name.trim(),
              selection.flatMap((r) => {
                const b = catalog.find((b) => b.name === r.name && b.difficulty === r.difficulty);
                return b ? [{ name: r.name, bossId: b.id, party: r.party }] : [];
              }),
            );
          }}
        >
          내 프리셋 저장
        </button>
      </div>
      <div className="fields">
        <label>
          보스 검색
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          인원 일괄 변경
          <select
            value={party}
            onChange={(e) => {
              const n = Number(e.target.value);
              setParty(n);
              setSelection(selection.map((r) => ({ ...r, party: n })));
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {selection.length} / 12마리 · 결정석{' '}
        {money(selection.reduce((n, r) => n + BigInt(r.crystal) / BigInt(r.party), 0n))} 메소
      </p>
      <button className="quiet" onClick={() => setSelection([])}>
        선택 비우기
      </button>
      <div className="boss-grid">
        {groups.map(([name, bosses]) => (
          <article className={'boss-card' + (selectedByName.has(name) ? ' chosen' : '')} key={name}>
            {bosses[0].icon && (
              <Image
                unoptimized
                src={catalog.find((b) => b.name === name)?.icon || ''}
                width={44}
                height={44}
                alt=""
              />
            )}
            <strong>{name}</strong>
            {selectedByName.get(name) && (
              <label>
                인원
                <select
                  aria-label={name + ' 인원'}
                  value={selection.find((r) => r.name === name)?.party}
                  onChange={(e) =>
                    setSelection(
                      selection.map((r) =>
                        r.name === name ? { ...r, party: Number(e.target.value) } : r,
                      ),
                    )
                  }
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}인
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="difficulty-chips">
              {bosses.map((b) => (
                <button
                  key={b.id}
                  className="difficulty-chip"
                  data-level={b.difficulty}
                  aria-pressed={selectedByName.get(name)?.difficulty === b.difficulty}
                  onClick={() => choose(b)}
                >
                  {b.difficulty}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      <p role="alert">{error}</p>
      <button
        className="primary"
        onClick={() => {
          if (
            current.some((r) => !selection.some((n) => n.name === r.name)) &&
            !confirm('선택에서 뺀 보스의 이번 주 기록도 제거할까요?')
          )
            return;
          if (onApply([...character.runs.filter((r) => !current.includes(r)), ...selection]))
            onClose();
          else setError('기록 수 한도를 확인해 주세요.');
        }}
      >
        정산표에 적용
      </button>
    </Dialog>
  );
}
export { AddBossDialog } from './AddBossDialog';
