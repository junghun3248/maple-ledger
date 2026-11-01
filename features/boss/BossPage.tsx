'use client';
import { useState, useRef } from 'react';

import './boss.css';
import './boss-board.css';
import '@/components/ledger/ledger.css';
import type { BossDefinition, ItemDefinition, Character, Run } from '@/contracts/boss/state';
import { bossStateSchema } from '@/contracts/boss/schema';
import { BookDialog } from '@/components/ledger/BookDialog';
import { Dialog } from '@/components/ledger/Dialog';
import { Navigation, PageLink } from '@/components/ledger/Navigation';
import { downloadJson } from '@/lib/ledger/backup';
import { errorMessage } from '@/lib/ledger/api';
import { useBossBook } from './useBossBook';
import { BossBoard } from './BossBoard';
import { CharacterDialog } from './CharacterDialog';
import { SchedulerDialog } from './SchedulerDialog';
import { RosterDialog, AddBossDialog } from './RosterDialog';
import { RunDialog } from './RunDialog';
import { dateKey, weekKey, money, sumRuns, settle } from './model';

export function BossPage({
  catalog,
  items,
  rules,
}: {
  catalog: BossDefinition[];
  items: ItemDefinition[];
  rules: Record<string, string[]>;
}) {
  const book = useBossBook();
  const [date, setDate] = useState(dateKey()),
    [period, setPeriod] = useState<'week' | 'month'>('week');
  const [selected, setSelected] = useState(''),
    [dialog, setDialog] = useState(''),
    [runId, setRunId] = useState('');
  const [visible, setVisible] = useState<string[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const character =
    book.state.characters.find((c) => c.id === selected) || book.state.characters[0];
  const run = character?.runs.find((r) => r.id === runId);
  const all = book.state.characters.flatMap((c) => c.runs),
    weekly = all.filter((r) => weekKey(r.date) === weekKey(date));
  const close = () => setDialog('');
  function updateCharacter(c: Character) {
    return book.change({
      ...book.state,
      characters: book.state.characters.map((x) => (x.id === c.id ? c : x)),
    });
  }
  function shift(days: number) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(dateKey(d));
  }
  function addRun(r: Run) {
    if (!character) return false;
    const same = character.runs.filter(
      (x) =>
        x.period === r.period &&
        (r.period === 'week'
          ? weekKey(x.date) === weekKey(r.date)
          : x.date.slice(0, 7) === r.date.slice(0, 7)),
    );
    if (same.some((x) => x.name === r.name) || (r.period === 'week' && same.length >= 12)) {
      book.setStatus('같은 주 보스는 중복 없이 12마리까지 선택하세요.');
      return false;
    }
    return updateCharacter({ ...character, runs: [...character.runs, r] });
  }
  const end = new Date(weekKey(date) + 'T12:00:00');
  end.setDate(end.getDate() + 6);
  return (
    <div className="boss-dashboard">
      <header>
        <Navigation />
        <PageLink className="brand" href="/">
          ✦ 메이플 가계부
        </PageLink>
        <button className="secondary" disabled={book.busy} onClick={() => setDialog('book')}>
          {book.name ? book.name + ' · 기록장' : '기록장 열기'}
        </button>
      </header>
      <main>
        <div className="intro">
          <span className="eyebrow">BOSS LOOT LEDGER</span>
          <h1>이번 주 보스 수익</h1>
          <p>스케줄러로 보스를 가져오고, 인원과 물욕템만 기록하세요.</p>
        </div>
        <div className="savebar">
          <span role="status" className={book.dirty ? 'pending' : ''}>
            {book.status}
          </span>
          <details className="data-menu">
            <summary>▤ 데이터 ▾</summary>
            <div className="data-popover">
              <b>다른 기기와 이어하기</b>
              <p>같은 기록장 이름·비밀번호로 열어 주세요.</p>
              <button
                className="primary"
                disabled={book.busy}
                onClick={() => (book.name ? void book.save() : setDialog('book'))}
              >
                기록장에 저장
              </button>
              <button className="quiet" disabled={book.busy} onClick={() => void book.load()}>
                서버에서 불러오기
              </button>
              <hr />
              <b>백업 파일</b>
              <button
                className="quiet"
                onClick={() =>
                  downloadJson(
                    { type: 'maple-boss-ledger', version: 1, state: book.state },
                    '보스정산-' + dateKey() + '.json',
                  )
                }
              >
                파일로 내보내기
              </button>
              <button className="quiet" disabled={book.busy} onClick={() => file.current?.click()}>
                파일에서 가져오기
              </button>
            </div>
          </details>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              if (f.size > 2500000) throw Error('파일이 너무 커요.');
              const data = JSON.parse(await f.text());
              if (data.type !== 'maple-boss-ledger')
                throw Error('보스 정산 백업 파일을 선택해 주세요.');
              const next = bossStateSchema.parse(data.state);
              if (
                confirm(
                  '현재 정산표를 백업 내용으로 바꿀까요? 저장 버튼을 눌러야 서버에 반영됩니다.',
                )
              )
                book.change(next);
            } catch (e) {
              book.setStatus(errorMessage(e));
            }
          }}
        />
        <div className="week-toolbar">
          <div>
            <span className="eyebrow">WEEKLY REVENUE</span>
            <h2>
              {weekKey(date)} ~ {dateKey(end)}
            </h2>
          </div>
          <div className="week-nav">
            <button className="secondary" aria-label="이전 주" onClick={() => shift(-7)}>
              ←
            </button>
            <button className="secondary" onClick={() => setDate(dateKey())}>
              이번 주
            </button>
            <button className="secondary" aria-label="다음 주" onClick={() => shift(7)}>
              →
            </button>
          </div>
        </div>
        <section className="stats" aria-label="주간 수익 요약">
          <article className="week-hero">
            <span>이번 주 전체 수익 · 내 몫</span>
            <strong>{money(sumRuns(weekly))} 메소</strong>
            <small>목요일 ~ 수요일</small>
            <div>
              결정석 {money(weekly.reduce((n, r) => n + settle(r).crystal, 0n))} + 물욕템{' '}
              {money(weekly.reduce((n, r) => n + settle(r).loot, 0n))}
            </div>
          </article>
          <article>
            <span>{character?.name || '선택한 캐릭터'} · 이번 주</span>
            <strong>
              {money(
                sumRuns(character?.runs.filter((r) => weekKey(r.date) === weekKey(date)) || []),
              )}{' '}
              메소
            </strong>
            <small>결정석 + 물욕템 분배금</small>
          </article>
          <article>
            <span>선택한 달 · 전체 캐릭터</span>
            <strong>
              {money(sumRuns(all.filter((r) => r.date.slice(0, 7) === date.slice(0, 7))))} 메소
            </strong>
            <small>등록 보스 결정석 + 획득 아이템</small>
          </article>
        </section>
        <fieldset disabled={book.busy} className="boss-workspace">
          <div className="board-toolbar">
            <div>
              <span className="eyebrow">MY CHARACTERS</span>
              <h2>캐릭터 모아보기</h2>
            </div>
            <div className="sheet-actions">
              <button className="secondary" onClick={() => setDialog('filter')}>
                캐릭터 선택
              </button>
              <button className="primary" onClick={() => setDialog('scheduler')}>
                ＋ API로 캐릭터 추가
              </button>
              <button className="quiet" onClick={() => setDialog('nickname')}>
                닉네임으로 추가
              </button>
            </div>
          </div>
          <div className="board-subtoolbar">
            <div className="board-tabs">
              <button aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>
                주간 보스
              </button>
              <button aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>
                월간 보스
              </button>
            </div>
            <label className="board-date">
              기록 기준일
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value || dateKey())}
              />
            </label>
          </div>
          <p className="muted board-help">
            보스를 누르면 인원·획득 아이템·판매가를 입력할 수 있어요. 결정석은 수수료 없이 자동
            합산됩니다.
          </p>
          {weekly.some((r) => settle(r).missing > 0) && (
            <p>판매가가 비어 있는 획득 아이템은 합계에서 제외했어요.</p>
          )}
          <div className="board-columns">
            <span>캐릭터</span>
            <span>수익 · 내 몫</span>
            <span>보스 목록</span>
          </div>
          <BossBoard
            characters={book.state.characters.filter((c) => !visible || visible.includes(c.id))}
            date={date}
            period={period}
            onManage={(id) => {
              setSelected(id);
              setDialog('manage');
            }}
            onRun={(id, r) => {
              setSelected(id);
              setRunId(r.id);
              setDialog('run');
            }}
          />
          {!book.state.characters.length && (
            <div className="empty">
              <h3>내 캐릭터와 보스를 한눈에</h3>
              <p>게임 내 스케줄러에 등록한 보스를 가져오세요.</p>
              <button className="primary" onClick={() => setDialog('scheduler')}>
                ＋ 캐릭터와 보스 가져오기
              </button>
            </div>
          )}
          {!!book.state.characters.length && visible?.length === 0 && (
            <p className="empty">캐릭터 선택에서 표시할 캐릭터를 골라 주세요.</p>
          )}
        </fieldset>
        <footer>
          <p>
            결정석 기본값: 2026.09.17 공식 가격표 및 10월 변경 반영 · 인원과 아이템 판매가는 직접
            확인해 주세요.
          </p>
        </footer>
      </main>
      {dialog === 'book' && (
        <BookDialog
          onClose={close}
          onOpened={async () => {
            await book.load(true);
          }}
        />
      )}
      {dialog === 'scheduler' && (
        <SchedulerDialog
          state={book.state}
          catalog={catalog}
          onClose={close}
          onApply={(s, d) => {
            if (book.change(s)) {
              setDate(d);
              setVisible(null);
            }
          }}
        />
      )}
      {dialog === 'nickname' && (
        <CharacterDialog
          onClose={close}
          onAdd={(c) => {
            const old = book.state.characters.find(
              (x) => x.name.toLowerCase() === c.name.toLowerCase(),
            );
            return book.change({
              ...book.state,
              characters: old
                ? book.state.characters.map((x) => (x === old ? { ...old, profile: c.profile } : x))
                : [...book.state.characters, c],
            });
          }}
        />
      )}
      {dialog === 'filter' && (
        <Dialog title="표시할 캐릭터 선택" onClose={close}>
          <p>표시만 바뀌며 기록은 삭제되지 않아요. 합계는 전체 캐릭터 기준입니다.</p>
          <button className="secondary" onClick={() => setVisible(null)}>
            전체 선택
          </button>
          <button className="quiet" onClick={() => setVisible([])}>
            전체 해제
          </button>
          <div className="character-choices">
            {book.state.characters.map((c) => (
              <label className="character-choice" key={c.id}>
                <input
                  type="checkbox"
                  checked={!visible || visible.includes(c.id)}
                  onChange={(e) =>
                    setVisible(
                      e.target.checked
                        ? [...(visible || []), c.id]
                        : (visible || book.state.characters.map((c) => c.id)).filter(
                            (id) => id !== c.id,
                          ),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
          </div>
        </Dialog>
      )}
      {dialog === 'manage' && character && (
        <Dialog title={character.name + ' · 캐릭터 관리'} onClose={close}>
          <div className="manage-actions">
            <button className="primary" onClick={() => setDialog('scheduler')}>
              API · 스케줄러 가져오기
            </button>
            <button className="secondary" onClick={() => setDialog('roster')}>
              보스 구성 수정
            </button>
            <button className="secondary" onClick={() => setDialog('add')}>
              개별 / 월간 보스 추가
            </button>
            <button
              className="quiet"
              onClick={() => {
                const name = prompt('캐릭터 이름', character.name);
                if (name?.trim())
                  updateCharacter({
                    ...character,
                    name: name.trim().slice(0, 40),
                    profile: undefined,
                  });
              }}
            >
              이름 수정
            </button>
            <button
              className="quiet"
              onClick={() => {
                if (confirm(character.name + '의 보스 기록도 삭제할까요?')) {
                  book.change({
                    ...book.state,
                    characters: book.state.characters.filter((c) => c.id !== character.id),
                  });
                  close();
                }
              }}
            >
              캐릭터 삭제
            </button>
          </div>
        </Dialog>
      )}
      {dialog === 'roster' && character && (
        <RosterDialog
          character={character}
          catalog={catalog}
          date={date}
          saved={book.state.presets || []}
          onClose={close}
          onApply={(runs) => updateCharacter({ ...character, runs })}
          onSavePreset={(name, selection) => {
            const old = book.state.presets || [];
            book.change({
              ...book.state,
              presets: [
                ...old.filter((p) => p.name !== name),
                { name: name.slice(0, 40), selection },
              ],
            });
          }}
        />
      )}
      {dialog === 'add' && (
        <AddBossDialog catalog={catalog} date={date} onAdd={addRun} onClose={close} />
      )}
      {dialog === 'run' && run && character && (
        <RunDialog
          run={run}
          items={items}
          rules={rules}
          onClose={close}
          update={(r) =>
            updateCharacter({
              ...character,
              runs: character.runs.map((x) => (x.id === r.id ? r : x)),
            })
          }
          remove={() => {
            if (confirm('이 보스 기록을 삭제할까요?')) {
              updateCharacter({
                ...character,
                runs: character.runs.filter((x) => x.id !== run.id),
              });
              close();
            }
          }}
        />
      )}
    </div>
  );
}
