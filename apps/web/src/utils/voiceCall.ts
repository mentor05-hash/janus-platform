import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { iceServers } from './iceServers';
import { track } from './track';

/**
 * 예약 room 기반 1:1 WebRTC 음성통화. 시그널링(offer/answer/ICE)은 socket.io 게이트웨이(call:signal)로 중계.
 * 자체 구현(외부 서비스 없음) — ICE 는 iceServers()(ENV 로 TURN 후결합, 기본 구글 STUN — O78).
 * 필기·채팅과 같은 소켓을 쓰므로 "필기하며 음성 설명"이 동시 동작.
 * 계측(M3 선행): page 'consult_media' + meta.ev(join_attempt|connected|failed|ice_restart).
 *
 * 연결 규약(O78): 한쪽이 통화를 시작하면 상대는 offer 수신 시 **자동 응답**(버튼 불요·마이크 허용만).
 *  - 리스너는 소켓 생성을 기다려 부착 · peer-join 시 offer 재전송 · glare 는 대기+rollback
 *  - 연결 유실 시 **자동 ICE 재시작**(3초 유예, 최대 2회) + 수동 reconnect()
 *  - status: idle → connecting → connected → reconnecting
 */
export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export function useVoiceCall(getSocket: () => Socket | null, bookingId: string) {
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const [net, setNet] = useState<Exclude<VoiceStatus, 'idle'>>('connecting');
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const connectedOnce = useRef(false); // 이번 통화에서 connected 도달 여부(성공률 계측)
  const offerSeenRef = useRef(false); // 상대 offer 수신 여부 — 동시 발신 방지
  const restartsRef = useRef(0);
  const restartTimerRef = useRef<number | null>(null);

  function clearRestartTimer() {
    if (restartTimerRef.current != null) { window.clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
  }
  async function iceRestart() {
    const pc = pcRef.current; const sock = getSocket();
    if (!pc || !sock || pc.signalingState === 'closed') return;
    try {
      track('consult_media', 'view', undefined, { ev: 'ice_restart', bookingId });
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      sock.emit('call:signal', { bookingId, kind: 'offer', data: offer });
    } catch { /* 재시작 실패 — 수동 재연결로 */ }
  }
  function scheduleRestart(delayMs: number) {
    clearRestartTimer();
    restartTimerRef.current = window.setTimeout(() => {
      const pc = pcRef.current;
      if (!pc || !['disconnected', 'failed'].includes(pc.connectionState)) return; // 자가 복구됨
      if (restartsRef.current >= 2) return; // 자동은 2회까지 — 이후 수동 재연결 버튼
      restartsRef.current += 1;
      void iceRestart();
    }, delayMs);
  }
  async function reconnect() {
    restartsRef.current = 0;
    setNet('reconnecting');
    const pc = pcRef.current;
    if (pc && pc.signalingState !== 'closed') await iceRestart();
    else { pcRef.current = null; offerSeenRef.current = false; await start(); }
  }

  function makePc() {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    connectedOnce.current = false;
    pc.onicecandidate = (e) => { if (e.candidate) getSocket()?.emit('call:signal', { bookingId, kind: 'ice', data: e.candidate }); };
    pc.ontrack = (e) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]; };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        setPeerPresent(true); setNet('connected'); restartsRef.current = 0; clearRestartTimer();
        if (!connectedOnce.current) { connectedOnce.current = true; track('consult_media', 'view', undefined, { ev: 'connected', bookingId }); }
      } else if (st === 'disconnected') { setNet('reconnecting'); scheduleRestart(3000); }
      else if (st === 'failed') {
        setPeerPresent(false); setNet('reconnecting'); scheduleRestart(0);
        // failed = ICE 협상/경로 실패 — 성공률 실측(P2P→LiveKit 이관 판단 근거, O78)
        track('consult_media', 'view', undefined, { ev: 'failed', afterConnect: connectedOnce.current, bookingId });
      } else if (st === 'closed') setPeerPresent(false);
    };
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
      track('consult_media', 'view', undefined, { ev: 'join_attempt', bookingId }); // 입장 시도(성공률 분모)
      const local = await ensureLocal();
      local.getTracks().forEach((t) => { if (!pc.getSenders().find((s) => s.track === t)) pc.addTrack(t, local); });
      setInCall(true); setNet('connecting');
      sock.emit('call:join', { bookingId });
      // 동시 발신 방지 — 잠깐 대기하는 사이 상대 offer 가 오면 자동 응답 경로가 처리(내 offer 생략)
      await new Promise((r) => setTimeout(r, 600));
      if (offerSeenRef.current || pc.remoteDescription) return;
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
    clearRestartTimer(); restartsRef.current = 0;
    pcRef.current?.close(); pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop()); localRef.current = null;
    offerSeenRef.current = false;
    setInCall(false); setMuted(false); setPeerPresent(false); setNet('connecting');
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
        if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
        await pc.setRemoteDescription(data as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        getSocket()?.emit('call:signal', { bookingId, kind: 'answer', data: answer });
      } else if (kind === 'answer' && pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(data as RTCSessionDescriptionInit); setPeerPresent(true);
      } else if (kind === 'ice' && pc) {
        try { await pc.addIceCandidate(data as RTCIceCandidateInit); } catch { /* noop */ }
      }
    };
    const onLeave = () => setPeerPresent(false);
    const onPeerJoin = () => {
      const pc = pcRef.current;
      if (pc && pc.localDescription?.type === 'offer' && !pc.remoteDescription) {
        getSocket()?.emit('call:signal', { bookingId, kind: 'offer', data: pc.localDescription });
      }
    };
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
  }, [bookingId]);

  useEffect(() => () => hangup(), []); // 언마운트 시 정리

  const status: VoiceStatus = inCall ? net : 'idle';
  return { inCall, muted, peerPresent, status, start, hangup, toggleMute, reconnect, remoteAudioRef };
}
