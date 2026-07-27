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
  const [shareOn, setShareOn] = useState(false); // M2 — 내 화면공유 중
  const [remoteShareOn, setRemoteShareOn] = useState(false); // 상대 화면공유 수신 중
  const [blurOn, setBlurOn] = useState(false); // M2 — 배경 블러
  const remoteTracksRef = useRef<{ cam: RemoteTrack | null; share: RemoteTrack | null }>({ cam: null, share: null });
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
    remoteTracksRef.current = { cam: null, share: null };
    setStatus('idle'); setRemoteCamOn(false); setCamOn(false); setMicOn(true);
    setShareOn(false); setRemoteShareOn(false); setBlurOn(false);
  }

  /** 원격 표시 우선순위: 화면공유 > 카메라 (1:1 수업 — 공유 화면이 주 콘텐츠). */
  function attachBestRemote() {
    const { cam, share } = remoteTracksRef.current;
    const best = share ?? cam;
    if (best && remoteVideoRef.current) best.attach(remoteVideoRef.current);
    else if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setRemoteShareOn(!!share);
    setRemoteCamOn(!!(share ?? cam));
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
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: TrackPublication) => {
          if (track.kind === Track.Kind.Video) {
            if (pub.source === Track.Source.ScreenShare) remoteTracksRef.current.share = track;
            else remoteTracksRef.current.cam = track;
            attachBestRemote();
          } else {
            const el = track.attach();
            el.style.display = 'none';
            document.body.appendChild(el);
            audioElsRef.current.push(el);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: TrackPublication) => {
          track.detach().forEach((el) => { if (el !== remoteVideoRef.current) el.remove(); });
          if (track.kind === Track.Kind.Video) {
            if (pub.source === Track.Source.ScreenShare) remoteTracksRef.current.share = null;
            else remoteTracksRef.current.cam = null;
            attachBestRemote();
          }
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

  /** M2 — 화면공유 토글. 브라우저 공유 선택창에서 취소하면 상태 유지. */
  async function toggleShare() {
    const room = roomRef.current; if (!room) return;
    const next = !shareOn;
    try {
      await room.localParticipant.setScreenShareEnabled(next);
      setShareOn(next);
      onEventRef.current?.(next ? 'share_started' : 'share_stopped');
    } catch { /* 사용자가 공유 선택을 취소함 — 상태 유지 */ }
  }

  /** M2 — 배경 블러 토글(카메라 트랙 프로세서 — 지연 로드, 미지원 브라우저는 무시). */
  async function toggleBlur() {
    const room = roomRef.current; if (!room) return;
    const pub = [...room.localParticipant.videoTrackPublications.values()].find((p) => p.source === Track.Source.Camera);
    const t = pub?.track as { setProcessor?: (p: unknown) => Promise<void>; stopProcessor?: () => Promise<void> } | undefined;
    if (!t?.setProcessor) return;
    try {
      if (blurOn) { await t.stopProcessor?.(); setBlurOn(false); return; }
      const { BackgroundBlur, supportsBackgroundProcessors } = await import('@livekit/track-processors');
      if (!supportsBackgroundProcessors()) return;
      await t.setProcessor(BackgroundBlur(10));
      setBlurOn(true);
      onEventRef.current?.('blur_on');
    } catch { /* 프로세서 미지원 — 무시 */ }
  }

  useEffect(() => () => { void roomRef.current?.disconnect(); }, []); // 언마운트 정리

  return { status, micOn, camOn, remoteCamOn, shareOn, remoteShareOn, blurOn, join, leave, toggleMic, toggleCam, toggleShare, toggleBlur, localVideoRef, remoteVideoRef };
}
