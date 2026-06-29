// API 클라이언트: JWT(access/refresh) 저장·자동 첨부·401 시 1회 갱신, {data}/{error} 언래핑.
const BASE = '/api/v1';
const ACCESS = 'itall_access';
const REFRESH = 'itall_refresh';

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS);
  },
  get refresh() {
    return localStorage.getItem(REFRESH);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS, access);
    localStorage.setItem(REFRESH, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },
};

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function raw<T>(method: string, path: string, body?: unknown, withAuth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = json?.error ?? { code: 'ERROR', message: res.statusText };
    throw new ApiError(err.code, err.message, res.status);
  }
  return (json?.data ?? json) as T;
}

async function tryRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false;
  try {
    const data = await raw<{ accessToken: string; refreshToken: string }>(
      'POST',
      '/auth/refresh',
      { refreshToken: tokens.refresh },
      false,
    );
    tokens.set(data.accessToken, data.refreshToken);
    return true;
  } catch {
    tokens.clear();
    return false;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await raw<T>(method, path, body);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && tokens.refresh) {
      if (await tryRefresh()) return raw<T>(method, path, body);
    }
    throw e;
  }
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
  login: async (loginId: string, password: string) => {
    const data = await raw<{ accessToken: string; refreshToken: string }>(
      'POST',
      '/auth/login',
      { loginId, password },
      false,
    );
    tokens.set(data.accessToken, data.refreshToken);
  },
  logout: () => tokens.clear(),
};
