import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';

/**
 * 강의 음성(LiveKit) — 선생님 publish(마이크) / 학생 subscribe(수신). cfg 가 있을 때만 연결.
 * media-token 엔드포인트로 받은 { url, token } 을 넘긴다. publish=true 면 선생님(송출).
 */
export function useLiveKitAudio(cfg: { url?: string | null; token?: string | null; publish: boolean } | null) {
  const roomRef = useRef<Room | null>(null);
  const audiosRef = useRef<Set<HTMLMediaElement>>(new Set());
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cfg?.url || !cfg?.token) return;
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;
    const onSub = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.autoplay = true;
      el.muted = muted;
      audiosRef.current.add(el);
      document.body.appendChild(el);
    };
    room.on(RoomEvent.TrackSubscribed, onSub);
    room.on(RoomEvent.Disconnected, () => setConnected(false));
    room
      .connect(cfg.url, cfg.token)
      .then(async () => {
        if (cancelled) return;
        setConnected(true);
        if (cfg.publish) {
          await room.localParticipant.setMicrophoneEnabled(true);
          setMicOn(true);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : '음성 연결 실패'));
    return () => {
      cancelled = true;
      audiosRef.current.forEach((el) => { el.remove(); });
      audiosRef.current.clear();
      room.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.url, cfg?.token, cfg?.publish]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const on = !micOn;
    await room.localParticipant.setMicrophoneEnabled(on);
    setMicOn(on);
  }
  function toggleMute() {
    const nm = !muted;
    setMuted(nm);
    audiosRef.current.forEach((el) => { el.muted = nm; });
  }

  return { connected, micOn, muted, error, toggleMic, toggleMute };
}
