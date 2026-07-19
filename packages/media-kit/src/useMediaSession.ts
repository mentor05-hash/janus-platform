import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type RemoteTrack, type TrackPublication, type Participant } from 'livekit-client';
import type { JoinOptions, MediaSessionOptions, MediaStatus } from './types';

/**
 * useMediaSession — LiveKit 기반 1:1 음성(+화상) 세션 훅(미디어킷 코어, O79 M1).
 * 재접속·강등은 LiveKit SDK 에 위임(Reconnecting/Reconnected 이벤트만 상태로 노출).
 * 사용: localVideoRef/remoteVideoRef 를 <video> 에 꽂으면 트랙이 자동 attach 된다.
 * 원격 오디오는 숨김 <audio> 엘리먼트로 자동 재생(leave 시 정리).
 */
export function useMediaSession(opts: MediaSessionOptions) {
  const { video = false } = opts;
  const [status, setStatus] = useState<MediaStatus>('idle');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [remoteCamOn, setRemoteCamOn] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioElsRef = useRef<HTMLMediaElement[]>([]);
  // 프리플라이트에서 고른 장치 — toggleCam 재켜기에서도 유지한다.
  const deviceRef = useRef<{ audio?: string; video?: string }>({});
  // 콜백은 ref 로 고정 — 소비자 리렌더마다 룸을 재구성하지 않는다.
  const getTokenRef = useRef(opts.getToken);
  getTokenRef.current = opts.getToken;
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;

  function cleanup() {
    audioElsRef.current.forEach((el) => el.remove());
    audioElsRef.current = [];
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    roomRef.current = null;
    setStatus('idle'); setRemoteCamOn(false); setCamOn(false); setMicOn(true);
  }

  async function join(joinOpts?: JoinOptions) {
    if (roomRef.current) return; // 중복 입장 방지
    const wantVideo = joinOpts?.video ?? video;
    deviceRef.current = { audio: joinOpts?.audioDeviceId, video: joinOpts?.videoDeviceId };
    setStatus('connecting');
    onEventRef.current?.('join_attempt');
    const room = new Room();
    roomRef.current = room;
    try {
      const tok = await getTokenRef.current();
      if (!tok?.url || !tok?.token) throw new Error('미디어 토큰을 발급받지 못했습니다');
      const isRemote = (p: Participant) => p.identity !== room.localParticipant.identity;
      room
        .on(RoomEvent.Reconnecting, () => { setStatus('reconnecting'); onEventRef.current?.('reconnecting'); })
        .on(RoomEvent.Reconnected, () => setStatus('connected'))
        .on(RoomEvent.Disconnected, () => cleanup())
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Video) {
            if (remoteVideoRef.current) track.attach(remoteVideoRef.current);
            setRemoteCamOn(true);
          } else {
            const el = track.attach();
            el.style.display = 'none';
            document.body.appendChild(el);
            audioElsRef.current.push(el);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => { if (el !== remoteVideoRef.current) el.remove(); });
          if (track.kind === Track.Kind.Video) setRemoteCamOn(false);
        })
        .on(RoomEvent.TrackMuted, (pub: TrackPublication, p: Participant) => { if (isRemote(p) && pub.kind === Track.Kind.Video) setRemoteCamOn(false); })
        .on(RoomEvent.TrackUnmuted, (pub: TrackPublication, p: Participant) => { if (isRemote(p) && pub.kind === Track.Kind.Video) setRemoteCamOn(true); });
      await room.connect(tok.url, tok.token);
      const aid = deviceRef.current.audio;
      await room.localParticipant.setMicrophoneEnabled(true, aid ? { deviceId: aid } : undefined);
      setMicOn(true);
      if (wantVideo) {
        const vid = deviceRef.current.video;
        const pub = await room.localParticipant.setCameraEnabled(true, vid ? { deviceId: vid } : undefined);
        const t = pub?.track ?? [...room.localParticipant.videoTrackPublications.values()][0]?.track;
        if (t && localVideoRef.current) t.attach(localVideoRef.current);
        setCamOn(true);
      }
      setStatus('connected');
      onEventRef.current?.('connected');
    } catch (e) {
      onEventRef.current?.('failed', { message: e instanceof Error ? e.message : String(e) });
      try { await room.disconnect(); } catch { /* noop */ }
      cleanup();
    }
  }

  async function leave() {
    const room = roomRef.current;
    if (!room) return;
    onEventRef.current?.('left');
    try { await room.disconnect(); } catch { /* noop */ }
    cleanup(); // Disconnected 이벤트와 중복돼도 멱등
  }

  async function toggleMic() {
    const room = roomRef.current; if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  async function toggleCam() {
    const room = roomRef.current; if (!room) return;
    const next = !camOn;
    const vid = deviceRef.current.video;
    const pub = await room.localParticipant.setCameraEnabled(next, next && vid ? { deviceId: vid } : undefined);
    if (next) {
      const t = pub?.track ?? [...room.localParticipant.videoTrackPublications.values()][0]?.track;
      if (t && localVideoRef.current) t.attach(localVideoRef.current);
    }
    setCamOn(next);
  }

  useEffect(() => () => { void roomRef.current?.disconnect(); }, []); // 언마운트 정리

  return { status, micOn, camOn, remoteCamOn, join, leave, toggleMic, toggleCam, localVideoRef, remoteVideoRef };
}
