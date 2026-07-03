import { api } from './api';

/**
 * 오프라인 상담기록 큐(§선생님 모바일) — 약전파·오프라인에서 저장하면 localStorage 에 예약,
 * 온라인 복귀 시 자동 동기화. expo-web 대상(localStorage). 네이티브는 SecureStore 후결합.
 */
type Queued = { bookingId: string; payload: Record<string, unknown>; at: number };
const KEY = 'itall_note_queue';
const hasLS = () => typeof localStorage !== 'undefined';

function read(): Queued[] { if (!hasLS()) return []; try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function write(q: Queued[]) { if (hasLS()) localStorage.setItem(KEY, JSON.stringify(q)); }

export function queueNote(bookingId: string, payload: Record<string, unknown>, now: number) {
  const q = read().filter((it) => it.bookingId !== bookingId); // 같은 예약은 최신만
  q.push({ bookingId, payload, at: now });
  write(q);
}
export function queuedCount(): number { return read().length; }

/** 대기 중인 기록을 서버에 반영. 성공분만 제거. 반환: 동기화된 건수. */
export async function flushNotes(): Promise<number> {
  const q = read(); if (!q.length) return 0;
  const remain: Queued[] = []; let done = 0;
  for (const it of q) {
    try { await api.put(`/bookings/${it.bookingId}/note`, it.payload); done++; }
    catch { remain.push(it); }
  }
  write(remain);
  return done;
}

/** 온라인 복귀 시 자동 flush 리스너 등록(해제 함수 반환). */
export function onlineFlush(cb?: (n: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = () => { flushNotes().then((n) => { if (n && cb) cb(n); }); };
  window.addEventListener('online', h);
  return () => window.removeEventListener('online', h);
}
