'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Plus, Swords, Target } from 'lucide-react';

const actions = [
  {
    href: '/hunting#hunt-entry',
    label: '사냥 기록',
    hint: '스크린샷으로 메소·조각 입력',
    icon: CalendarDays,
  },
  { href: '/boss', label: '보스 정산', hint: '이번 주 클리어·물욕템', icon: Swords },
  { href: '/income?goal=new', label: '목표 만들기', hint: '모을 메소 정하기', icon: Target },
];

/** 상단 바의 "＋ 기록" 버튼: 자주 쓰는 입력 화면으로 바로 이동한다. */
export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div className="quick-add" ref={root}>
      <button
        type="button"
        className="quick-add-button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={16} aria-hidden />
        <span>기록</span>
      </button>
      {open && (
        <div className="quick-add-menu" role="menu">
          {actions.map(({ href, label, hint, icon: Icon }) => (
            <a key={href} href={href} role="menuitem" onClick={() => setOpen(false)}>
              <Icon size={18} aria-hidden />
              <span>
                <b>{label}</b>
                <small>{hint}</small>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
