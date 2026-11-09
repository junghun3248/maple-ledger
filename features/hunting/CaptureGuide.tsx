'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Dialog } from '@/components/ledger/Dialog';
import './capture-guide.css';
const key = 'meso-storage-hide-capture-guide-v1';
export function CaptureGuide() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (localStorage.getItem(key) !== '1') setOpen(true);
      } catch {
        setOpen(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function dismissForever() {
    try {
      localStorage.setItem(key, '1');
      setOpen(false);
    } catch {
      setError('브라우저 저장이 차단돼 있어요. 저장 권한을 확인해 주세요.');
    }
  }
  return (
    <div className="capture-guide">
      <p>기타 탭 맨 왼쪽 위에 솔 에르다 조각을 두고, 메소 잔액이 보이게 사냥 전·후를 찍어주세요</p>
      <button type="button" className="text-btn" onClick={() => setOpen(true)}>
        촬영 예시 보기
      </button>
      {open && (
        <Dialog
          title="사냥 기록 촬영 안내"
          onClose={() => setOpen(false)}
          className="capture-dialog"
        >
          <p>
            ① 기타 탭의 첫 칸에 조각을 두세요. 예시 수량은 <strong>178개</strong>입니다.
          </p>
          <p>② 하단 메소 잔액까지 보이도록 사냥 전·후 두 장을 찍어주세요.</p>
          <div className="capture-example">
            <Image
              src="/hunting-example.webp"
              alt="기타 탭 첫 칸의 솔 에르다 조각 178개와 하단 메소 잔액이 보이는 인벤토리 촬영 예시"
              width={799}
              height={545}
              unoptimized
            />
            <span className="capture-first-slot" aria-hidden="true" />
            <span className="capture-meso" aria-hidden="true" />
          </div>
          <p className="capture-tip">
            솔 에르다 조각은 기타 탭 맨 왼쪽 위 첫 칸에 두세요. 인식한 숫자는 저장 전에 확인해
            주세요.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="capture-actions">
            <button type="button" className="text-btn" onClick={dismissForever}>
              다시 보지 않기
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              확인
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
