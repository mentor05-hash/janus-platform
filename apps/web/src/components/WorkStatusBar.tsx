import { useEffect, useState } from 'react';
import { api } from '../api/client';

const WORK = [{ k: 'on', label: '근무중' }, { k: 'rest', label: '휴게중' }, { k: 'off', label: '퇴근' }] as const;

/**
 * 선생님 근무 상태(근무중/휴게중/퇴근) 토글 — 모바일 '오늘' 화면과 동일 계약.
 * GET /teachers/me/profile(workStatus) → PATCH /teachers/me/status. 휴게/퇴근이면 서버가
 * 학생 신규 신청을 차단(게이팅은 백엔드에서 이미 동작 — 웹에서도 상태 전환이 가능하도록).
 */
export function WorkStatusBar() {
  const [work, setWork] = useState<string | null>(null);
  useEffect(() => { api.get<{ workStatus?: string }>('/teachers/me/profile').then((p) => setWork(p.workStatus ?? 'on')).catch(() => setWork('on')); }, []);
  function set(k: string) {
    const prev = work; setWork(k);
    api.patch('/teachers/me/status', { status: k }).catch(() => setWork(prev)); // 실패 시 롤백
  }
  if (work === null) return null;
  const activeBg = (k: string) => (k === 'on' ? 'var(--teal)' : k === 'rest' ? '#CF9A3A' : 'var(--line)');
  const activeFg = (k: string) => (k === 'on' ? '#fff' : k === 'rest' ? '#5A3A00' : 'var(--ink)');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '2px 0 14px' }}>
      <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>근무 상태</span>
      <div role="group" aria-label="근무 상태" style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden' }}>
        {WORK.map((w) => {
          const on = work === w.k;
          return (
            <button key={w.k} type="button" aria-pressed={on} onClick={() => set(w.k)}
              style={{ border: 'none', cursor: 'pointer', padding: '6px 14px', fontSize: 13, fontWeight: 700, background: on ? activeBg(w.k) : 'var(--surface)', color: on ? activeFg(w.k) : 'var(--muted)' }}>
              {w.label}
            </button>
          );
        })}
      </div>
      {work !== 'on' && (
        <span style={{ fontSize: 12, color: work === 'rest' ? '#B07D18' : 'var(--muted)' }}>
          {work === 'rest' ? '🟠 휴게 중 — 새 상담 신청이 일시 중지됩니다.' : '⚫ 퇴근 — 새 상담 신청을 받지 않습니다.'}
        </span>
      )}
    </div>
  );
}
