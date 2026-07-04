import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ChatPanel } from './ChatPanel';
import { RoomChatPanel, type RoomSession } from './RoomChatPanel';

type SessionResp = { enabled: boolean } & Partial<RoomSession>;
const ROOMS_ON = import.meta.env.VITE_REALTIME_ROOMS === 'true';

/**
 * 채팅 전송 방식 선택기(점진 이관). VITE_REALTIME_ROOMS='true' 이고 브리지가 룸 세션을
 * 내주면 룸 서비스(RoomChatPanel), 아니면 기존 in-app(ChatPanel). 기본은 기존 동작.
 */
export function SessionChatPanel(props: { bookingId: string; myId: string; title?: string; onClose: () => void }) {
  const [resolved, setResolved] = useState(!ROOMS_ON);
  const [rs, setRs] = useState<RoomSession | null>(null);

  useEffect(() => {
    if (!ROOMS_ON) return;
    let live = true;
    api.post<SessionResp>(`/bookings/${props.bookingId}/realtime-session`)
      .then((s) => { if (!live) return; if (s.enabled && s.token && s.url) setRs(s as RoomSession); setResolved(true); })
      .catch(() => { if (live) setResolved(true); });
    return () => { live = false; };
  }, [props.bookingId]);

  if (!resolved) return null; // 플래그 on 일 때만 아주 짧게 — 실패/비활성이면 기존 패널로 폴백
  if (ROOMS_ON && rs) return <RoomChatPanel {...props} session={rs} />;
  return <ChatPanel {...props} />;
}
