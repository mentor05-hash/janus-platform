import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { iceServers } from './iceServers';

/**
 * 룸 서비스(apps/realtime-rooms) 프로토콜용 1:1 WebRTC 음성통화 훅.
 * 예약(useVoiceCall)과 동일하나 payload 에 bookingId 가 없다(룸은 토큰으로 고정).
 * 시그널: call:join / call:signal {kind,data} / call:leave, 수신 call:signal {from,kind,data}.
 *
 * 연결 규약(O78): 한쪽이 통화를 시작하면 상대는 offer 수신 시 **자동 응답**(버튼 불요·마이크 허용만).
 *  - 리스너는 소켓 생성을 기다려 부착(마운트 시 소켓 null 이면 영영 미등록되던 버그 수정)
 *  - call:peer-join 수신 시 보유 offer 재전송 · 동시 발신(glare)은 대기+rollback 으로 해소
 *  - 연결 유실(NAT 바인딩 만료 등) 시 **자동 ICE 재시작**(3초 유예, 최대 2회) + 수동 reconnect()
 *  - status: idle(통화 전) → connecting(협상 중) → connected(통화 중) → reconnecting(재연결 중)
 */
export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export function useRoomVoiceCall(getSocket: () => Socket | null) {
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const [net, setNet] = useState<Exclude<VoiceStatus, 'idle'>>('connecting');
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const offerSeenRef = useRef(false); // 상대 offer 수신 여부 — 동시 발신 방지
  const restartsRef = useRef(0); // 자동 ICE 재시작 횟수(연결 성공 시 리셋)
  const restartTimerRef = useRef<number | null>(null);

  function clearRestartTimer() {
    if (restartTimerRef.current != null) { window.clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
  }
  /** ICE 재시작 협상 — 미디어 유지한 채 경로만 재수립. 양측 동시 시도는 glare rollback 이 정리. */
  async function iceRestart() {
    const pc = pcRef.current; const sock = getSocket();
    if (!pc || !sock || pc.signalingState === 'closed') return;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      sock.emit('call:signal', { kind: 'offer', data: offer });
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
  /** 수동 재연결 — 자동 한도 리셋 후 즉시 재시작(연결이 닫혔으면 새로 시작). */
  async function reconnect() {
    restartsRef.current = 0;
    setNet('reconnecting');
    const pc = pcRef.current;
    if (pc && pc.signalingState !== 'closed') await iceRestart();
    else { pcRef.current = null; offerSeenRef.current = false; await start(); }
  }

  function makePc() {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.onicecandidate = (e) => { if (e.candidate) getSocket()?.emit('call:signal', { kind: 'ice', data: e.candidate }); };
    pc.ontrack = (e) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]; };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') { setPeerPresent(true); setNet('connected'); restartsRef.current = 0; clearRestartTimer(); }
      else if (st === 'disconnected') { setNet('reconnecting'); scheduleRestart(3000); } // 일시 유실 — 자가 복구 3초 대기
      else if (st === 'failed') { setPeerPresent(false); setNet('reconnecting'); scheduleRestart(0); }
      else if (st === 'closed') setPeerPresent(false);
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
      const local = await ensureLocal();
      local.getTracks().forEach((t) => { if (!pc.getSenders().find((s) => s.track === t)) pc.addTrack(t, local); });
      setInCall(true); setNet('connecting');
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
  const status: VoiceStatus = inCall ? net : 'idle';
  return { inCall, muted, peerPresent, status, start, hangup, toggleMute, reconnect, remoteAudioRef };
}
