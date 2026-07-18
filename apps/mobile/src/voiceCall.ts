import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { iceServers } from './iceServers';

/**
 * 1:1 WebRTC 음성통화(모바일/expo-web) — 시그널링은 게이트웨이 call:signal 중계.
 * 웹(expo-web)에서 동작(브라우저 WebRTC). 네이티브는 react-native-webrtc 후결합(데모 범위 밖).
 * 원격 오디오는 DOM audio 엘리먼트로 재생(RN <audio> 부재 대응).
 */
const hasWebRTC = typeof window !== 'undefined' && typeof (window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection !== 'undefined';

export function useVoiceCall(getSocket: () => Socket | null, bookingId: string) {
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  function remoteAudio(): HTMLAudioElement | null {
    if (!hasWebRTC || typeof document === 'undefined') return null;
    if (!audioElRef.current) { const a = document.createElement('audio'); a.autoplay = true; document.body.appendChild(a); audioElRef.current = a; }
    return audioElRef.current;
  }
  function makePc() {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.onicecandidate = (e) => { if (e.candidate) getSocket()?.emit('call:signal', { bookingId, kind: 'ice', data: e.candidate }); };
    pc.ontrack = (e) => { const a = remoteAudio(); if (a) a.srcObject = e.streams[0]; };
    pcRef.current = pc; return pc;
  }
  async function ensureLocal() {
    if (localRef.current) return localRef.current;
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localRef.current = s; return s;
  }
  async function start() {
    const sock = getSocket(); if (!sock || !hasWebRTC) return;
    try {
      const pc = pcRef.current ?? makePc();
      const local = await ensureLocal();
      local.getTracks().forEach((t) => pc.addTrack(t, local));
      setInCall(true); sock.emit('call:join', { bookingId });
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      sock.emit('call:signal', { bookingId, kind: 'offer', data: offer });
    } catch { hangup(); }
  }
  function toggleMute() {
    const s = localRef.current; if (!s) return;
    const next = !muted; setMuted(next); s.getAudioTracks().forEach((t) => (t.enabled = !next));
  }
  function hangup() {
    getSocket()?.emit('call:leave', { bookingId });
    pcRef.current?.close(); pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop()); localRef.current = null;
    setInCall(false); setMuted(false); setPeerPresent(false);
  }
  useEffect(() => {
    const sock = getSocket(); if (!sock || !hasWebRTC) return;
    const onSignal = async ({ kind, data }: { kind: string; data: unknown }) => {
      let pc = pcRef.current;
      if (kind === 'offer') {
        if (!pc) pc = makePc();
        const local = await ensureLocal();
        local.getTracks().forEach((t) => { if (!pc!.getSenders().find((x) => x.track === t)) pc!.addTrack(t, local); });
        setInCall(true); setPeerPresent(true);
        await pc.setRemoteDescription(data as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        sock.emit('call:signal', { bookingId, kind: 'answer', data: answer });
      } else if (kind === 'answer' && pc) { await pc.setRemoteDescription(data as RTCSessionDescriptionInit); setPeerPresent(true); }
      else if (kind === 'ice' && pc) { try { await pc.addIceCandidate(data as RTCIceCandidateInit); } catch { /* noop */ } }
    };
    const onLeave = () => setPeerPresent(false);
    sock.on('call:signal', onSignal); sock.on('call:peer-leave', onLeave);
    return () => { sock.off('call:signal', onSignal); sock.off('call:peer-leave', onLeave); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);
  useEffect(() => () => { hangup(); if (audioElRef.current) { audioElRef.current.remove(); audioElRef.current = null; } }, []);

  return { inCall, muted, peerPresent, start, hangup, toggleMute, supported: hasWebRTC };
}
