import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { iceServers } from './iceServers';

/**
 * 룸 서비스(apps/realtime-rooms) 프로토콜용 1:1 WebRTC 음성통화 훅.
 * 예약(useVoiceCall)과 동일하나 payload 에 bookingId 가 없다(룸은 토큰으로 고정).
 * 시그널: call:join / call:signal {kind,data} / call:leave, 수신 call:signal {from,kind,data}.
 *
 * 연결 규약(O78 수정): 한쪽이 통화를 시작하면 상대는 offer 수신 시 **자동 응답**(버튼 불요·마이크 허용만).
 *  - 리스너는 소켓 생성을 기다려 부착 — 마운트 시점에 소켓이 null 이면 영영 미등록되던 버그 수정
 *  - call:peer-join 수신 시 보유 offer 재전송 — 상대가 늦게 입장한 경우의 offer 유실 복구
 *  - 동시 발신(glare) 방지: join 후 짧은 대기 + have-local-offer 중 offer 수신 시 rollback
 */
export function useRoomVoiceCall(getSocket: () => Socket | null) {
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const offerSeenRef = useRef(false); // 상대 offer 수신 여부 — 동시 발신 방지

  function makePc() {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.onicecandidate = (e) => { if (e.candidate) getSocket()?.emit('call:signal', { kind: 'ice', data: e.candidate }); };
    pc.ontrack = (e) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]; };
    pc.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) setPeerPresent(false); };
    pcRef.current = pc;
    return pc;
  }
  async function ensureLocal() {
    if (localRef.current) return localRef.current;
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localRef.current = s;
    return s;
  }
  async function start() {
    const sock = getSocket(); if (!sock) return;
    try {
      const pc = pcRef.current ?? makePc();
      const local = await ensureLocal();
      local.getTracks().forEach((t) => { if (!pc.getSenders().find((s) => s.track === t)) pc.addTrack(t, local); });
      setInCall(true);
      sock.emit('call:join');
      // 동시 발신 방지 — 잠깐 대기하는 사이 상대 offer 가 오면 자동 응답 경로가 처리(내 offer 생략)
      await new Promise((r) => setTimeout(r, 600));
      if (offerSeenRef.current || pc.remoteDescription) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sock.emit('call:signal', { kind: 'offer', data: offer });
    } catch { hangup(); }
  }
  function toggleMute() {
    const s = localRef.current; if (!s) return;
    const next = !muted; setMuted(next);
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
  }
  function hangup() {
    getSocket()?.emit('call:leave');
    pcRef.current?.close(); pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop()); localRef.current = null;
    offerSeenRef.current = false;
    setInCall(false); setMuted(false); setPeerPresent(false);
  }

  useEffect(() => {
    let sock: Socket | null = null;
    const onSignal = async ({ kind, data }: { from: string; kind: string; data: unknown }) => {
      let pc = pcRef.current;
      if (kind === 'offer') {
        offerSeenRef.current = true;
        if (!pc) pc = makePc();
        const local = await ensureLocal();
        local.getTracks().forEach((t) => { if (!pc!.getSenders().find((s) => s.track === t)) pc!.addTrack(t, local); });
        setInCall(true); setPeerPresent(true);
        // 동시 발신 충돌: 내 offer 가 걸려 있으면 롤백 후 상대 offer 를 받는다
        if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
        await pc.setRemoteDescription(data as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        getSocket()?.emit('call:signal', { kind: 'answer', data: answer });
      } else if (kind === 'answer' && pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(data as RTCSessionDescriptionInit); setPeerPresent(true);
      } else if (kind === 'ice' && pc) {
        try { await pc.addIceCandidate(data as RTCIceCandidateInit); } catch { /* noop */ }
      }
    };
    const onLeave = () => setPeerPresent(false);
    // 상대가 늦게 입장(call:join) — 내가 보낸 offer 를 못 받았을 수 있으니 재전송
    const onPeerJoin = () => {
      const pc = pcRef.current;
      if (pc && pc.localDescription?.type === 'offer' && !pc.remoteDescription) {
        getSocket()?.emit('call:signal', { kind: 'offer', data: pc.localDescription });
      }
    };
    // 소켓이 생길 때까지 재시도 부착(마운트 시점 소켓 null 대응 — 핵심 수정)
    const timer = window.setInterval(() => {
      const s = getSocket(); if (!s) return;
      window.clearInterval(timer);
      sock = s;
      s.on('call:signal', onSignal);
      s.on('call:peer-leave', onLeave);
      s.on('call:peer-join', onPeerJoin);
    }, 300);
    return () => {
      window.clearInterval(timer);
      if (sock) { sock.off('call:signal', onSignal); sock.off('call:peer-leave', onLeave); sock.off('call:peer-join', onPeerJoin); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => hangup(), []);
  return { inCall, muted, peerPresent, start, hangup, toggleMute, remoteAudioRef };
}
