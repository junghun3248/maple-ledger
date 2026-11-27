import { useRef } from 'react';
import { bossStateSchema } from '@/contracts/boss/schema';
import { downloadJson } from '@/lib/ledger/backup';
import { errorMessage } from '@/lib/ledger/api';
import { dateKey } from './model';
import type { useBossBook } from './useBossBook';

export function BossDataMenu({
  book,
  onOpenBook,
}: {
  book: ReturnType<typeof useBossBook>;
  onOpenBook: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <>
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
              onClick={() => (book.name ? void book.save() : onOpenBook())}
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
        aria-label="보스 기록 파일 선택"
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
              confirm('현재 정산표를 백업 내용으로 바꿀까요? 저장 버튼을 눌러야 서버에 반영됩니다.')
            )
              book.change(next);
          } catch (e) {
            book.setStatus(errorMessage(e));
          }
        }}
      />
    </>
  );
}
