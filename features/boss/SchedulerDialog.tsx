'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Dialog } from '@/components/ledger/Dialog';
import { ledgerRequest, errorMessage } from '@/lib/ledger/api';
import { money, dateKey } from './model';
import type { BossDefinition, BossState } from '@/contracts/boss/state';
import { bossStateSchema } from '@/contracts/boss/schema';
import { schedulerSelection } from './scheduler';
import { mergeCharacterBatch } from './scheduler';
import {
  nexonCharacterSchema as characterSchema,
  schedulerSchema,
  type NexonCharacter,
} from '@/contracts/boss/nexon';
type Draft = {
  chosen: NexonCharacter;
  selection: { selected: BossDefinition[]; unknown: string[] };
  date: string;
};
const storage = 'maple-boss-nexon-api-key';
export function SchedulerDialog({
  state,
  catalog,
  onApply,
  onClose,
}: {
  state: BossState;
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
    [characters, setCharacters] = useState<NexonCharacter[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  const epoch = useRef(0);
  const autoLoaded = useRef(false);
  const load = useCallback(async () => {
    const token = ++epoch.current;
    setBusy(true);
    setDrafts([]);
    setCharacters([]);
    setSelected([]);
    setStatus('캐릭터 조회 중…');
    try {
      const { characters: all } = z
        .object({ characters: z.array(characterSchema) })
        .parse(await ledgerRequest('nexon-characters', { apiKey: key }));
      try {
        localStorage.setItem(storage, key.trim());
      } catch {}
      const qualified: NexonCharacter[] = [];
      let failed = 0;
      for (let i = 0; i < all.length; i += 8) {
        if (token !== epoch.current) return;
        setStatus(`전투력 확인 중 · ${i} / ${all.length}명`);
        const group = all.slice(i, i + 8);
        try {
          const response = z
            .object({
              results: z.array(
                z.object({
                  ocid: z.string(),
                  combatPower: z.number().optional(),
                  error: z.string().optional(),
                }),
              ),
            })
            .parse(
              await ledgerRequest('nexon-powers', { apiKey: key, ocids: group.map((c) => c.ocid) }),
            );
          for (const c of group) {
            const r = response.results.find((r) => r.ocid === c.ocid);
            if (!r || r.error || r.combatPower === undefined) {
              failed++;
              continue;
            }
            if (r.combatPower > 10000000) qualified.push({ ...c, combatPower: r.combatPower });
          }
        } catch {
          failed += group.length;
        }
      }
      if (token !== epoch.current) return;
      setCharacters(qualified.sort((a, b) => (b.combatPower || 0) - (a.combatPower || 0)));
      setStatus(
        `전투력 1,000만 초과 ${qualified.length}명` +
          (failed ? ` · 조회 실패 ${failed}명, 다시 조회할 수 있어요.` : ''),
      );
    } catch (e) {
      if (token === epoch.current) setStatus(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [key]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!autoLoaded.current) {
        autoLoaded.current = true;
        if (key) void load();
      }
    }, 0);
    const control = epoch;
    return () => {
      clearTimeout(timer);
      control.current++;
    };
  }, [key, load]);
  async function loadBosses() {
    const token = ++epoch.current;
    setBusy(true);
    setDrafts([]);
    const next: Draft[] = [];
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
              chosen: c,
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
      setBusy(false);
    }
  }
  function selection(ids: string[]) {
    setSelected(ids.slice(0, 36));
    setDrafts([]);
  }
  return (
    <Dialog
      title="API로 캐릭터와 주간 보스 가져오기"
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
          void load();
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
              setCharacters([]);
              selection([]);
            }}
          />
        </label>
        <button className="primary" disabled={busy}>
          내 캐릭터 조회
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
          setCharacters([]);
          selection([]);
        }}
      >
        저장한 API 키 삭제 / 변경
      </button>
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
            선택한 {selected.length}명의 주간 보스 가져오기
          </button>
        </>
      )}
      {drafts.map((d) => (
        <section className="scheduler-batch" key={d.chosen.ocid}>
          <h3>
            {d.chosen.name} · {d.selection.selected.length}마리
          </h3>
          <p>
            {d.selection.selected.map((b) => b.name + ' ' + b.difficulty).join(' / ') ||
              '캐릭터만 추가'}
          </p>
          {d.selection.unknown.length > 0 && (
            <p>가격표에 없어 제외: {d.selection.unknown.join(', ')}</p>
          )}
        </section>
      ))}
      {drafts.length > 0 && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            try {
              const result = mergeCharacterBatch(state, drafts);
              onApply(bossStateSchema.parse(result.state), drafts[0].date);
              onClose();
            } catch (e) {
              setStatus(errorMessage(e));
            }
          }}
        >
          {drafts.length}명 정산표에 한 번에 추가
        </button>
      )}
    </Dialog>
  );
}
