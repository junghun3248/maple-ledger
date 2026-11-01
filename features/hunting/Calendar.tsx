import type { LedgerRecord } from '@/contracts/ledger/request';
import { dateKey, total, delta, money, signed, compact } from './model';
export function Calendar({
  records,
  month,
  selected,
  onMonth,
  onSelect,
  onEdit,
  onDelete,
}: {
  records: LedgerRecord[];
  month: string;
  selected: string;
  onMonth: (value: string) => void;
  onSelect: (value: string) => void;
  onEdit: (r: LedgerRecord) => void;
  onDelete: (r: LedgerRecord) => void;
}) {
  const day = new Date(month + '-01T12:00:00'),
    offset = day.getDay(),
    days = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  const rows = records.filter((r) => r.date.startsWith(month)),
    current = records.filter((r) => r.date === selected);
  const income = rows.reduce((n, r) => n + (delta(r, 'm') > 0n ? delta(r, 'm') : 0n), 0n),
    expense = income - total(rows, 'm');
  function shift(n: number) {
    day.setMonth(day.getMonth() + n);
    onMonth(dateKey(day).slice(0, 7));
  }
  return (
    <section className="panel calendar-panel">
      <div className="section-head">
        <h2>수확 캘린더</h2>
        <button
          className="text-btn"
          onClick={() => {
            onMonth(dateKey().slice(0, 7));
            onSelect(dateKey());
          }}
        >
          오늘
        </button>
      </div>
      <div className="month-nav">
        <button aria-label="이전 달" onClick={() => shift(-1)}>
          ‹
        </button>
        <h3>
          {day.getFullYear()}년 {day.getMonth() + 1}월
        </h3>
        <button aria-label="다음 달" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <section className="month-summary">
        <span>{day.getMonth() + 1}월 총 수입 메소</span>
        <strong>{money(income)} 메소</strong>
        <p>총 수입 · 메소가 증가한 기록의 합계</p>
        <div>
          <span>
            메소 감소 합계 <b>{money(expense)}</b>
          </span>
          <span>
            순증감 <b>{signed(total(rows, 'm'))}</b>
          </span>
          <span>
            조각 순증감 <b>{signed(total(rows, 'f'))}개</b>
          </span>
        </div>
        <small>거래·소비를 포함한 보유량 차이입니다.</small>
      </section>
      <div className="weekdays">
        {['일', '월', '화', '수', '목', '금', '토'].map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <div id="calendar">
        {Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
          const n = i - offset + 1;
          if (n < 1 || n > days) return <div key={i} className="day blank" />;
          const key = month + '-' + String(n).padStart(2, '0'),
            entries = rows.filter((r) => r.date === key);
          return (
            <button
              key={i}
              type="button"
              className={
                'day' + (selected === key ? ' selected' : '') + (dateKey() === key ? ' today' : '')
              }
              aria-label={`${key}, 기록 ${entries.length}회`}
              aria-pressed={selected === key}
              onClick={() => onSelect(key)}
            >
              <span className="num">{n}</span>
              {!!entries.length && (
                <>
                  <span className={'money' + (total(entries, 'm') < 0n ? ' negative' : '')}>
                    {compact(total(entries, 'm'))}
                  </span>
                  <span className="frag">✧ {signed(total(entries, 'f'))}개</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="calendar-note">기록이 있는 날을 눌러 자세히 보세요</div>
      <div className="day-head">
        <h3>
          {Number(selected.slice(5, 7))}월 {Number(selected.slice(8))}일의 기록
        </h3>
        <button className="text-btn" onClick={() => onSelect(selected)}>
          이 날짜에 기록 +
        </button>
      </div>
      <div>
        {!current.length && <div className="empty">아직 기록이 없어요.</div>}
        {current.map((r) => (
          <article key={r.id} className="record">
            <div className="record-top">
              <strong className={delta(r, 'm') < 0n ? 'negative' : ''}>
                {signed(delta(r, 'm'))} 메소
              </strong>
              <span>✧ {signed(delta(r, 'f'))}개</span>
            </div>
            <p>{r.memo || '메모 없는 사냥 기록'}</p>
            <small>
              {r.minutes
                ? `${r.minutes}분 사냥 · 시간당 ${signed((delta(r, 'm') * 60n) / BigInt(r.minutes))} 메소`
                : '사냥 시간 미입력'}
            </small>
            <div className="record-actions">
              <button className="text-btn" onClick={() => onEdit(r)}>
                수정
              </button>
              <button className="text-btn" onClick={() => onDelete(r)}>
                삭제
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
