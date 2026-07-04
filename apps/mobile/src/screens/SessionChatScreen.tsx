import { useEffect, useState } from 'react';
import { api } from '../api';
import { ChatScreen } from './ChatScreen';
import { RoomChatScreen, type RoomSession } from './RoomChatScreen';

type SessionResp = { enabled: boolean } & Partial<RoomSession>;
const ROOMS_ON = process.env.EXPO_PUBLIC_REALTIME_ROOMS === 'true';

/** 채팅 전송 방식 선택기(점진 이관). 플래그 on + 브리지 세션이면 룸 서비스, 아니면 기존 in-app. */
export function SessionChatScreen(props: { bookingId: string; myId: string; title: string; onClose: () => void; embedded?: boolean }) {
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
  if (!resolved) return null;
  if (ROOMS_ON && rs) return <RoomChatScreen {...props} session={rs} />;
  return <ChatScreen {...props} />;
}
