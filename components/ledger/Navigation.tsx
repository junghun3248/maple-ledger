'use client';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  CalendarDays,
  Swords,
  ChartNoAxesCombined,
  Sparkles,
  Gift,
  Menu,
  X,
} from 'lucide-react';
import './site-nav.css';
const destinations = [
  { path: '/', name: '사냥 기록', icon: CalendarDays },
  { path: '/boss', name: '보스 정산', icon: Swords },
  { path: '/income', name: '수입 추이', icon: ChartNoAxesCombined },
  { path: '/simulator', name: '장비 강화', icon: Sparkles },
  { path: '/simulator/cash', name: '캐시 뽑기', icon: Gift },
] as const;
export function Navigation() {
  const pathname = usePathname(),
    [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(e: PointerEvent) {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const current = destinations.find((d) => d.path === pathname);
  return (
    <div className="maple-sitebar" ref={root}>
      <div className="maple-sitebar-inner">
        <a className="maple-home" href="/">
          <BookOpen size={20} aria-hidden />
          메이플 가계부
        </a>
        <button
          className="maple-menu"
          ref={trigger}
          type="button"
          aria-controls="maple-destinations"
          aria-expanded={open}
          aria-label={open ? '페이지 메뉴 닫기' : '페이지 메뉴 열기'}
          onClick={() => setOpen((v) => !v)}
        >
          {current?.name || '메뉴'} {open ? <X size={19} /> : <Menu size={19} />}
        </button>
        <nav id="maple-destinations" aria-label="페이지 메뉴" data-open={open}>
          {destinations.map(({ path, name, icon: Icon }) => (
            <a key={path} href={path} aria-current={pathname === path ? 'page' : undefined}>
              <Icon size={17} aria-hidden />
              {name}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
export function PageLink({
  href,
  children,
  className,
}: {
  href: (typeof destinations)[number]['path'];
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
