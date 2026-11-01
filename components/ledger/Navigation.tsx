'use client';
import { useState, type ReactNode } from 'react';

export function Navigation() {
  const [open, setOpen] = useState(false);
  return (
    <div className="ledger-navigation">
      <button
        type="button"
        aria-label="페이지 메뉴 열기"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ☰
      </button>
      {open && (
        <nav aria-label="페이지 메뉴">
          <PageLink href="/">사냥 가계부</PageLink>
          <PageLink href="/boss">보스 수익</PageLink>
        </nav>
      )}
    </div>
  );
}

// Full navigation preserves the beforeunload guard on unsaved ledger changes.
export function PageLink({
  href,
  children,
  className,
}: {
  href: '/' | '/boss';
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
