'use client';
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

type Theme = 'system' | 'light' | 'dark';
const order: Theme[] = ['system', 'light', 'dark'];
const labels: Record<Theme, string> = { system: '기기 설정', light: '라이트', dark: '다크' };
const icons = { system: Monitor, light: Sun, dark: Moon };

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem('maple-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const timer = setTimeout(() => setTheme(readTheme()), 0);
    return () => clearTimeout(timer);
  }, []);
  function next() {
    const value = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(value);
    try {
      if (value === 'system') localStorage.removeItem('maple-theme');
      else localStorage.setItem('maple-theme', value);
    } catch {}
    if (value === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
  }
  const Icon = icons[theme];
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={next}
      aria-label={`화면 테마: ${labels[theme]} (눌러서 변경)`}
      title={`테마: ${labels[theme]}`}
    >
      <Icon size={17} aria-hidden />
    </button>
  );
}
