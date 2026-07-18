import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { iceServers } from './iceServers';

/**
 * 룸 서비스(apps/realtime-rooms) 프로토콜용 1:1 WebRTC 음성통화 훅.
 * 예약(useVoiceCall)과 동일하나 payload 에 bookingId 가 없다(룸은 토큰으로 고정).
 * 시그널: call:join / call:signal {kind,data} / call:leave, 수신 call:signal {from,kind,data}.
 */

export function useRoomVoiceCall(getSocket: () => Socket | null) {
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

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
      local.getTracks().forEach((t) => pc.addTrack(t, local));
      setInCall(true);
      sock.emit('call:join');
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
        sock.emit('call:signal', { kind: 'answer', data: answer });
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
  }, []);

  useEffect(() => () => hangup(), []);
  return { inCall, muted, peerPresent, start, hangup, toggleMute, remoteAudioRef };
}
