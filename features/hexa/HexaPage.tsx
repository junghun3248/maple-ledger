'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { PageHeading } from '@/components/ledger/PageHeading';
import { BookDialog } from '@/components/ledger/BookDialog';
import { useAssetLedger } from '@/features/income/useAssetLedger';
import { koreaDate } from '@/lib/ledger/korea-date';
import { nexonCharacterSchema, type NexonCharacter } from '@/contracts/boss/nexon';
import { hexaResponseSchema } from '@/contracts/hexa/schema';
import { NEXON_KEY_STORAGE } from '@/features/boss/auto-sync';
import { errorMessage, ledgerRequest } from '@/lib/ledger/api';
import { money } from '@/lib/ledger/format';
import { coreKinds, kindLabels, MAX_LEVEL } from './costs';
import {
  costBetween,
  fragmentMeso,
  kindOf,
  planTotal,
  reachableLevel,
  shortfall,
  type PlanRow,
} from './model';
import './hexa.css';

const PRICE_STORAGE = 'maple-hexa-fragment-price';
const CHARACTER_STORAGE = 'maple-hexa-character';
const planStorage = (ocid: string) => 'maple-hexa-plan:' + ocid;
const DEFAULT_PRICE = '6000000';
const HEXA_LEVEL = 260;

const planSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(coreKinds),
    level: z.number(),
    target: z.number(),
  }),
);

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
const level = (value: string) => Math.min(MAX_LEVEL, Math.max(0, Number(value) || 0));
const count = (value: string) => (/^\d{1,9}$/.test(value) ? Number(value) : 0);
const number = (value: number) => value.toLocaleString('ko-KR');

/** 헥사 계산기: 넥슨 API로 현재 코어 레벨을 불러와 목표 레벨까지 필요한 솔 에르다·조각·메소를 계산한다. */
export function HexaPage() {
  const [key, setKey] = useState(''),
    [characters, setCharacters] = useState<NexonCharacter[]>([]),
    [ocid, setOcid] = useState(''),
    [rows, setRows] = useState<PlanRow[]>([]),
    [price, setPrice] = useState(DEFAULT_PRICE),
    [ownedSol, setOwnedSol] = useState(''),
    [ownedFragments, setOwnedFragments] = useState(''),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  const epoch = useRef(0);
  // 목표는 이 화면에서 바로 기록장에 저장한다(수입·목표 화면으로 이동하지 않음).
  const ledger = useAssetLedger();
  const [bookOpen, setBookOpen] = useState(false),
    [goalName, setGoalName] = useState(''),
    [goalSaved, setGoalSaved] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setKey(read(NEXON_KEY_STORAGE) || '');
      setPrice(read(PRICE_STORAGE) || DEFAULT_PRICE);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const chosen = characters.find((c) => c.ocid === ocid);
  const owned = { sol: count(ownedSol), fragments: count(ownedFragments) };
  const unitPrice = /^\d{1,12}$/.test(price) ? BigInt(price) : 0n;
  const total = useMemo(() => planTotal(rows), [rows]);
  const missing = shortfall(total, owned);
  const missingMeso = fragmentMeso(missing.fragments, unitPrice);

  function updateRows(next: PlanRow[]) {
    setRows(next);
    if (ocid) write(planStorage(ocid), JSON.stringify(next));
  }

  async function loadCharacters(e: FormEvent) {
    e.preventDefault();
    const apiKey = key.trim();
    if (!apiKey || busy) return;
    const token = ++epoch.current;
    setBusy(true);
    setStatus('캐릭터 목록을 불러오는 중…');
    try {
      const { characters: all } = z
        .object({ characters: z.array(nexonCharacterSchema) })
        .parse(await ledgerRequest('nexon-characters', { apiKey }));
      if (token !== epoch.current) return;
      write(NEXON_KEY_STORAGE, apiKey);
      const eligible = all
        .filter((c) => c.level >= HEXA_LEVEL)
        .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'ko'));
      setCharacters(eligible);
      const saved = read(CHARACTER_STORAGE);
      const pick = eligible.find((c) => c.ocid === saved) || eligible[0];
      setStatus(eligible.length ? '' : `${HEXA_LEVEL}레벨 이상 캐릭터가 없어요.`);
      if (pick) await loadCores(pick.ocid, apiKey, token);
    } catch (error) {
      if (token === epoch.current) setStatus(errorMessage(error));
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }

  async function loadCores(id: string, apiKey = key.trim(), token = ++epoch.current) {
    setOcid(id);
    write(CHARACTER_STORAGE, id);
    setBusy(true);
    setStatus('HEXA 코어를 불러오는 중…');
    try {
      const { cores } = hexaResponseSchema.parse(
        await ledgerRequest('nexon-hexa', { apiKey, ocid: id }),
      );
      if (token !== epoch.current) return;
      // 이전에 정한 목표 레벨과 코어 종류는 이름이 같으면 그대로 이어서 쓴다.
      const saved = planSchema.safeParse(JSON.parse(read(planStorage(id)) || '[]'));
      const previous = saved.success ? saved.data : [];
      const next: PlanRow[] = cores.map((core, index) => {
        const old = previous.find((row) => row.name === core.name);
        return {
          id: 'core-' + index,
          name: core.name,
          kind: old?.kind ?? kindOf(core),
          level: core.level,
          target: Math.max(core.level, old?.target ?? MAX_LEVEL),
        };
      });
      const manual = previous.filter((row) => row.id.startsWith('manual-'));
      setRows([...next, ...manual]);
      write(planStorage(id), JSON.stringify([...next, ...manual]));
      setStatus(cores.length ? '' : '장착한 HEXA 코어가 없어요. 아래에서 직접 추가할 수 있어요.');
    } catch (error) {
      if (token === epoch.current) setStatus(errorMessage(error));
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }

  const defaultGoalName = `HEXA 강화${chosen ? ' · ' + chosen.name : ''}`;
  async function saveGoal() {
    if (missingMeso <= 0n) return;
    const goals = ledger.assets.goals;
    const saved = await ledger.save({
      ...ledger.assets,
      goals: [
        ...goals,
        {
          id: crypto.randomUUID(),
          name: (goalName.trim() || defaultGoalName).slice(0, 100),
          amount: missingMeso.toString(),
          memo: `솔 에르다 ${number(missing.sol)}개 별도 · 조각 ${number(missing.fragments)}개`,
          startDate: koreaDate(),
          priority: Math.max(0, ...goals.map((g) => g.priority)) + 1,
          active: true,
          completed: false,
        },
      ],
    });
    setGoalSaved(saved ? `'${goalName.trim() || defaultGoalName}' 목표를 저장했어요.` : '');
  }

  return (
    <div className="hexa-page">
      <main>
        <PageHeading
          title="헥사 계산기"
          description="목표 레벨까지 필요한 솔 에르다와 조각, 조각을 사는 데 드는 메소를 알려줘요."
        />
        <section className="hexa-panel">
          <form className="hexa-key" onSubmit={loadCharacters}>
            <label>
              넥슨 Open API 키
              <input
                type="password"
                value={key}
                autoComplete="off"
                onChange={(e) => setKey(e.target.value)}
                placeholder="보스 정산에서 쓰는 키와 같아요"
              />
            </label>
            <button className="primary" disabled={busy || !key.trim()}>
              캐릭터 불러오기
            </button>
          </form>
          <p className="hexa-note">키는 이 브라우저에만 저장하고 서버에는 저장하지 않아요.</p>
          {characters.length > 0 && (
            <label className="hexa-character">
              캐릭터
              <select value={ocid} disabled={busy} onChange={(e) => void loadCores(e.target.value)}>
                {characters.map((c) => (
                  <option key={c.ocid} value={c.ocid}>
                    {c.name} · Lv.{c.level} {c.job} · {c.world}
                  </option>
                ))}
              </select>
            </label>
          )}
          {status && (
            <p className="hexa-status" role="status">
              {status}
            </p>
          )}
        </section>

        <section className="hexa-panel">
          <div className="hexa-settings">
            <label>
              조각 1개 가격 (메소)
              <input
                inputMode="numeric"
                value={price}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^\d]/g, '').slice(0, 12);
                  setPrice(value);
                  write(PRICE_STORAGE, value);
                }}
              />
            </label>
            <label>
              가진 솔 에르다
              <input
                inputMode="numeric"
                value={ownedSol}
                placeholder="0"
                onChange={(e) => setOwnedSol(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
              />
            </label>
            <label>
              가진 조각
              <input
                inputMode="numeric"
                value={ownedFragments}
                placeholder="0"
                onChange={(e) =>
                  setOwnedFragments(e.target.value.replace(/[^\d]/g, '').slice(0, 9))
                }
              />
            </label>
          </div>

          <div className="hexa-summary" aria-live="polite">
            <div>
              <span>필요한 솔 에르다</span>
              <strong>{number(total.sol)}개</strong>
              {owned.sol > 0 && <small>부족 {number(missing.sol)}개</small>}
            </div>
            <div>
              <span>필요한 조각</span>
              <strong>{number(total.fragments)}개</strong>
              {owned.fragments > 0 && <small>부족 {number(missing.fragments)}개</small>}
            </div>
            <div>
              <span>{owned.fragments > 0 ? '부족한 조각 메소' : '조각 메소'}</span>
              <strong>{money(missingMeso)} 메소</strong>
            </div>
          </div>

          {missingMeso > 0n && (
            <div className="hexa-goal">
              <h2>목표로 저장</h2>
              {ledger.name ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveGoal();
                  }}
                >
                  <label>
                    목표 이름
                    <input
                      value={goalName}
                      maxLength={100}
                      placeholder={defaultGoalName}
                      onChange={(e) => {
                        setGoalName(e.target.value);
                        setGoalSaved('');
                      }}
                    />
                  </label>
                  <button className="primary" disabled={ledger.busy}>
                    {money(missingMeso)} 메소 목표 저장
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  disabled={ledger.busy}
                  onClick={() => setBookOpen(true)}
                >
                  기록장 열기
                </button>
              )}
              <p className="hexa-note" role="status">
                {goalSaved ||
                  (ledger.name
                    ? `${ledger.name} 기록장에 저장해요. 오늘부터 기록한 사냥·보스 메소가 목표에 더해져요.`
                    : '기록장을 열면 필요한 메소를 목표로 바로 저장할 수 있어요.')}
              </p>
            </div>
          )}

          <div className="hexa-table-head">
            <h2>코어별 목표</h2>
            <div>
              <button
                type="button"
                className="secondary"
                disabled={!rows.length}
                onClick={() => updateRows(rows.map((r) => ({ ...r, target: MAX_LEVEL })))}
              >
                모두 {MAX_LEVEL}레벨
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  updateRows([
                    ...rows,
                    {
                      id: 'manual-' + Date.now(),
                      name: '새 코어',
                      kind: 'skill',
                      level: 0,
                      target: MAX_LEVEL,
                    },
                  ])
                }
              >
                코어 직접 추가
              </button>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="hexa-note">
              캐릭터를 불러오거나, 아직 열지 않은 코어는 직접 추가해서 계산해 보세요.
            </p>
          ) : (
            <ul className="hexa-rows">
              {rows.map((row) => {
                const cost = costBetween(row.kind, row.level, row.target);
                const reach =
                  owned.sol || owned.fragments
                    ? reachableLevel(row.kind, row.level, row.target, owned)
                    : null;
                const patch = (change: Partial<PlanRow>) =>
                  updateRows(rows.map((r) => (r.id === row.id ? { ...r, ...change } : r)));
                const manual = row.id.startsWith('manual-');
                return (
                  <li key={row.id}>
                    <div className="hexa-core">
                      {manual ? (
                        <input
                          aria-label="코어 이름"
                          value={row.name}
                          maxLength={40}
                          onChange={(e) => patch({ name: e.target.value })}
                        />
                      ) : (
                        <b>{row.name}</b>
                      )}
                      <select
                        aria-label={row.name + ' 비용 종류'}
                        value={row.kind}
                        onChange={(e) => {
                          const kind = coreKinds.find((k) => k === e.target.value);
                          if (kind) patch({ kind });
                        }}
                      >
                        {coreKinds.map((kind) => (
                          <option key={kind} value={kind}>
                            {kindLabels[kind]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label>
                      현재
                      <input
                        type="number"
                        min={0}
                        max={MAX_LEVEL}
                        value={row.level}
                        onChange={(e) => {
                          const value = level(e.target.value);
                          patch({ level: value, target: Math.max(value, row.target) });
                        }}
                      />
                    </label>
                    <label>
                      목표
                      <input
                        type="number"
                        min={row.level}
                        max={MAX_LEVEL}
                        value={row.target}
                        onChange={(e) => patch({ target: level(e.target.value) })}
                      />
                    </label>
                    <div className="hexa-cost">
                      {cost.sol || cost.fragments ? (
                        <>
                          <span>솔 에르다 {number(cost.sol)}</span>
                          <span>조각 {number(cost.fragments)}</span>
                        </>
                      ) : (
                        <span className="hexa-done">완료</span>
                      )}
                      {reach !== null && reach < row.target && (
                        <small>가진 재료로 Lv.{reach}까지</small>
                      )}
                    </div>
                    {manual && (
                      <button
                        type="button"
                        className="quiet"
                        aria-label={row.name + ' 삭제'}
                        onClick={() => updateRows(rows.filter((r) => r.id !== row.id))}
                      >
                        삭제
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="hexa-note">
            비용표는 2026년 11월 기준입니다. 3rd 스킬 코어처럼 종류가 다르게 잡히면 코어 옆에서 바꿔
            주세요. 솔 에르다는 살 수 없어 메소에는 조각만 넣었어요.
          </p>
        </section>
      </main>
      {bookOpen && <BookDialog onClose={() => setBookOpen(false)} onOpened={ledger.load} />}
    </div>
  );
}
