import { useMemo } from 'react';
import { RoomChatPanel, type RoomSession } from '../components/RoomChatPanel';
import { RoomWhiteboardPanel } from '../components/RoomWhiteboardPanel';

/** 룸 토큰의 payload(참가자 id 등) 디코드 — 서명 검증은 서버가 함. */
function decodeToken(t: string): { participantId?: string; roomId?: string } | null {
  try {
    const p = t.split('.')[1];
    const json = decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/'))));
    return JSON.parse(json);
  } catch { return null; }
}

/**
 * 완전 독립 실시간 룸 클라이언트(화이트라벨). 예약·멘토링 로그인 없이 룸 서비스에 바로 접속.
 * URL: /room?url=<룸서비스>&token=<참가자토큰>&kind=chat|whiteboard&title=제목
 * 룸은 features 플래그로 채팅 전용/화이트보드 전용을 이미 구분(호스트가 프로비저닝).
 */
export function RoomStandalonePage() {
  const q = new URLSearchParams(window.location.search);
  const url = q.get('url') ?? '';
  const token = q.get('token') ?? '';
  const kind = (q.get('kind') ?? 'chat') as 'chat' | 'whiteboard';
  const title = q.get('title') ?? (kind === 'whiteboard' ? '공유 화이트보드' : '채팅');
  // 강의 음성(LiveKit) — media-token 을 URL 로 전달(선택). publish=1 이면 선생님(송출).
  const mediaUrl = q.get('mediaUrl');
  const mediaToken = q.get('mediaToken');
  const media = mediaUrl && mediaToken ? { provider: 'livekit', url: mediaUrl, token: mediaToken } : null;
  const mediaPublish = q.get('publish') === '1';

  const session: RoomSession | null = useMemo(() => {
    if (!url || !token) return null;
    const payload = decodeToken(token);
    return {
      url, token,
      participantId: payload?.participantId ?? '',
      features: { chat: true, whiteboard: true, voice: true }, // 실제 게이팅은 join ack 로 갱신
      session: { restricted: false, state: 'open', opensAt: null, closesAt: null },
    };
  }, [url, token]);

  if (!session) {
    return <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', color: '#1e3550' }}>url · token 파라미터가 필요합니다. 예: <code>/room?url=…&token=…&kind=chat</code></div>;
  }
  const close = () => { /* 독립 페이지 — 닫기는 브라우저 탭 닫기로 */ };
  return kind === 'whiteboard'
    ? <RoomWhiteboardPanel bookingId="" title={title} onClose={close} session={session} media={media} mediaPublish={mediaPublish} />
    : <RoomChatPanel bookingId="" myId={session.participantId} title={title} onClose={close} session={session} />;
}
