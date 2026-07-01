// 다크 모드 — data-theme 속성 + localStorage 지속. 브랜드 teal은 유지, 표면/텍스트/라인만 반전.
export type Theme = 'light' | 'dark';
const KEY = 'itall_theme';

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  return saved === 'dark' ? 'dark' : 'light';
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(KEY, t);
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

// 앱 부팅 시 저장된 테마를 즉시 반영(FOUC 방지)
export function initTheme() {
  applyTheme(getTheme());
}
