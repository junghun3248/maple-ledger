'use client';
import { useRef, useState } from 'react';

import './hunting.css';
import '@/components/ledger/ledger.css';
import { z } from 'zod';
import { ledgerRecordSchema } from '@/contracts/ledger/schema';
import type { LedgerRecord } from '@/contracts/ledger/request';
import { BookDialog } from '@/components/ledger/BookDialog';
import { Navigation, PageLink } from '@/components/ledger/Navigation';
import { downloadJson } from '@/lib/ledger/backup';
import { errorMessage } from '@/lib/ledger/api';
import { useHuntingBook } from './useHuntingBook';
import { Calendar } from './Calendar';
import { ScreenshotReader } from './ScreenshotReader';
import { dateKey, total, signed } from './model';
type Values = Record<'bm' | 'am' | 'bf' | 'af', string>;
const empty: Values = { bm: '', am: '', bf: '', af: '' };
export function HuntingPage() {
  const book = useHuntingBook();
  const [selected, setSelected] = useState(dateKey()),
    [month, setMonth] = useState(dateKey().slice(0, 7)),
    [date, setDate] = useState(dateKey());
  const [values, setValues] = useState<Values>(empty),
    [minutes, setMinutes] = useState(''),
    [memo, setMemo] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [reading, setReading] = useState(false),
    [imageKey, setImageKey] = useState(0),
    [showBook, setShowBook] = useState(false);
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const form = useRef<HTMLFormElement>(null),
    file = useRef<HTMLInputElement>(null);
  const rows = book.records.filter((r) => r.date.startsWith(month));
  function reset() {
    setEditing(null);
    setValues(empty);
    setMemo('');
    setMinutes('');
    setConfirmed(false);
    setImageKey((k) => k + 1);
    setReading(false);
  }
  function select(d: string) {
    setSelected(d);
    setDate(d);
  }
  function edit(r: LedgerRecord) {
    reset();
    setEditing({ id: r.id, revision: book.revision });
    setValues({ bm: r.bm, am: r.am, bf: r.bf, af: r.af });
    setDate(r.date);
    setMinutes(r.minutes ? String(r.minutes) : '');
    setMemo(r.memo);
    form.current?.scrollIntoView({ behavior: 'smooth' });
  }
  function difference(k: 'm' | 'f') {
    const b = values[k === 'm' ? 'bm' : 'bf'].replace(/,/g, ''),
      a = values[k === 'm' ? 'am' : 'af'].replace(/,/g, '');
    return /^\d{1,16}$/.test(b) && /^\d{1,16}$/.test(a) ? signed(BigInt(a) - BigInt(b)) : '—';
  }
  async function restore(records: LedgerRecord[]) {
    const known = new Set(book.records.map((r) => r.id));
    const add = records.filter((r) => !known.has(r.id) && known.add(r.id));
    return book.persist([...book.records, ...add]);
  }
  return (
    <div className="hunting-page">
      <header>
        <Navigation />
        <PageLink href="/" className="brand">
          ✦ 메이플 가계부
        </PageLink>
        <button id="cloudStatus" className="secondary" onClick={() => setShowBook(true)}>
          {book.name ? '● ' + book.name + ' · 서버 저장' : '기록장을 열어 주세요'}
        </button>
      </header>
      <main>
        <section className="intro">
          <div>
            <span className="eyebrow">MY MAPLE STORY, ON RECORD</span>
            <h1>
              오늘의 사냥을,
              <br />
              차곡차곡 기록해요.
            </h1>
            <p>전후 스크린샷으로 메소와 솔 에르다 조각 수익을 확인하세요.</p>
          </div>
        </section>
        <p id="bookStatus" role="status">
          {book.status}
        </p>
        {book.name && (
          <div className="book-actions">
            <button className="text-btn" disabled={book.busy} onClick={() => void book.load()}>
              서버 새로고침
            </button>
            <button
              className="text-btn"
              disabled={book.busy}
              onClick={async () => {
                try {
                  const old = z
                    .array(ledgerRecordSchema)
                    .parse(JSON.parse(localStorage.getItem('maple-ledger-v1') || '[]'));
                  if (!old.length) {
                    book.setStatus('이 브라우저에 이전 기록이 없어요.');
                    return;
                  }
                  if (confirm('이 브라우저의 이전 기록을 가져올까요? 원본은 유지됩니다.'))
                    await restore(old);
                } catch (e) {
                  book.setStatus(errorMessage(e));
                }
              }}
            >
              이 브라우저의 이전 기록 가져오기
            </button>
            <button
              className="text-btn"
              disabled={book.busy || reading}
              onClick={async () => {
                await book.close();
                reset();
              }}
            >
              기록장 닫기
            </button>
          </div>
        )}
        <section className="stats">
          <article>
            <span>선택한 달 · 메소 순증감</span>
            <strong>{signed(total(rows, 'm'))} 메소</strong>
          </article>
          <article>
            <span>솔 에르다 조각</span>
            <strong>{signed(total(rows, 'f'))} 개</strong>
          </article>
          <article>
            <span>사냥 기록</span>
            <strong>{rows.length} 회</strong>
            <small>기록한 날 {new Set(rows.map((r) => r.date)).size}일</small>
          </article>
        </section>
        <div className="workspace">
          <section className="panel entry">
            <div className="section-head">
              <h2>{editing ? '사냥 기록 수정' : '새 사냥 기록'}</h2>
              <span className="badge">사진 → 확인 → 저장</span>
            </div>
            <form
              id="entryForm"
              ref={form}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!book.name) {
                  setShowBook(true);
                  return;
                }
                if (editing && editing.revision !== book.revision) {
                  book.setStatus(
                    '다른 기기의 변경을 불러왔어요. 입력 내용을 복사한 뒤 수정 버튼을 다시 눌러 주세요.',
                  );
                  return;
                }
                const data = ledgerRecordSchema.safeParse({
                  id: editing?.id || crypto.randomUUID(),
                  date,
                  bm: values.bm.replace(/,/g, ''),
                  am: values.am.replace(/,/g, ''),
                  bf: values.bf.replace(/,/g, ''),
                  af: values.af.replace(/,/g, ''),
                  memo: memo.trim(),
                  minutes: minutes ? Number(minutes) : null,
                });
                if (!data.success) {
                  book.setStatus('날짜·시간·메소·조각 입력값을 확인해 주세요.');
                  return;
                }
                if (
                  await book.persist(
                    editing
                      ? book.records.map((r) => (r.id === editing.id ? data.data : r))
                      : [...book.records, data.data],
                  )
                ) {
                  select(date);
                  setMonth(date.slice(0, 7));
                  reset();
                }
              }}
            >
              <div className="fields top-fields">
                <label>
                  기록 날짜
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  사냥 시간 (분, 선택)
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={minutes}
                    placeholder="예: 60"
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </label>
              </div>
              <ScreenshotReader
                key={imageKey}
                onRead={(next) => {
                  setValues((v) => ({ ...v, ...next }));
                  setConfirmed(false);
                }}
                onBusy={setReading}
              />
              {(['m', 'f'] as const).map((k) => (
                <section className="value-section" key={k}>
                  <div className="value-title">
                    <h3>{k === 'm' ? '메소' : '솔 에르다 조각'}</h3>
                    <span>{k === 'm' ? '보유량 차이' : '첫 번째 칸의 수량'}</span>
                  </div>
                  <div className="fields">
                    {(['b', 'a'] as const).map((side) => {
                      const key =
                        side === 'b' ? (k === 'm' ? 'bm' : 'bf') : k === 'm' ? 'am' : 'af';
                      return (
                        <label key={key}>
                          {side === 'b' ? '사냥 전' : '사냥 후'}
                          <input
                            required
                            inputMode="numeric"
                            pattern="[0-9,]{1,22}"
                            disabled={reading}
                            value={values[key]}
                            onChange={(e) => {
                              setValues({ ...values, [key]: e.target.value });
                              setConfirmed(false);
                            }}
                            onBlur={() => {
                              const n = values[key].replace(/,/g, '');
                              if (/^\d{1,16}$/.test(n))
                                setValues((v) => ({
                                  ...v,
                                  [key]: BigInt(n).toLocaleString('ko-KR'),
                                }));
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <div className="delta">
                    {difference(k)} {k === 'm' ? '메소' : '개'}
                  </div>
                </section>
              ))}
              <label>
                메모
                <input
                  maxLength={200}
                  value={memo}
                  placeholder="사냥터, 획득 아이템 등"
                  onChange={(e) => setMemo(e.target.value)}
                />
              </label>
              <label className="confirm">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                사진과 숫자를 확인했어요.
              </label>
              <button id="save" className="primary" disabled={reading || book.busy}>
                {editing ? '수정한 기록 저장' : '캘린더에 기록하기 ↗'}
              </button>
              {editing && (
                <button type="button" className="text-btn" disabled={reading} onClick={reset}>
                  수정 취소
                </button>
              )}
            </form>
          </section>
          <Calendar
            records={book.records}
            month={month}
            selected={selected}
            onMonth={setMonth}
            onSelect={select}
            onEdit={(r) => {
              if (!reading) edit(r);
            }}
            onDelete={async (r) => {
              if (
                confirm('이 사냥 기록을 삭제할까요?') &&
                (await book.persist(book.records.filter((x) => x.id !== r.id)))
              ) {
                if (editing?.id === r.id) reset();
              }
            }}
          />
        </div>
        <div className="backup">
          <span>내 기록 보관함</span>
          <div>
            <button
              className="text-btn"
              onClick={() =>
                downloadJson(
                  { version: 1, records: book.records },
                  '메이플-가계부-' + dateKey() + '.json',
                )
              }
            >
              백업 ↓
            </button>
            <button className="text-btn" disabled={book.busy} onClick={() => file.current?.click()}>
              복원 ↑
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  if (f.size > 5000000) throw Error('파일이 너무 커요.');
                  const data = z
                    .object({ version: z.literal(1), records: z.array(ledgerRecordSchema) })
                    .parse(JSON.parse((await f.text()).replace(/^\uFEFF/, '')));
                  await restore(data.records);
                } catch (e) {
                  book.setStatus(errorMessage(e));
                }
              }}
            />
          </div>
        </div>
        <footer>
          MAPLE LEDGER <span>비밀번호 기록장 · 기기 간 서버 저장</span>
        </footer>
      </main>
      {showBook && (
        <BookDialog
          onClose={() => setShowBook(false)}
          onOpened={async () => {
            reset();
            await book.load();
          }}
        />
      )}
    </div>
  );
}
