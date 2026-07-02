import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../auth/AuthContext';

/** 알림 타입 코드 → 한글 문구(간단 매핑). 미정의 타입은 코드 그대로 노출. */
const LABEL: Record<string, string> = {
  booking_confirmed: '예약이 확정되었어요.',
  booking_rejected: '예약이 거절되었어요.',
  booking_cancelled: '예약이 취소되었어요.',
  booking_reminder: '곧 상담이 시작돼요.',
  booking_new: '새 상담 신청이 들어왔어요.',
  note_shared: '상담 기록이 공유되었어요.',
  reverse_proposed: '역상담 제안이 도착했어요.',
  reverse_accepted: '역상담 제안이 수락되었어요.',
  qna_answered: '질문에 답변이 달렸어요.',
  qna_assigned: '새 질문이 배정되었어요.',
  payment_requested: '결제 요청이 도착했어요.',
  announcement: '새 공지가 있어요.',
  announcement_reminder: '예약 공지 발송 예정이에요.',
  score_uploaded: '성적이 업데이트되었어요.',
};

type Toast = { id: number; text: string };

/** 로그인 사용자용 전역 실시간 알림 수신기. notif:new 이벤트를 토스트로 표시. */
export function RealtimeNotifier() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('itall_access') ?? '';
    if (!token) return;
    const s: Socket = io(window.location.origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
    s.on('notif:new', (n: { type: string; payload?: Record<string, unknown> }) => {
      const text = (typeof n?.payload?.message === 'string' && n.payload.message) || LABEL[n?.type] || '새 알림이 도착했어요.';
      const id = ++seq.current;
      setToasts((p) => [...p, { id, text }]);
      // 배지 갱신용 커스텀 이벤트(알림 페이지·레이아웃이 구독 가능)
      window.dispatchEvent(new CustomEvent('itall:notif', { detail: n }));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
    });
    return () => { s.disconnect(); };
  }, [user]);

  if (!user || toasts.length === 0) return null;
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
          style={{ background: 'var(--teal)', color: '#fff', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, boxShadow: '0 6px 20px rgba(8,16,20,0.25)', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}
        >
          <span style={{ fontSize: 16 }}>🔔</span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
