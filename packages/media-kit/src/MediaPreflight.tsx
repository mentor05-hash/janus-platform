import React, { useEffect, useRef, useState } from 'react';
import type { PreflightSelection } from './types';

/**
 * MediaPreflight — 입장 전 장치 점검(기획서 §3.5, O79 M1).
 * 앱 무의존: 네트워크 점검은 probe 콜백(왕복 ms 반환)으로 소비자가 주입한다.
 * 카메라 미리보기·마이크 레벨은 전부 로컬(getUserMedia) — 서버 전송 없음.
 */
export interface MediaPreflightProps {
  /** 간이 네트워크 점검(왕복 ms, 실패 시 null). 미제공 시 네트워크 항목 생략. */
  probe?: () => Promise<number | null>;
  /** "시작" — 선택 결과를 그대로 useMediaSession.join(sel) 에 넘기면 된다. */
  onStart: (sel: PreflightSelection) => void;
  onCancel: () => void;
}

type Dev = { deviceId: string; label: string };

export function MediaPreflight({ probe, onStart, onCancel }: MediaPreflightProps) {
  const [mics, setMics] = useState<Dev[]>([]);
  const [cams, setCams] = useState<Dev[]>([]);
  const [micId, setMicId] = useState('');
  const [camId, setCamId] = useState('');
  const [camReady, setCamReady] = useState(false);
  const [permError, setPermError] = useState('');
  const [level, setLevel] = useState(0); // 마이크 입력 레벨 0~1
  const [rtt, setRtt] = useState<number | null | 'testing'>(probe ? 'testing' : null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cancelAnimationFrame(rafRef.current);
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }

  // 선택된 장치로 미리보기 스트림 재구성(마이크 레벨 미터 포함)
  useEffect(() => {
    let alive = true;
    (async () => {
      stopStream();
      setCamReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: micId ? { deviceId: { exact: micId } } : true,
          video: camId ? { deviceId: { exact: camId } } : true,
        });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setPermError('');
        if (videoRef.current) { videoRef.current.srcObject = stream; setCamReady(true); }
        // 장치 목록은 권한 허용 후에야 label 이 채워진다.
        const devs = await navigator.mediaDevices.enumerateDevices();
        if (!alive) return;
        setMics(devs.filter((d) => d.kind === 'audioinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `마이크 ${i + 1}` })));
        setCams(devs.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `카메라 ${i + 1}` })));
        // 마이크 레벨 미터
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
          setLevel(peak);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        if (alive) setPermError(e instanceof Error && e.name === 'NotAllowedError'
          ? '카메라·마이크 권한이 거부되었습니다. 브라우저 주소창의 권한 설정에서 허용해 주세요.'
          : `장치를 열 수 없습니다: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => { alive = false; };
  }, [micId, camId]);

  useEffect(() => () => stopStream(), []); // 언마운트 정리

  // 간이 네트워크 점검(3회 평균)
  useEffect(() => {
    if (!probe) return;
    let alive = true;
    (async () => {
      const ms: number[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await probe().catch(() => null);
        if (r != null) ms.push(r);
      }
      if (alive) setRtt(ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null);
    })();
    return () => { alive = false; };
  }, [probe]);

  const start = (withVideo: boolean) => {
    stopStream(); // 미리보기 장치를 놓아야 LiveKit 이 같은 장치를 잡는다
    onStart({ video: withVideo, audioDeviceId: micId || undefined, videoDeviceId: camId || undefined });
  };

  const sel: React.CSSProperties = { width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 };
  const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, width: 360, maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>입장 전 점검</div>
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#111827', aspectRatio: '4 / 3', marginBottom: 10 }}>
          <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          {!camReady && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
              {permError || '카메라 준비 중…'}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>🎙 마이크</label>
          <select style={sel} value={micId} onChange={(e) => setMicId(e.target.value)}>
            {mics.length === 0 && <option value="">기본 마이크</option>}
            {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
          </select>
          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, Math.round(level * 140))}%`, background: level > 0.02 ? '#10b981' : '#9ca3af', borderRadius: 3, transition: 'width 80ms linear' }} />
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>소리를 내면 초록 막대가 움직여야 합니다.</div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>📷 카메라</label>
          <select style={sel} value={camId} onChange={(e) => setCamId(e.target.value)}>
            {cams.length === 0 && <option value="">기본 카메라</option>}
            {cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
          </select>
        </div>
        {probe && (
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
            네트워크: {rtt === 'testing' ? '측정 중…' : rtt == null ? '측정 실패(연결 상태를 확인하세요)' : `왕복 ${rtt}ms ${rtt < 150 ? '· 원활' : rtt < 400 ? '· 보통' : '· 불안정(음성만 권장)'}`}
          </div>
        )}
        <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.5, marginBottom: 14 }}>
          미리보기는 내 기기에서만 재생되며 서버로 전송·저장되지 않습니다. 화면에 생기부 등 개인정보가 비치지 않도록 주의해 주세요.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => start(true)} disabled={!!permError}
            style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: permError ? '#9ca3af' : '#4f46e5', color: '#fff', fontWeight: 700, fontSize: 13, cursor: permError ? 'default' : 'pointer' }}>
            📹 화상으로 시작
          </button>
          <button onClick={() => start(false)}
            style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            🎙 음성만 시작
          </button>
          <button onClick={onCancel}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
