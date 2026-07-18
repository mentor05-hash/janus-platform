import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { iceServers } from './iceServers';

/**
 * 1:1 WebRTC 음성통화(모바일/expo-web) — 시그널링은 게이트웨이 call:signal 중계.
 * 웹(expo-web)에서 동작(브라우저 WebRTC). 네이티브는 react-native-webrtc 후결합(데모 범위 밖).
 * 원격 오디오는 DOM audio 엘리먼트로 재생(RN <audio> 부재 대응).
 * 연결 규약(O78 수정): 한쪽 시작 → 상대는 offer 수신 시 자동 응답. 리스너는 소켓 생성을 기다려
 * 부착(마운트 시 null 이면 영영 미등록되던 버그 수정) + peer-join 시 offer 재전송 + glare 방지.
 */
const hasWebRTC = typeof window !== 'undefined' && typeof (window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection !== 'undefined';

export function useVoiceCall(getSocket: () => Socket | null, bookingId: string) {
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const offerSeenRef = useRef(false);
  const [net, setNet] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const restartsRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearRestartTimer() { if (restartTimerRef.current != null) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; } }
  async function iceRestart() {
    const pc = pcRef.current; const sock = getSocket();
    if (!pc || !sock || pc.signalingState === 'closed') return;
    try { const offer = await pc.createOffer({ iceRestart: true }); await pc.setLocalDescription(offer); sock.emit('call:signal', { bookingId, kind: 'offer', data: offer }); } catch { /* 수동 재연결로 */ }
  }
  function scheduleRestart(delayMs: number) {
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      const pc = pcRef.current;
      if (!pc || !['disconnected', 'failed'].includes(pc.connectionState)) return;
      if (restartsRef.current >= 2) return;
      restartsRef.current += 1; void iceRestart();
    }, delayMs);
  }
  async function reconnect() {
    restartsRef.current = 0; setNet('reconnecting');
    const pc = pcRef.current;
    if (pc && pc.signalingState !== 'closed') await iceRestart();
    else { pcRef.current = null; offerSeenRef.current = false; await start(); }
  }

  function remoteAudio(): HTMLAudioElement | null {
    if (!hasWebRTC || typeof document === 'undefined') return null;
    if (!audioElRef.current) { const a = document.createElement('audio'); a.autoplay = true; document.body.appendChild(a); audioElRef.current = a; }
    return audioElRef.current;
  }
  function makePc() {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.onicecandidate = (e) => { if (e.candidate) getSocket()?.emit('call:signal', { bookingId, kind: 'ice', data: e.candidate }); };
    pc.ontrack = (e) => { const a = remoteAudio(); if (a) a.srcObject = e.streams[0]; };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') { setPeerPresent(true); setNet('connected'); restartsRef.current = 0; clearRestartTimer(); }
      else if (st === 'disconnected') { setNet('reconnecting'); scheduleRestart(3000); }
      else if (st === 'failed') { setPeerPresent(false); setNet('reconnecting'); scheduleRestart(0); }
      else if (st === 'closed') setPeerPresent(false);
    };
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
      local.getTracks().forEach((t) => { if (!pc.getSenders().find((x) => x.track === t)) pc.addTrack(t, local); });
      setInCall(true); setNet('connecting'); sock.emit('call:join', { bookingId });
      await new Promise((r) => setTimeout(r, 600)); // 동시 발신 방지 — 상대 offer 가 오면 자동 응답이 처리
      if (offerSeenRef.current || pc.remoteDescription) return;
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
    clearRestartTimer(); restartsRef.current = 0; setNet('connecting');
    pcRef.current?.close(); pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop()); localRef.current = null;
    offerSeenRef.current = false;
    setInCall(false); setMuted(false); setPeerPresent(false);
  }
  useEffect(() => {
    if (!hasWebRTC) return;
    let sock: Socket | null = null;
    const onSignal = async ({ kind, data }: { kind: string; data: unknown }) => {
      let pc = pcRef.current;
      if (kind === 'offer') {
        offerSeenRef.current = true;
        if (!pc) pc = makePc();
        const local = await ensureLocal();
        local.getTracks().forEach((t) => { if (!pc!.getSenders().find((x) => x.track === t)) pc!.addTrack(t, local); });
        setInCall(true); setPeerPresent(true);
        if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
        await pc.setRemoteDescription(data as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        getSocket()?.emit('call:signal', { bookingId, kind: 'answer', data: answer });
      } else if (kind === 'answer' && pc && pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription(data as RTCSessionDescriptionInit); setPeerPresent(true); }
      else if (kind === 'ice' && pc) { try { await pc.addIceCandidate(data as RTCIceCandidateInit); } catch { /* noop */ } }
    };
    const onLeave = () => setPeerPresent(false);
    const onPeerJoin = () => {
      const pc = pcRef.current;
      if (pc && pc.localDescription?.type === 'offer' && !pc.remoteDescription) getSocket()?.emit('call:signal', { bookingId, kind: 'offer', data: pc.localDescription });
    };
    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      const s = getSocket(); if (!s) return;
      clearInterval(timer);
      sock = s;
      s.on('call:signal', onSignal); s.on('call:peer-leave', onLeave); s.on('call:peer-join', onPeerJoin);
    }, 300);
    return () => { clearInterval(timer); if (sock) { sock.off('call:signal', onSignal); sock.off('call:peer-leave', onLeave); sock.off('call:peer-join', onPeerJoin); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);
  useEffect(() => () => { hangup(); if (audioElRef.current) { audioElRef.current.remove(); audioElRef.current = null; } }, []);

  return { inCall, muted, peerPresent, status: inCall ? net : 'idle' as const, start, hangup, toggleMute, reconnect, supported: hasWebRTC };
}
