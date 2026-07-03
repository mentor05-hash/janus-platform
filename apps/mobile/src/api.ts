import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// 우선순위: EXPO_PUBLIC_API_BASE(빌드 주입, 웹 배포 시 '/api/v1' 상대경로)
//  → app.json extra.apiBase(네이티브 기본) → localhost(개발).
const BASE: string =
  (process.env.EXPO_PUBLIC_API_BASE as string) ??
  (Constants.expoConfig?.extra?.apiBase as string) ??
  'http://localhost:3000/api/v1';

// 토큰 저장: 네이티브=SecureStore, 웹(expo-web 프리뷰)=localStorage(SecureStore 웹 미지원).
const store = {
  get: (k: string): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null)
      : SecureStore.getItemAsync(k),
  set: (k: string, v: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.setItem(k, v))
      : SecureStore.setItemAsync(k, v).then(() => undefined),
  del: (k: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.removeItem(k))
      : SecureStore.deleteItemAsync(k).then(() => undefined),
};

let accessToken: string | null = null;
let refreshToken: string | null = null;

export async function loadTokens() {
  accessToken = await store.get('mp_access');
  refreshToken = await store.get('mp_refresh');
}
async function setTokens(a: string, r: string) {
  accessToken = a;
  refreshToken = r;
  await store.set('mp_access', a);
  await store.set('mp_refresh', r);
}
export async function clearTokens() {
  accessToken = null;
  refreshToken = null;
  await store.del('mp_access');
  await store.del('mp_refresh');
}
export const hasSession = () => !!accessToken;
/** 현재 액세스 토큰(네이티브 WebView 세션 주입용). */
export const getAccessToken = () => accessToken;

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = json?.error ?? { code: 'ERROR', message: res.statusText };
    throw new ApiError(e.code, e.message, res.status);
  }
  return (json?.data ?? json) as T;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await raw<T>(method, path, body);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && refreshToken) {
      try {
        const d = await raw<Tokens>('POST', '/auth/refresh', { refreshToken }, false);
        await setTokens(d.accessToken, d.refreshToken);
        return raw<T>(method, path, body);
      } catch {
        await clearTokens();
      }
    }
    throw e;
  }
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
  me: () => request<Me>('GET', '/me'),
  login: async (loginId: string, password: string) => {
    const d = await raw<Tokens>('POST', '/auth/login', { loginId, password }, false);
    await setTokens(d.accessToken, d.refreshToken);
  },
  logout: clearTokens,
  /** 웹(expo-web) 임의 경로 다운로드(인증 헤더 포함). 예: /files/:id, /materials/:id/download */
  downloadWebPath: async (path: string, name: string) => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(BASE + path, { headers });
    if (!res.ok) throw new ApiError('ERROR', '다운로드 실패', res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
  /** 첨부 파일(/files/:id) 다운로드. */
  downloadWeb: async (id: string, name: string) => api.downloadWebPath('/files/' + id, name),
  /** 인증 헤더로 파일을 받아 object URL 반환(이미지 인라인 표시용, expo-web). */
  fileBlobUrl: async (id: string): Promise<string> => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(BASE + '/files/' + id, { headers });
    if (!res.ok) throw new ApiError('ERROR', '이미지 로드 실패', res.status);
    return URL.createObjectURL(await res.blob());
  },
  /** 웹(expo-web) 파일 업로드 → stored_file. 첨부 id 를 예약에 연결. */
  uploadWeb: async (file: Blob, name: string) => {
    const form = new FormData();
    form.append('file', file, name);
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(BASE + '/files', { method: 'POST', headers, body: form });
    const text = await res.text();
    const j = text ? JSON.parse(text) : {};
    if (!res.ok) throw new ApiError(j?.error?.code ?? 'ERROR', j?.error?.message ?? '업로드 실패', res.status);
    return (j?.data ?? j) as { id: string; filename: string; contentType: string };
  },
};

// ── 뷰 타입 ──
export interface Attachment {
  id: string;
  name: string;
  type?: string;
}
export interface Booking {
  id: string;
  studentId: string;
  teacherId: string;
  consultType: string | null;
  mode: string;
  direction: string;
  start: string | null;
  end: string | null;
  status: string;
  chargedCredits: number;
  content?: string | null;
  attachments?: Attachment[];
}
export interface Me {
  id: string;
  role: 'student' | 'teacher' | 'admin' | 'hr' | 'guardian';
  name: string;
}
export interface Child {
  linkId: string;
  studentId: string;
  name: string | null;
  relation: string | null;
  centerName?: string | null;
  schoolGrade?: string | null;
  isHomeroom?: boolean;
  membershipGrade?: string | null;
  weeklyCredits?: number;
  balance?: number;
  lastStatus?: string | null;
  lastAt?: string | null;
}
export interface Note {
  bookingId: string;
  teacherName?: string | null;
  consultType?: string | null;
  coreSummary: string | null;
  homework: string | null;
  futureDir: string | null;
  saveState: 'draft' | 'final';
  createdAt?: string;
}
export interface PaymentRequest {
  id: string;
  student_id: string;
  needed_credits: number;
  status: 'open' | 'done' | 'rejected' | 'expired';
  origin: string;
  created_at: string;
}
export interface ChildCredits {
  account: { purchasedBalance: number; grantedBalance: number; total: number };
  transactions: { id: string; type: string; amount: number; balance: number; description: string | null; created_at: string }[];
}
export interface Teacher {
  id: string;
  name: string;
  subjects: string[];
  grade: string;
  category: string | null;
  rating: number | null;
  totalConsult?: number;
  questionCount?: number;
  offlineAvailable?: boolean;
  modes?: string[];
}
export interface Slot {
  index: number;
  time: string;
  status: 'avail' | 'booked' | 'rest' | 'off' | 'blocked';
}
export interface Quote {
  minutes: number;
  credits: number;
  valid: boolean;
  message: string;
}
export interface CreditAccount {
  purchasedBalance: number;
  grantedBalance: number;
  total: number;
}
