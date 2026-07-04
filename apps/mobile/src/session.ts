import { useEffect, useState } from 'react';

/** 서버가 chat:join / wb:join 에서 내려주는 세션 시간창 정보. */
export type SessionInfo = { restricted: boolean; state: 'before' | 'open' | 'closed'; opensAt: string | null; closesAt: string | null };
export type Phase = 'unrestricted' | 'before' | 'open' | 'closed';

export function phaseOf(s: SessionInfo | null): Phase {
  if (!s || !s.restricted) return 'unrestricted';
  const now = Date.now();
  const o = s.opensAt ? Date.parse(s.opensAt) : 0;
  const c = s.closesAt ? Date.parse(s.closesAt) : 0;
  return now < o ? 'before' : now > c ? 'closed' : 'open';
}

export const canInteract = (p: Phase) => p === 'unrestricted' || p === 'open';

/** 시간창 경계(개장/폐장)에서 자동 재렌더 → 강제 종료·자동 개방 반영. */
export function useSessionPhase(s: SessionInfo | null): Phase {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s || !s.restricted) return;
    const now = Date.now();
    const marks = [s.opensAt ? Date.parse(s.opensAt) : 0, s.closesAt ? Date.parse(s.closesAt) : 0].filter((m) => m > now);
    const timers = marks.map((m) => setTimeout(() => tick((t) => t + 1), m - now + 300));
    return () => timers.forEach(clearTimeout);
  }, [s]);
  return phaseOf(s);
}

const HM = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '');

export function sessionNotice(p: Phase, s: SessionInfo | null): string | null {
  if (p === 'before') return `상담 시작 5분 전(${HM(s?.opensAt ?? null)})부터 이용할 수 있어요.`;
  if (p === 'closed') return '상담이 종료되어 기록 열람만 가능합니다.';
  return null;
}
