import { useState } from 'react';
import { getTheme, toggleTheme, type Theme } from '../theme';

// 라이트/다크 전환 토글 — 각 레이아웃 하단에 배치
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(getTheme());
  const dark = theme === 'dark';
  return (
    <button
      onClick={() => setTheme(toggleTheme())}
      title={dark ? '라이트 모드로' : '다크 모드로'}
      aria-label="테마 전환"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: compact ? '4px 9px' : '6px 12px', borderRadius: 999,
        border: '1px solid var(--line)', background: 'var(--surface)',
        color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 13 }}>{dark ? '☀️' : '🌙'}</span>
      {!compact && <span>{dark ? '라이트' : '다크'}</span>}
    </button>
  );
}
