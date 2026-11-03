import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { tablesSchema, type Equipment, type Mode, type Tables } from '@/contracts/simulator/schema';
import { ledgerRequest, errorMessage } from '@/lib/ledger/api';
import { grades, resetCost, upgrade, rollOptions, guarantees, percentTotal } from './potential';
export const money = (n: number) => n.toLocaleString('ko-KR') + ' 메소';
type Result = { grade: number; lines: string[] };
export function PotentialPanel({ item, mode }: { item: Equipment; mode: Mode }) {
  const initial = mode === 'potential' ? item.potentialGrade : item.additionalGrade;
  const [current, setCurrent] = useState<Result>({
    grade: Math.max(1, initial),
    lines: item[mode],
  });
  const [choices, setChoices] = useState<Result[]>([]);
  const after = choices.at(-1) || null;
  const setAfter = (value: Result | null) => setChoices(value ? [value] : []);
  const [failures, setFailures] = useState(0),
    [miracle, setMiracle] = useState(false);
  const [spent, setSpent] = useState(0),
    [count, setCount] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const cache = useRef(new Map<number, Tables>()),
    locked = useRef(false);
  const [goal, setGoal] = useState('grade'),
    [goalValue, setGoalValue] = useState(21),
    [budget, setBudget] = useState(100);
  const stopped = useRef(false);
  useEffect(
    () => () => {
      stopped.current = true;
    },
    [],
  );
  async function tableFor(grade: number) {
    const old = cache.current.get(grade);
    if (old) return old;
    const response = z.object({ tables: tablesSchema }).parse(
      await ledgerRequest('simulator-probabilities', {
        mode,
        level: item.level,
        part: item.part,
        grade,
      }),
    );
    cache.current.set(grade, response.tables);
    return response.tables;
  }
  async function auto() {
    if (locked.current || after) return;
    locked.current = true;
    stopped.current = false;
    setBusy(true);
    let result = current,
      misses = failures,
      cost = 0,
      attempts = 0;
    const logs: string[] = [];
    const reached = () =>
      goal === 'grade' ? result.grade === 4 : percentTotal(result.lines, goal) >= goalValue;
    try {
      while (attempts < 1000 && !reached() && !stopped.current) {
        const price = resetCost(mode, item.level, result.grade);
        if (cost + price > budget * 100000000) break;
        const next = upgrade(mode, result.grade, misses, miracle);
        const table = await tableFor(next.grade);
        if (stopped.current) break;
        let lines = rollOptions(table);
        for (let retry = 0; retry < 100 && lines.join('|') === result.lines.join('|'); retry++)
          lines = rollOptions(table);
        if (lines.join('|') === result.lines.join('|')) throw Error('옵션 재설정에 실패했어요.');
        cost += price;
        attempts++;
        misses = next.failures;
        result = { grade: next.grade, lines };
        logs.unshift(count + attempts + '회 · ' + grades[result.grade] + ' · ' + lines.join(' / '));
        if (logs.length > 50) logs.pop();
        if (attempts % 25 === 0) {
          setMessage('자동 재설정 ' + attempts + '회 진행 중…');
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      setMessage(
        reached()
          ? '목표에 도달했어요!'
          : stopped.current
            ? '자동 재설정을 중단했어요.'
            : '추가 예산 또는 최대 1,000회에 도달했어요.',
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setCurrent(result);
      setFailures(misses);
      setSpent((v) => v + cost);
      setCount((v) => v + attempts);
      setHistory((h) => [...logs, ...h].slice(0, 50));
      setBusy(false);
      locked.current = false;
    }
  }
  async function reroll(amount = 1) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    // A pending upgrade cannot be discarded to return to a lower grade.
    const base = after && after.grade > current.grade ? after : current;
    const results: Result[] = [];
    let misses = failures,
      cost = 0;
    try {
      for (let n = 0; n < amount; n++) {
        const next = upgrade(mode, base.grade, misses, miracle);
        const table = await tableFor(next.grade);
        let lines = rollOptions(table);
        for (let retry = 0; retry < 100 && lines.join('|') === base.lines.join('|'); retry++)
          lines = rollOptions(table);
        if (lines.join('|') === base.lines.join('|'))
          throw Error('다른 옵션을 생성하지 못했어요. 다시 시도해 주세요.');
        results.push({ grade: next.grade, lines });
        cost += resetCost(mode, item.level, base.grade);
        misses = next.failures;
        if (next.grade > base.grade) break;
      }
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      if (results.length) {
        setCurrent(base);
        setChoices(results);
        setSpent((v) => v + cost);
        setCount((v) => v + results.length);
        setFailures(misses);
        setHistory((h) =>
          [
            ...results
              .map(
                (r, i) => count + i + 1 + '회 · ' + grades[r.grade] + ' · ' + r.lines.join(' / '),
              )
              .reverse(),
            ...h,
          ].slice(0, 50),
        );
      }
      locked.current = false;
      setBusy(false);
    }
  }
  function choose(result: Result) {
    setCurrent(result);
    setAfter(null);
  }
  return (
    <section className="sim-panel">
      <div className="sim-fields">
        <label>
          시작 등급
          <select
            value={current.grade}
            disabled={count > 0 || busy}
            onChange={(e) => setCurrent({ grade: Number(e.target.value), lines: ['', '', ''] })}
          >
            {grades.slice(1).map((g, i) => (
              <option key={g} value={i + 1}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="sim-check">
          <input
            type="checkbox"
            disabled={busy || !!after}
            checked={miracle}
            onChange={(e) => setMiracle(e.target.checked)}
          />
          미라클 타임 (등업 확률 2배)
        </label>
      </div>
      {initial === 0 && <p>잠재가 없는 장비는 레어 3줄이 부여된 상태로 가정합니다.</p>}
      <div className="sim-summary">
        <span>
          재설정 <b>{count}회</b>
        </span>
        <span>
          누적 사용 <b>{money(spent)}</b>
        </span>
        <span>
          등업 실패{' '}
          <b>
            {failures} / {guarantees[mode][current.grade] ?? '최고 등급'}
          </b>
        </span>
      </div>
      <div className="sim-comparison">
        {[
          { title: '현재 옵션', result: current },
          ...(choices.length
            ? choices.map((result, i) => ({ title: '재설정 결과 ' + (i + 1), result }))
            : [{ title: '재설정 결과', result: null }]),
        ].map(({ title, result }, index) => (
          <article key={title} className={'sim-result grade-' + (result?.grade || 0)}>
            <small>{title}</small>
            <h3>{result ? grades[result.grade] : '새로운 가능성'}</h3>
            <ul>
              {(result?.lines || ['재설정 버튼을 눌러 주세요.']).map((line, i) => (
                <li key={i}>{line || '미설정'}</li>
              ))}
            </ul>
            {after && result && (
              <button
                className={index ? 'sim-primary' : ''}
                disabled={
                  busy || result.grade < Math.max(current.grade, ...choices.map((r) => r.grade))
                }
                onClick={() => choose(result)}
              >
                {index ? '이 옵션 적용' : '기존 옵션 유지'}
              </button>
            )}
          </article>
        ))}
      </div>
      {after?.grade && after.grade > current.grade && (
        <p>등급이 올랐어요! 상승한 등급의 옵션을 적용해 주세요.</p>
      )}
      <button className="sim-primary sim-wide" onClick={() => void reroll(1)} disabled={busy}>
        {busy
          ? '공식 확률표 확인 중…'
          : '1회 재설정 · ' +
            money(resetCost(mode, item.level, Math.max(current.grade, after?.grade || 0)))}
      </button>
      <button className="sim-wide" onClick={() => void reroll(3)} disabled={busy}>
        3회 재설정 · 최대{' '}
        {money(resetCost(mode, item.level, Math.max(current.grade, after?.grade || 0)) * 3)}
      </button>
      <p className="sim-note">
        선택하지 않고 다시 누르면 현재 옵션을 유지하고 이전 후보를 교체합니다. 등급이 오른 후보는
        자동 유지합니다. 3회는 결과를 비교해 하나를 선택하며, 등업 시 중단하고 실제 횟수만
        계산합니다.
      </p>
      <p role="status">
        {message ||
          (after ? '두 결과 중 사용할 옵션을 선택해 주세요.' : '메소 재설정 · 옵션 고정 없음')}
      </p>
      <details>
        <summary>목표까지 자동 재설정</summary>
        <p>
          진행 중에는 새 옵션을 자동 적용합니다. 목표 달성·추가 예산 소진·1,000회 중 먼저 도달한
          조건에서 멈춥니다.
        </p>
        <div className="sim-fields">
          <label>
            목표
            <select disabled={busy} value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option value="grade">레전드리 등업</option>
              {['STR', 'DEX', 'INT', 'LUK', '공격력', '마력', '메소 획득량', '아이템 드롭률'].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          {goal !== 'grade' && (
            <label>
              합계 % (스탯은 올스탯 포함)
              <input
                type="number"
                min="1"
                max="300"
                value={goalValue}
                disabled={busy}
                onChange={(e) => setGoalValue(Number(e.target.value))}
              />
            </label>
          )}
          <label>
            추가 예산 (억 메소)
            <input
              type="number"
              min="1"
              max="10000"
              value={budget}
              disabled={busy}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          onClick={() => void auto()}
          disabled={
            busy || !!after || budget < 1 || budget > 10000 || goalValue < 1 || goalValue > 300
          }
        >
          자동 재설정 시작
        </button>{' '}
        <button
          onClick={() => {
            stopped.current = true;
          }}
          disabled={!busy}
        >
          중단
        </button>
      </details>
      <details>
        <summary>최근 결과 ({history.length}개)</summary>
        <ol className="sim-history">
          {history.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ol>
      </details>
      <p className="sim-note">
        확률은 넥슨 공개 표를 조회합니다. 결과는 가상이며 실제 장비를 변경하지 않습니다. 초기화 또는
        장비·탭 변경 시 이 시뮬레이션은 초기화됩니다.
      </p>
    </section>
  );
}
