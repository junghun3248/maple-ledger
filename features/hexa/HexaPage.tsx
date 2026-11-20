'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
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
import { HexaBoard, groupLabels, type CoreGroup } from './HexaBoard';
import './hexa.css';

const PRICE_STORAGE = 'maple-hexa-fragment-price';
const CHARACTER_STORAGE = 'maple-hexa-character';
const planStorage = (ocid: string) => 'maple-hexa-plan:' + ocid;
// 다조(솔 에르다 조각) 1개 시세 기본값. 화면에서 바꾸면 이 브라우저에 기억한다.
const DEFAULT_PRICE = '6500000';
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
    [status, setStatus] = useState(''),
    [selected, setSelected] = useState(''),
    [icons, setIcons] = useState<Record<string, string>>({});
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
      setIcons(
        Object.fromEntries(cores.flatMap((core) => (core.icon ? [[core.name, core.icon]] : []))),
      );
      setSelected('');
      setRows([...next, ...manual]);
      write(planStorage(id), JSON.stringify([...next, ...manual]));
      setStatus(
        cores.length ? '' : '장착한 HEXA 코어가 없어요. 자물쇠 칸을 눌러 직접 추가할 수 있어요.',
      );
    } catch (error) {
      if (token === epoch.current) setStatus(errorMessage(error));
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }

  const selectedRow = rows.find((row) => row.id === selected);
  function patchSelected(change: Partial<PlanRow>) {
    updateRows(rows.map((row) => (row.id === selected ? { ...row, ...change } : row)));
  }
  function addCore(group: CoreGroup) {
    const row: PlanRow = {
      id: 'manual-' + Date.now(),
      name: '새 ' + groupLabels[group],
      kind: group,
      level: 0,
      target: MAX_LEVEL,
    };
    updateRows([...rows, row]);
    selectCore(row.id);
  }
  const selectedCost = selectedRow
    ? costBetween(selectedRow.kind, selectedRow.level, selectedRow.target)
    : null;
  const selectedMeso = selectedCost ? fragmentMeso(selectedCost.fragments, unitPrice) : 0n;
  const defaultGoalName = selectedRow
    ? `${chosen ? chosen.name + ' ' : ''}${selectedRow.name} Lv.${selectedRow.level}→${selectedRow.target}`
    : '';
  function selectCore(id: string) {
    setSelected(id);
    setGoalName('');
    setGoalSaved('');
  }
  async function saveGoal() {
    if (!selectedRow || !selectedCost || selectedMeso <= 0n) return;
    const name = (goalName.trim() || defaultGoalName).slice(0, 100);
    const goals = ledger.assets.goals;
    const saved = await ledger.save({
      ...ledger.assets,
      goals: [
        ...goals,
        {
          id: crypto.randomUUID(),
          name,
          amount: selectedMeso.toString(),
          memo: `HEXA ${selectedRow.name} Lv.${selectedRow.level}→${selectedRow.target} · 다조 ${number(selectedCost.fragments)}개 · 솔 에르다 ${number(selectedCost.sol)}개 별도`.slice(
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
  const selectedReach =
    selectedRow && (owned.sol || owned.fragments)
      ? reachableLevel(selectedRow.kind, selectedRow.level, selectedRow.target, owned)
      : null;

  return (
    <div className="hexa-page">
      <main>
        <PageHeading
          title="헥사 계산기"
          description="코어를 눌러 목표 레벨을 정하면 필요한 솔 에르다와 조각, 조각 메소를 알려줘요."
        />
        <section className="hexa-panel hexa-load">
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
            {characters.length > 0 && (
              <label className="hexa-character">
                캐릭터
                <select
                  value={ocid}
                  disabled={busy}
                  onChange={(e) => void loadCores(e.target.value)}
                >
                  {characters.map((c) => (
                    <option key={c.ocid} value={c.ocid}>
                      {c.name} · Lv.{c.level} {c.job} · {c.world}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </form>
          <p className="hexa-note" role="status">
            {status || '키는 이 브라우저에만 저장하고 서버에는 저장하지 않아요.'}
          </p>
        </section>

        <div className="hexa-layout">
          <section className="hexa-matrix">
            <HexaBoard
              rows={rows}
              icons={icons}
              selected={selected}
              onSelect={selectCore}
              onAdd={addCore}
            />
            <div className="hexa-matrix-tools">
              <button
                type="button"
                className="secondary"
                disabled={!rows.length}
                onClick={() => updateRows(rows.map((r) => ({ ...r, target: MAX_LEVEL })))}
              >
                모든 코어 {MAX_LEVEL}레벨 목표
              </button>
              <small>자물쇠 칸을 누르면 아직 열지 않은 코어를 추가해 계산할 수 있어요.</small>
            </div>
          </section>

          <aside className="hexa-side">
            <section className="hexa-card">
              <h2>보유 재료</h2>
              <div className="hexa-owned">
                <label>
                  솔 에르다
                  <input
                    inputMode="numeric"
                    value={ownedSol}
                    placeholder="0"
                    onChange={(e) => setOwnedSol(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
                  />
                </label>
                <label>
                  솔 에르다 조각
                  <input
                    inputMode="numeric"
                    value={ownedFragments}
                    placeholder="0"
                    onChange={(e) =>
                      setOwnedFragments(e.target.value.replace(/[^\d]/g, '').slice(0, 9))
                    }
                  />
                </label>
                <label>
                  다조 가격 (솔 에르다 조각 1개)
                  <input
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d]/g, '').slice(0, 12);
                      setPrice(value);
                      write(PRICE_STORAGE, value);
                    }}
                  />
                  <small className="hexa-hint">
                    기본값은 650만 메소예요. 지금 시세에 맞게 바꿔 주세요.
                    {unitPrice > 0n && ` (${money(unitPrice)} 메소)`}
                  </small>
                </label>
              </div>
            </section>

            <section className="hexa-card hexa-detail">
              {selectedRow && selectedCost ? (
                <>
                  <div className="hexa-detail-head">
                    {icons[selectedRow.name] && (
                      <Image
                        src={icons[selectedRow.name]}
                        alt=""
                        width={36}
                        height={36}
                        unoptimized
                      />
                    )}
                    {selectedRow.id.startsWith('manual-') ? (
                      <input
                        aria-label="코어 이름"
                        value={selectedRow.name}
                        maxLength={40}
                        onChange={(e) => patchSelected({ name: e.target.value })}
                      />
                    ) : (
                      <h2>{selectedRow.name}</h2>
                    )}
                  </div>
                  <label>
                    비용 종류
                    <select
                      value={selectedRow.kind}
                      onChange={(e) => {
                        const kind = coreKinds.find((k) => k === e.target.value);
                        if (kind) patchSelected({ kind });
                      }}
                    >
                      {coreKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {kindLabels[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="hexa-levels">
                    <label>
                      현재 레벨
                      <input
                        type="number"
                        min={0}
                        max={MAX_LEVEL}
                        value={selectedRow.level}
                        onChange={(e) => {
                          const value = level(e.target.value);
                          patchSelected({
                            level: value,
                            target: Math.max(value, selectedRow.target),
                          });
                        }}
                      />
                    </label>
                    <label>
                      목표 레벨
                      <input
                        type="number"
                        min={selectedRow.level}
                        max={MAX_LEVEL}
                        value={selectedRow.target}
                        onChange={(e) => patchSelected({ target: level(e.target.value) })}
                      />
                    </label>
                  </div>
                  <input
                    type="range"
                    aria-label="목표 레벨"
                    min={selectedRow.level}
                    max={MAX_LEVEL}
                    value={selectedRow.target}
                    onChange={(e) => patchSelected({ target: level(e.target.value) })}
                  />
                  <dl className="hexa-cost">
                    <div>
                      <dt>솔 에르다</dt>
                      <dd>{number(selectedCost.sol)}개</dd>
                    </div>
                    <div>
                      <dt>솔 에르다 조각</dt>
                      <dd>{number(selectedCost.fragments)}개</dd>
                    </div>
                    <div>
                      <dt>조각 메소</dt>
                      <dd>{money(fragmentMeso(selectedCost.fragments, unitPrice))} 메소</dd>
                    </div>
                  </dl>
                  {selectedReach !== null && selectedReach < selectedRow.target && (
                    <p className="hexa-reach">보유 재료로 Lv.{selectedReach}까지 올릴 수 있어요.</p>
                  )}
                  {selectedMeso > 0n && (
                    <div className="hexa-goal">
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
                          <button className="primary" disabled={ledger.busy}>
                            Lv.{selectedRow.target}까지 {money(selectedMeso)} 메소 목표 설정
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="secondary"
                          disabled={ledger.busy}
                          onClick={() => setBookOpen(true)}
                        >
                          기록장 열고 목표 설정
                        </button>
                      )}
                      <p className="hexa-note" role="status">
                        {goalSaved ||
                          (ledger.name
                            ? `${ledger.name} 기록장 목표에 추가해요. 오늘부터 기록한 사냥·보스 메소가 더해져요.`
                            : '기록장을 열면 이 레벨까지 필요한 메소를 목표로 추가할 수 있어요.')}
                      </p>
                    </div>
                  )}
                  {selectedRow.id.startsWith('manual-') && (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => {
                        updateRows(rows.filter((r) => r.id !== selectedRow.id));
                        setSelected('');
                      }}
                    >
                      이 코어 삭제
                    </button>
                  )}
                </>
              ) : (
                <p className="hexa-empty">강화할 코어를 선택해 주세요.</p>
              )}
            </section>

            <section className="hexa-card">
              <h2>전체 합계</h2>
              <dl className="hexa-cost">
                <div>
                  <dt>솔 에르다</dt>
                  <dd>
                    {number(total.sol)}개
                    {owned.sol > 0 && <small> · 부족 {number(missing.sol)}</small>}
                  </dd>
                </div>
                <div>
                  <dt>솔 에르다 조각</dt>
                  <dd>
                    {number(total.fragments)}개
                    {owned.fragments > 0 && <small> · 부족 {number(missing.fragments)}</small>}
                  </dd>
                </div>
                <div>
                  <dt>{owned.fragments > 0 ? '부족한 조각 메소' : '조각 메소'}</dt>
                  <dd>
                    <strong>{money(missingMeso)} 메소</strong>
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
        <p className="hexa-note">
          비용표는 2026년 11월 기준입니다. 3rd 스킬 코어나 직업군 공용 코어가 다르게 잡히면 코어를
          눌러 비용 종류를 바꿔 주세요. 솔 에르다는 살 수 없어 메소에는 조각만 넣었어요.
        </p>
      </main>
      {bookOpen && <BookDialog onClose={() => setBookOpen(false)} onOpened={ledger.load} />}
    </div>
  );
}
