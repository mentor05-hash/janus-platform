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

/** multipart 업로드(파일). FormData 그대로 전송, Content-Type 은 브라우저가 설정. */
async function upload<T>(path: string, form: FormData): Promise<T> {
  const send = async () => {
    const headers: Record<string, string> = {};
    if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
    const res = await fetch(BASE + path, { method: 'POST', headers, body: form });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = json?.error ?? { code: 'ERROR', message: res.statusText };
      throw new ApiError(err.code, err.message, res.status);
    }
    return (json?.data ?? json) as T;
  };
  try {
    return await send();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (await tryRefresh())) return send();
    throw e;
  }
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
  upload,
  /** 인증 헤더 포함 파일 다운로드 → 브라우저 저장(첨부 열람용). */
  downloadFile: async (id: string, filename?: string) => {
    const res = await fetch(`${BASE}/files/${id}`, {
      headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {},
    });
    if (!res.ok) throw new ApiError('ERROR', '다운로드 실패', res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? id;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  /** 인증 헤더 포함 임의 경로 다운로드(내 데이터 내보내기 등). */
  downloadPath: async (path: string, filename: string) => {
    const res = await fetch(`${BASE}${path}`, {
      headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {},
    });
    if (!res.ok) throw new ApiError('ERROR', '다운로드 실패', res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  login: async (loginId: string, password: string) => {
    const data = await raw<{ accessToken: string; refreshToken: string }>(
      'POST',
      '/auth/login',
      { loginId, password },
      false,
    );
    tokens.set(data.accessToken, data.refreshToken);
  },
  signup: (body: { loginId: string; password: string; name: string; role: 'student' | 'teacher' | 'guardian'; centerId?: string }) =>
    raw<{ id: string; status: string }>('POST', '/auth/signup', body, false),
  logout: () => tokens.clear(),
};
