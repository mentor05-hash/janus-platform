import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks, type RemoteTrack, type LocalTrack } from 'livekit-client';
import { api } from '../api/client';

/**
 * M0 스파이크(O79) — LiveKit 실개통 + 화상 타일 검증 페이지(내부 점검용, 로그인 불요).
 * 두 브라우저(맥·폰)에서 이 페이지를 열어 입장하면 같은 룸(media-demo)에서 상호 영상·음성 확인.
 * MEDIA_PROVIDER=mock(미개통)이면 안내만 표시 — /room/demo(채팅·보드)와 별개의 미디어 전용 점검.
 */
type Tok = { provider: string; url: string | null; token: string | null; note?: string };

export function MediaDemoPage() {
  const [phase, setPhase] = useState<'idle' | 'joining' | 'joined' | 'mockOnly' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [peers, setPeers] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteBoxRef = useRef<HTMLDivElement | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);

  async function join() {
    setErr(''); setPhase('joining');
    try {
      const t = await api.post<Tok>('/media/demo-token', {});
      if (t.provider !== 'livekit' || !t.url || !t.token) { setPhase('mockOnly'); return; }
      const room = new Room();
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        const el = track.attach();
        if (track.kind === Track.Kind.Video) {
          el.style.width = '100%'; el.style.borderRadius = '10px';
          remoteBoxRef.current?.appendChild(el);
        } else {
          el.style.display = 'none';
          document.body.appendChild(el);
        }
        setPeers(room.remoteParticipants.size);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => { track.detach().forEach((el) => el.remove()); setPeers(room.remoteParticipants.size); });
      room.on(RoomEvent.ParticipantDisconnected, () => setPeers(room.remoteParticipants.size));
      room.on(RoomEvent.Disconnected, () => setPhase('idle'));
      await room.connect(t.url, t.token);
      const tracks = await createLocalTracks({ audio: true, video: { resolution: { width: 640, height: 480, frameRate: 24 } } });
      localTracksRef.current = tracks;
      for (const tr of tracks) await room.localParticipant.publishTrack(tr);
      const v = tracks.find((tr) => tr.kind === Track.Kind.Video);
      if (v && localVideoRef.current) v.attach(localVideoRef.current);
      setPeers(room.remoteParticipants.size);
      setPhase('joined');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '입장 실패');
      setPhase('error');
    }
  }
  function leave() {
    localTracksRef.current.forEach((tr) => { tr.stop(); });
    localTracksRef.current = [];
    roomRef.current?.disconnect();
    roomRef.current = null;
    if (remoteBoxRef.current) remoteBoxRef.current.innerHTML = '';
    setPeers(0); setPhase('idle');
  }
  useEffect(() => () => leave(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const card: React.CSSProperties = { border: '1px solid var(--line,#e3e8ef)', borderRadius: 14, padding: 16, marginBottom: 14, background: 'var(--surface,#fff)' };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 18px', fontFamily: 'system-ui, sans-serif', color: 'var(--ink,#16233a)' }}>
      <h1 style={{ fontSize: 21, margin: '0 0 6px' }}>미디어 점검 — LiveKit 화상 (M0)</h1>
      <p style={{ color: 'var(--muted,#5a6b83)', fontSize: 13.5, margin: '0 0 18px', lineHeight: 1.6 }}>
        두 기기(맥·폰)에서 이 페이지를 열고 각각 <b>입장</b>하면 같은 룸에서 서로의 영상·음성이 보여야 합니다.
        상담 화상(M1)의 기술 전제를 검증하는 내부 페이지입니다.
      </p>

      {phase === 'mockOnly' && (
        <div style={{ ...card, background: '#fff8e8', borderColor: '#f0dfae' }}>
          <b>LiveKit 미개통 (MEDIA_PROVIDER=mock)</b>
          <p style={{ fontSize: 13, margin: '6px 0 0', lineHeight: 1.7 }}>
            LiveKit Cloud 키를 발급받아 아래 ENV 로 api 를 재기동하면 이 페이지가 실동작합니다.<br />
            <code>MEDIA_PROVIDER=livekit LIVEKIT_URL=wss://… LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=…</code>
          </p>
        </div>
      )}
      {err && <div style={{ ...card, background: '#fbeae7', borderColor: '#f0cfc9', color: '#a64b37', fontSize: 13 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {phase !== 'joined'
          ? <button className="btn" disabled={phase === 'joining'} onClick={join}>{phase === 'joining' ? '입장 중…' : '📹 입장 (카메라+마이크)'}</button>
          : <button className="btn danger" onClick={leave}>나가기</button>}
        {phase === 'joined' && <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--chip-done,#2a8a5f)', fontWeight: 700 }}>연결됨 · 상대 {peers}명</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>내 화면</div>
          <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', borderRadius: 10, background: '#111' }} />
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>상대 화면</div>
          <div ref={remoteBoxRef} style={{ minHeight: 120 }}>
            {peers === 0 && <div style={{ fontSize: 12.5, color: 'var(--caption,#8a97a8)', padding: '30px 0', textAlign: 'center' }}>상대가 입장하면 여기에 영상이 나타납니다</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
