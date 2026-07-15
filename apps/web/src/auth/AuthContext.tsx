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
