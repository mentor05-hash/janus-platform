import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

/**
 * 예약 room 기반 1:1 WebRTC 음성통화. 시그널링(offer/answer/ICE)은 socket.io 게이트웨이(call:signal)로 중계.
 * 자체 구현(외부 서비스 없음) — STUN 은 구글 공개 서버, 대칭 NAT 대비 TURN 은 ENV 로 후결합 가능.
 * 필기·채팅과 같은 소켓을 쓰므로 "필기하며 음성 설명"이 동시 동작.
 */
const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export function useVoiceCall(getSocket: () => Socket | null, bookingId: string) {
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  function makePc() {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onicecandidate = (e) => { if (e.candidate) getSocket()?.emit('call:signal', { bookingId, kind: 'ice', data: e.candidate }); };
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
      local.getTracks().forEach((t) => pc.addTrack(t, local));
      setInCall(true);
      sock.emit('call:join', { bookingId });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sock.emit('call:signal', { bookingId, kind: 'offer', data: offer });
    } catch { hangup(); }
  }

  function toggleMute() {
    const s = localRef.current; if (!s) return;
    const next = !muted; setMuted(next);
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
  }

  function hangup() {
    const sock = getSocket();
    sock?.emit('call:leave', { bookingId });
    pcRef.current?.close(); pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop()); localRef.current = null;
    setInCall(false); setMuted(false); setPeerPresent(false);
  }

  useEffect(() => {
    const sock = getSocket(); if (!sock) return;
    const onSignal = async ({ kind, data }: { from: string; kind: string; data: unknown }) => {
      let pc = pcRef.current;
      if (kind === 'offer') {
        if (!pc) pc = makePc();
        const local = await ensureLocal();
        local.getTracks().forEach((t) => { if (!pc!.getSenders().find((s) => s.track === t)) pc!.addTrack(t, local); });
        setInCall(true); setPeerPresent(true);
        await pc.setRemoteDescription(data as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sock.emit('call:signal', { bookingId, kind: 'answer', data: answer });
      } else if (kind === 'answer' && pc) {
        await pc.setRemoteDescription(data as RTCSessionDescriptionInit); setPeerPresent(true);
      } else if (kind === 'ice' && pc) {
        try { await pc.addIceCandidate(data as RTCIceCandidateInit); } catch { /* noop */ }
      }
    };
    const onLeave = () => setPeerPresent(false);
    sock.on('call:signal', onSignal);
    sock.on('call:peer-leave', onLeave);
    return () => { sock.off('call:signal', onSignal); sock.off('call:peer-leave', onLeave); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => () => hangup(), []); // 언마운트 시 정리

  return { inCall, muted, peerPresent, start, hangup, toggleMute, remoteAudioRef };
}
