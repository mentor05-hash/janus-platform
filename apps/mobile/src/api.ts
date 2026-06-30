import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BASE: string = (Constants.expoConfig?.extra?.apiBase as string) ?? 'http://localhost:3000/api/v1';

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
  accessToken = await store.get('itall_access');
  refreshToken = await store.get('itall_refresh');
}
async function setTokens(a: string, r: string) {
  accessToken = a;
  refreshToken = r;
  await store.set('itall_access', a);
  await store.set('itall_refresh', r);
}
export async function clearTokens() {
  accessToken = null;
  refreshToken = null;
  await store.del('itall_access');
  await store.del('itall_refresh');
}
export const hasSession = () => !!accessToken;

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
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  me: () => request<Me>('GET', '/me'),
  login: async (loginId: string, password: string) => {
    const d = await raw<Tokens>('POST', '/auth/login', { loginId, password }, false);
    await setTokens(d.accessToken, d.refreshToken);
  },
  logout: clearTokens,
};

// ── 뷰 타입 ──
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
}
export interface Note {
  bookingId: string;
  coreSummary: string | null;
  homework: string | null;
  futureDir: string | null;
  saveState: 'draft' | 'final';
}
export interface PaymentRequest {
  id: string;
  student_id: string;
  needed_credits: number;
  status: 'open' | 'done' | 'rejected' | 'expired';
  origin: string;
  created_at: string;
}
export interface Teacher {
  id: string;
  name: string;
  subjects: string[];
  grade: string;
  category: string | null;
  rating: number | null;
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
