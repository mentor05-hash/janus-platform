import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokens } from '../api/client';
import type { Me } from '../api/types';

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (loginId: string, password: string) => Promise<Me>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokens.access) {
      setLoading(false);
      return;
    }
    api
      .get<Me>('/me')
      .then(setUser)
      .catch(() => tokens.clear())
      .finally(() => setLoading(false));
  }, []);

  // 세션 충돌 방지 — 같은 브라우저의 다른 탭에서 다른 계정으로 로그인하면 토큰(localStorage)이
  // 공유되어 이 탭이 "화면은 이전 계정, 통신은 새 계정"인 유령 상태가 된다(채팅 좌우·읽음이 뒤섞임).
  // 다른 탭의 토큰 변경을 감지하면 즉시 리로드해 두 탭을 같은 계정으로 동기화한다.
  // (두 역할 동시 테스트는 시크릿 창·다른 브라우저 사용 — 저장소가 분리되어 충돌 없음)
  useEffect(() => {
    // JWT sub(계정 id) 추출 — 토큰 '회전'(같은 계정 재발급)은 무시하고 계정 변경·로그아웃만 동기화.
    const subOf = (t: string | null): string | null => {
      try {
        const b64 = (t ?? '').split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
        return b64 ? (JSON.parse(atob(b64)) as { sub?: string }).sub ?? null : null;
      } catch { return null; }
    };
    const h = (e: StorageEvent) => {
      if (e.key !== 'mp_access') return;
      if (subOf(e.oldValue) !== subOf(e.newValue)) window.location.reload();
    };
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  }, []);

  // 접합계약 C2 — 로그인 사용자의 진입/해제 서비스 목록을 localStorage.janus_sso 로 동기화.
  // 계산기(카이로스·알레아) iframe 이 같은 출처에서 이 값을 읽어 잠금 해제. 비로그인 시 제거.
  useEffect(() => {
    if (!user) {
      try { localStorage.removeItem('janus_sso'); } catch { /* 무시 */ }
      try { window.dispatchEvent(new CustomEvent('janus:sso', { detail: null })); } catch { /* 무시 */ }
      return;
    }
    api.get<{ tier: string; services: string[] }>('/sso/entitlements')
      .then((sso) => {
        try { localStorage.setItem('janus_sso', JSON.stringify(sso)); } catch { /* 무시 */ }
        try { window.dispatchEvent(new CustomEvent('janus:sso', { detail: sso })); } catch { /* 무시 */ }
      })
      .catch(() => { /* 계측·게이트는 UX 를 막지 않음 */ });
  }, [user?.id]);

  const login = async (loginId: string, password: string) => {
    await api.login(loginId, password);
    const me = await api.get<Me>('/me');
    setUser(me);
    return me;
  };

  const logout = () => {
    api.logout();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
