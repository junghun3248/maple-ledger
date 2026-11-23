'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ledger/Dialog';

const HIDE_KEY = 'maple-hunt-live-guide-hidden-v1';

/** 재획 타이머 사용 안내. 처음 들어오면 한 번 뜨고, "다시 보지 않기" 전까지 들어올 때마다 뜬다. */
export function LiveGuide() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  // 저장값은 브라우저에서만 읽을 수 있어 첫 렌더 뒤에 확인한다.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (localStorage.getItem(HIDE_KEY) !== '1') setOpen(true);
      } catch {
        setOpen(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function hideForever() {
    try {
      localStorage.setItem(HIDE_KEY, '1');
      setOpen(false);
    } catch {
      setError('브라우저 저장이 막혀 있어요. 사이트 저장 권한을 확인해 주세요.');
    }
  }

  return (
    <>
      <button type="button" className="live-quiet" onClick={() => setOpen(true)}>
        사용 안내
      </button>
      {open && (
        <Dialog title="재획 타이머 사용 안내" onClose={() => setOpen(false)} className="live-guide">
          <ol>
            <li>PC의 Chrome이나 Edge에서 열고, 게임은 창 모드나 테두리 없는 창 모드로 두세요.</li>
            <li>
              <b>재획 시작</b>을 누르면 화면 공유 창이 떠요. 메이플스토리 창을 골라 주세요.
            </li>
            <li>
              버프·야누스는 켜져 있을 때 <b>처음 한 번만 등록</b>하면 돼요. 룬은 미니맵을 드래그해
              등록하세요(사냥터가 바뀌면 새로 지정해 주세요). 끝나기 10초 전(룬은 뜰 때) 목소리로
              알려 줘요.
            </li>
            <li>
              <b>동꼽 방지</b>는 등록하지 않아도 돼요. 화면 맨 아래 경험치 바 숫자가 3초 동안 오르지
              않으면 &quot;캐릭터 움직이세요&quot;라고 알려 줘요.
            </li>
            <li>
              메소·조각은 인벤토리를 열고 <b>솔 에르다 조각을 기타 탭 첫 칸</b>에 둔 뒤, 메소 잔액이
              보이게 해서 사냥 전·후 읽기를 누르세요.
            </li>
          </ol>
          <div className="live-guide-example">
            <Image
              src="/hunting-example.webp"
              alt="기타 탭 첫 칸의 솔 에르다 조각과 하단 메소 잔액이 보이는 인벤토리 예시"
              width={799}
              height={545}
              unoptimized
            />
            <span className="live-guide-slot" aria-hidden="true" />
            <span className="live-guide-meso" aria-hidden="true" />
          </div>
          <p className="live-note">
            초록 칸: 기타 탭 첫 칸(솔 에르다 조각) · 노란 칸: 메소 잔액. 화면은 이 브라우저 안에서만
            보고 서버로 보내지 않아요.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="live-actions">
            <button type="button" className="live-quiet" onClick={hideForever}>
              다시 보지 않기
            </button>
            <button type="button" className="live-primary" onClick={() => setOpen(false)}>
              확인
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
