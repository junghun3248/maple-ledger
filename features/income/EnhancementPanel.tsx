'use client';
import { useEffect, useRef, useState } from 'react';
import {
  enhancementKinds,
  enhancementLevelResponseSchema,
  enhancementResponseSchema,
  type EnhancementRow,
} from '@/contracts/ledger/enhancement-schema';
import type { AssetSettings } from '@/contracts/ledger/finance-schema';
import { NEXON_KEY_STORAGE } from '@/features/boss/auto-sync';
import { ledgerRequest, errorMessage } from '@/lib/ledger/api';
import { koreaDate } from '@/lib/ledger/korea-date';
import { money } from '@/lib/ledger/format';
import {
  MVP_DISCOUNTS,
  enhancementCost,
  enhancementDays,
  mergeEnhancements,
  removeEnhancementDay,
} from './enhancement-model';
import './enhancement.css';

// 서버의 ENHANCEMENT_FROM과 같다. 비용표가 바뀐 날 이전 기록은 계산하지 않는다.
const FROM = '2026-10-22';
const MAX_DAYS = 31;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function shiftDay(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= MAX_DAYS; d = shiftDay(d, 1)) out.push(d);
  return out;
}
const mvpLabels = ['없음', '실버 3%', '골드 5%', '다이아 이상 10%'];

/** 넥슨 스타포스·잠재능력 재설정 이력으로 쓴 메소를 계산해 기록에서 뺀다. */
export function EnhancementPanel({
  assets,
  disabled,
  save,
}: {
  assets: AssetSettings;
  disabled: boolean;
  save: (next: AssetSettings) => Promise<boolean>;
}) {
  const today = koreaDate();
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [from, setFrom] = useState(() => [FROM, shiftDay(today, -6)].sort()[1]);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<EnhancementRow[] | null>(null);
  const [levels, setLevels] = useState<Record<string, number>>({});
  // 장착 장비에서 자동으로 찾은 레벨. 직접 입력하는 동안 입력란이 사라지지 않도록 따로 둔다.
  const [found, setFound] = useState<Record<string, number>>({});
  const [mvp, setMvp] = useState(0);
  const [pc, setPc] = useState(false);
  const [huntIncluded, setHuntIncluded] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => {
      try {
        setKey(localStorage.getItem(NEXON_KEY_STORAGE) || '');
      } catch {}
    }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, []);

  const settings = { levels, mvp, pc, huntIncluded };
  const costs = (rows || []).map((row) => enhancementCost(row, settings));
  const total = costs.reduce<number>((s, c) => s + (c ?? 0), 0);
  const counted = costs.filter((c) => c !== null).length;
  const missingItems = [
    ...new Set(
      (rows || [])
        .filter((r) => r.kind === 'starforce' && !r.excluded && !found[r.item])
        .map((r) => r.item),
    ),
  ];
  const saved = enhancementDays(assets.expenses);
  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  const range = validDates ? daysBetween(from, to) : [];
  const rangeError = !validDates
    ? '시작일과 종료일을 입력해 주세요.'
    : from < FROM
      ? `${FROM} 이후 날짜만 계산할 수 있어요.`
      : from > to || to > today
        ? '날짜 범위를 확인해 주세요.'
        : range.length > MAX_DAYS
          ? `한 번에 ${MAX_DAYS}일까지 불러올 수 있어요.`
          : '';

  async function fetchHistory() {
    const apiKey = key.trim();
    if (working || disabled || rangeError || !apiKey) return;
    setWorking(true);
    setRows(null);
    try {
      const all: EnhancementRow[] = [];
      let calls = 0;
      for (const date of range)
        for (const kind of enhancementKinds) {
          let cursor = '';
          const seen = new Set<string>();
          do {
            if (!mounted.current) return;
            if (calls++) await pause(700);
            setMessage(`${date} ${kind === 'starforce' ? '스타포스' : '잠재능력'} 확인 중…`);
            const page = enhancementResponseSchema.parse(
              await ledgerRequest('enhancement-history', { key: apiKey, date, kind, cursor }),
            );
            all.push(...page.rows);
            if (page.cursor && seen.has(page.cursor))
              throw Error('같은 이력이 반복돼 조회를 멈췄어요. 아직 저장하지 않았어요.');
            seen.add(page.cursor);
            cursor = page.cursor;
          } while (cursor);
        }
      if (remember)
        try {
          localStorage.setItem(NEXON_KEY_STORAGE, apiKey);
        } catch {}
      // 스타포스 장비 레벨은 현재 장착 장비에서 자동으로 찾는다. 못 찾은 장비만 직접 입력한다.
      const characters = [
        ...new Set(all.filter((r) => r.kind === 'starforce').map((r) => r.character)),
      ].slice(0, 10);
      if (characters.length) {
        setMessage('장비 레벨 확인 중…');
        try {
          const result = enhancementLevelResponseSchema.parse(
            await ledgerRequest('enhancement-levels', { key: apiKey, characters }),
          );
          if (mounted.current) {
            setFound(result.levels);
            setLevels((old) => ({ ...result.levels, ...old }));
          }
        } catch {}
      }
      if (!mounted.current) return;
      setRows(all);
      setMessage(
        all.length
          ? `${all.length}건을 찾았어요. 조건을 확인하고 기록에 반영해 주세요.`
          : '이 기간에 강화 이력이 없어요.',
      );
    } catch (e) {
      if (mounted.current) setMessage(errorMessage(e));
    } finally {
      if (mounted.current) setWorking(false);
    }
  }

  async function apply() {
    if (working || disabled || !rows) return;
    setWorking(true);
    try {
      const result = await mergeEnhancements(assets, rows, settings);
      if (result.added && !(await save(result.finance))) {
        setMessage('저장하지 못했어요. 위의 기록장 상태를 확인한 뒤 다시 시도해 주세요.');
        return;
      }
      setRows(null);
      setMessage(
        `${result.added}건 반영했어요.` +
          (result.duplicate ? ` 이미 반영된 ${result.duplicate}건은 건너뛰었어요.` : '') +
          (result.excluded ? ` 계산할 수 없는 ${result.excluded}건은 빼었어요.` : ''),
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  async function remove(date: string) {
    if (working || disabled || !confirm(`${date} 강화 비용을 기록에서 지울까요?`)) return;
    setWorking(true);
    try {
      if (await save(removeEnhancementDay(assets, date)))
        setMessage(`${date} 강화 비용을 지웠어요. 조건을 바꿔 다시 불러올 수 있어요.`);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="enh-panel">
      <h2>강화 비용</h2>
      <p className="enh-note">
        넥슨 API 키로 스타포스와 잠재능력·에디셔널 메소 재설정 이력을 읽어 쓴 메소를 계산하고, 수입
        기록과 목표 진행률에서 빼요. 실제 차감액이 아닌 추정값이며 {FROM} 이후 이력만 계산해요.
      </p>
      <fieldset disabled={working || disabled} className="enh-form">
        <label>
          넥슨 API 키
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setRows(null);
            }}
          />
        </label>
        <label>
          시작일
          <input
            type="date"
            min={FROM}
            max={today}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          종료일
          <input
            type="date"
            min={FROM}
            max={today}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="primary"
          disabled={!key.trim() || !!rangeError}
          onClick={() => void fetchHistory()}
        >
          이력 불러오기
        </button>
        <label className="enh-check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          이 기기에 키 저장 (보스 자동 동기화와 같이 사용)
        </label>
      </fieldset>
      {rangeError && <p className="enh-warn">{rangeError}</p>}

      {rows && rows.length > 0 && (
        <div className="enh-review">
          <fieldset disabled={working || disabled} className="enh-form">
            <label>
              MVP 할인
              <select value={mvp} onChange={(e) => setMvp(Number(e.target.value))}>
                {MVP_DISCOUNTS.map((v, i) => (
                  <option key={v} value={v}>
                    {mvpLabels[i]}
                  </option>
                ))}
              </select>
            </label>
            <label className="enh-check">
              <input type="checkbox" checked={pc} onChange={(e) => setPc(e.target.checked)} />
              PC방 5%
            </label>
            <label className="enh-check">
              <input
                type="checkbox"
                checked={huntIncluded}
                onChange={(e) => setHuntIncluded(e.target.checked)}
              />
              사냥 전후 메소에 이미 포함됨 (중복으로 빼지 않음)
            </label>
          </fieldset>
          {missingItems.length > 0 && (
            <div className="enh-levels">
              <p>장착 중이 아니라 레벨을 못 찾은 장비예요. 레벨을 입력하면 계산에 포함돼요.</p>
              {missingItems.map((item) => (
                <label key={item}>
                  {item}
                  <input
                    type="number"
                    min="10"
                    max="250"
                    placeholder="레벨"
                    value={levels[item] || ''}
                    onChange={(e) => setLevels({ ...levels, [item]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
          )}
          <p className="enh-total">
            <strong>−{money(String(total))} 메소</strong>
            <span>
              계산 {counted}건 · 제외 {rows.length - counted}건
            </span>
          </p>
          {counted < rows.length && (
            <details>
              <summary>계산에서 빠진 이력</summary>
              <ul>
                {rows
                  .filter((_, i) => costs[i] === null)
                  .slice(0, 30)
                  .map((r) => (
                    <li key={r.kind + r.id}>
                      {r.item} · {r.excluded || '장비 레벨 필요'}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          <button
            type="button"
            className="primary"
            disabled={working || disabled || !counted}
            onClick={() => void apply()}
          >
            기록에 반영
          </button>
        </div>
      )}
      <p role="status" className="enh-status">
        {message}
      </p>

      {saved.length > 0 && (
        <ul className="enh-days">
          {saved.slice(0, 31).map((day) => (
            <li key={day.date}>
              <time>{day.date}</time>
              <span>강화 {day.count}회</span>
              <b>−{money(day.amount)}</b>
              <button
                type="button"
                className="quiet"
                disabled={working || disabled}
                onClick={() => void remove(day.date)}
              >
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
