'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { Dialog } from '@/components/ledger/Dialog';
import { ledgerRequest, errorMessage } from '@/lib/ledger/api';
import { money, dateKey } from './model';
import { loadWorldCharacters } from './world-characters';
import type { BossDefinition, BossState } from '@/contracts/boss/state';
import { bossStateSchema } from '@/contracts/boss/schema';
import { schedulerSelection } from './scheduler';
import { SchedulerPreview, type SchedulerDraft } from './SchedulerPreview';
import { forBoardDate, mergeCharacterBatch } from './scheduler';
import { NEXON_KEY_STORAGE as storage } from './auto-sync';
import {
  nexonCharacterSchema as characterSchema,
  schedulerSchema,
  type NexonCharacter,
} from '@/contracts/boss/nexon';
export function SchedulerDialog({
  state,
  targetDate,
  catalog,
  onApply,
  onClose,
}: {
  state: BossState;
  targetDate: string;
  catalog: BossDefinition[];
  onApply: (state: BossState, date: string) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(() => {
      try {
        return typeof window === 'undefined' ? '' : localStorage.getItem(storage) || '';
      } catch {
        return '';
      }
    }),
    [roster, setRoster] = useState<NexonCharacter[]>([]),
    [world, setWorld] = useState(''),
    [characters, setCharacters] = useState<NexonCharacter[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [drafts, setDrafts] = useState<SchedulerDraft[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  const worlds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of roster) counts.set(c.world, (counts.get(c.world) || 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b, 'ko'));
  }, [roster]);
  const epoch = useRef(0);
  const autoLoaded = useRef(false);
  const loadWorlds = useCallback(async () => {
    const token = ++epoch.current;
    setBusy(true);
    setRoster([]);
    setWorld('');
    setDrafts([]);
    setCharacters([]);
    setSelected([]);
    setStatus('월드 목록 조회 중…');
    try {
      const { characters: all } = z
        .object({ characters: z.array(characterSchema) })
        .parse(await ledgerRequest('nexon-characters', { apiKey: key }));
      if (token !== epoch.current) return;
      setRoster(all);
      try {
        localStorage.setItem(storage, key.trim());
        const savedWorld = localStorage.getItem('maple-boss-nexon-world');
        if (savedWorld && all.some((c) => c.world === savedWorld)) setWorld(savedWorld);
      } catch {}
      setStatus(
        all.length ? '월드를 선택한 뒤 캐릭터를 불러와 주세요.' : '조회 가능한 캐릭터가 없어요.',
      );
    } catch (e) {
      if (token === epoch.current) setStatus(errorMessage(e));
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }, [key]);
  async function loadCharacters() {
    if (!world || busy) return;
    const token = ++epoch.current;
    setBusy(true);
    setDrafts([]);
    setCharacters([]);
    setSelected([]);
    try {
      try {
        localStorage.setItem('maple-boss-nexon-world', world);
      } catch {}
      const { qualified, failed, errors } = await loadWorldCharacters(roster, world, key, {
        active: () => token === epoch.current,
        progress: (done, total) => setStatus(`${world} 전투력 확인 중 · ${done} / ${total}명`),
      });
      if (token !== epoch.current) return;
      setCharacters(qualified.sort((a, b) => (b.combatPower || 0) - (a.combatPower || 0)));
      setStatus(
        `${world} · 전투력 1,000만 초과 ${qualified.length}명` +
          (failed ? ` · 조회 실패 ${failed}명. ${errors.slice(0, 2).join(' ')}` : ''),
      );
    } catch (e) {
      if (token === epoch.current) setStatus(errorMessage(e));
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!autoLoaded.current) {
        autoLoaded.current = true;
        if (key) void loadWorlds();
      }
    }, 0);
    const control = epoch;
    return () => {
      clearTimeout(timer);
      control.current++;
    };
  }, [key, loadWorlds]);
  async function loadBosses() {
    const token = ++epoch.current;
    setBusy(true);
    setDrafts([]);
    const next: SchedulerDraft[] = [];
    const failed: string[] = [];
    try {
      const chosen = characters.filter((c) => selected.includes(c.ocid));
      for (let i = 0; i < chosen.length; i += 8) {
        if (token !== epoch.current) return;
        setStatus(`보스 조회 중 · ${i} / ${chosen.length}명`);
        const group = chosen.slice(i, i + 8);
        try {
          const response = z.object({ results: z.array(schedulerSchema) }).parse(
            await ledgerRequest('nexon-schedulers', {
              apiKey: key,
              ocids: group.map((c) => c.ocid),
            }),
          );
          for (const c of group) {
            const r = response.results.find((r) => r.ocid === c.ocid);
            if (!r || r.error || !r.bosses) {
              failed.push(c.name);
              continue;
            }
            next.push({
              chosen: { ...c, image: r.image },
              selection: schedulerSelection(r.bosses, catalog),
              date: r.date?.slice(0, 10) || dateKey(),
            });
          }
        } catch {
          failed.push(...group.map((c) => c.name));
        }
      }
      if (token !== epoch.current) return;
      setDrafts(next);
      setStatus(
        `${next.length}명 조회 완료` + (failed.length ? ` · 실패: ${failed.join(', ')}` : ''),
      );
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  function selection(ids: string[]) {
    setSelected(ids.slice(0, 36));
    setDrafts([]);
  }
  return (
    <Dialog
      title="API로 캐릭터와 주간·월간 보스 가져오기"
      onClose={() => {
        epoch.current++;
        onClose();
      }}
    >
      <details>
        <summary>API 키 발급·입력 방법</summary>
        <a href="https://openapi.nexon.com/ko/" target="_blank" rel="noopener noreferrer">
          넥슨 Open API 열기 ↗
        </a>
        <ol>
          <li>캐릭터가 있는 넥슨 계정으로 로그인</li>
          <li>내 애플리케이션에서 메이플스토리 등록</li>
          <li>발급한 API Key를 아래에 입력</li>
          <li>게임 내 스케줄러에 가는 보스를 등록하고 가져오기</li>
        </ol>
      </details>
      <p className="muted">
        조회한 키는 이 브라우저에서 재사용합니다. 서버 기록장에는 저장하지 않아요.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void loadWorlds();
        }}
      >
        <label>
          넥슨 Open API 키
          <input
            type="password"
            required
            value={key}
            disabled={busy}
            onChange={(e) => {
              epoch.current++;
              setKey(e.target.value);
              setRoster([]);
              setWorld('');
              setCharacters([]);
              setStatus('');
              selection([]);
            }}
          />
        </label>
        <button className="primary" disabled={busy}>
          월드 목록 불러오기
        </button>
      </form>
      <button
        className="quiet"
        disabled={busy}
        onClick={() => {
          try {
            localStorage.removeItem(storage);
          } catch {}
          setKey('');
          setRoster([]);
          setWorld('');
          setStatus('');
          setCharacters([]);
          selection([]);
        }}
      >
        저장한 API 키 삭제 / 변경
      </button>
      {roster.length > 0 && (
        <section className="scheduler-world-selection" aria-label="조회할 월드 선택">
          <label>
            월드 선택
            <select
              value={world}
              disabled={busy}
              onChange={(e) => {
                epoch.current++;
                setWorld(e.target.value);
                setCharacters([]);
                selection([]);
                setStatus('선택한 월드의 캐릭터만 전투력을 조회합니다.');
              }}
            >
              <option value="">월드를 선택해 주세요</option>
              {worlds.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count}명)
                </option>
              ))}
            </select>
          </label>
          <p className="muted">선택한 월드만 상세 조회 · 전투력 1,000만 초과 캐릭터 표시</p>
          <button
            className="primary"
            disabled={busy || !world}
            onClick={() => void loadCharacters()}
          >
            {world ? `${world} 캐릭터 불러오기` : '월드 선택 후 캐릭터 불러오기'}
          </button>
        </section>
      )}
      <p role="status">{status}</p>
      {characters.length > 0 && (
        <>
          <p className="muted">전투력 1,000만 초과만 표시 · 여러 명 선택 가능</p>
          <div className="selection-tools">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => selection(characters.map((c) => c.ocid))}
            >
              전체 선택
            </button>
            <button className="quiet" disabled={busy} onClick={() => selection([])}>
              선택 해제
            </button>
            <b>{selected.length}명 선택</b>
          </div>
          <div className="nexon-character-cards">
            {characters.map((c) => (
              <button
                key={c.ocid}
                className="nexon-choice"
                disabled={busy}
                aria-pressed={selected.includes(c.ocid)}
                onClick={() =>
                  selection(
                    selected.includes(c.ocid)
                      ? selected.filter((id) => id !== c.ocid)
                      : [...selected, c.ocid],
                  )
                }
              >
                <strong>
                  {selected.includes(c.ocid) ? '✓ ' : ''}
                  {c.name}
                </strong>
                <small>
                  Lv.{c.level} · {c.world}
                </small>
                <small>{c.job}</small>
                <b className="combat-power">전투력 {money(c.combatPower || 0)}</b>
              </button>
            ))}
          </div>
          <button
            className="primary"
            disabled={busy || !selected.length}
            onClick={() => void loadBosses()}
          >
            선택한 {selected.length}명의 주간·월간 보스 가져오기
          </button>
        </>
      )}
      {drafts.length > 0 && (
        <div className="boss-import-action">
          <strong>
            조회 완료 · {drafts.reduce((n, d) => n + d.selection.selected.length, 0)}마리
          </strong>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              try {
                const result = mergeCharacterBatch(
                  state,
                  drafts.map((d) => forBoardDate(d, targetDate)),
                );
                onApply(bossStateSchema.parse(result.state), targetDate);
                onClose();
              } catch (e) {
                setStatus(errorMessage(e));
              }
            }}
          >
            {drafts.length}명 정산표에 한 번에 추가
          </button>
        </div>
      )}
      {drafts.map((draft) => (
        <SchedulerPreview key={draft.chosen.ocid} draft={draft} targetDate={targetDate} />
      ))}
    </Dialog>
  );
}
