import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { WhiteboardPanel } from './WhiteboardPanel';
import { RoomWhiteboardPanel } from './RoomWhiteboardPanel';
import type { RoomSession } from './RoomChatPanel';

type SessionResp = { enabled: boolean } & Partial<RoomSession>;
const ROOMS_ON = import.meta.env.VITE_REALTIME_ROOMS === 'true';

/** 화이트보드 방식 선택기(점진 이관). 플래그 on + 룸 세션 + whiteboard 기능이면 룸, 아니면 기존. */
export function SessionWhiteboardPanel(props: { bookingId: string; title?: string; onClose: () => void }) {
  const [resolved, setResolved] = useState(!ROOMS_ON);
  const [rs, setRs] = useState<RoomSession | null>(null);
  useEffect(() => {
    if (!ROOMS_ON) return;
    let live = true;
    api.post<SessionResp>(`/bookings/${props.bookingId}/realtime-session`)
      .then((s) => { if (!live) return; if (s.enabled && s.token && s.url && s.features?.whiteboard) setRs(s as RoomSession); setResolved(true); })
      .catch(() => { if (live) setResolved(true); });
    return () => { live = false; };
  }, [props.bookingId]);
  if (!resolved) return null;
  if (ROOMS_ON && rs) return <RoomWhiteboardPanel {...props} session={rs} />;
  return <WhiteboardPanel {...props} />;
}
