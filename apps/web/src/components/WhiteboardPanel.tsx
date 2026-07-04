import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api/client';
import { useVoiceCall } from '../utils/voiceCall';

type Pt = { x: number; y: number; p?: number }; // p=필압(0~1)
type Stroke = { points: Pt[]; color: string; width: number; erase?: boolean; highlight?: boolean };
const COLORS = ['#16242B', '#0E5C7C', '#E5484D', '#2F9E44', '#F08C00'];
const W = 900, H = 620; // 논리 좌표(비율 유지 스케일링)

/** 예약 기반 공유 화이트보드(웹). 배경 이미지(첨부/촬영) 위에 필기 + 음성통화 동시. */
export function WhiteboardPanel({ bookingId, title, onClose }: { bookingId: string; title?: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sockRef = useRef<Socket | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  // 라이브 잉크: 상대가 그리는 중인 획(sid별) + 내 획 스트리밍 상태
  const liveRef = useRef<Map<string, Stroke>>(new Map());
  const sidRef = useRef('');
  const pendingRef = useRef<Pt[]>([]); // 아직 전송 안 한 포인트
  const lastFlushRef = useRef(0);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgFileIdRef = useRef<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'highlighter'>('pen');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [camOn, setCamOn] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penSeenRef = useRef(false); // 펜(스타일러스) 입력을 본 적 있으면 손가락(터치)은 무시(팜리젝션)
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const call = useVoiceCall(() => sockRef.current, bookingId);

  function redraw() {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (bgImgRef.current) { // 배경(첨부/촬영 이미지) — 비율 유지 contain
      const img = bgImgRef.current; const ir = img.width / img.height, cr = W / H;
      let dw = W, dh = H, dx = 0, dy = 0;
      if (ir > cr) { dh = W / ir; dy = (H - dh) / 2; } else { dw = H * ir; dx = (W - dw) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of [...strokesRef.current, ...liveRef.current.values(), ...(drawingRef.current ? [drawingRef.current] : [])]) {
      if (s.points.length < 1) continue;
      ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      // 형광펜: 반투명(겹치면 진해짐). 단일 패스로 그려 접합부 얼룩 방지.
      ctx.globalAlpha = s.highlight ? 0.32 : 1;
      ctx.strokeStyle = s.color;
      if (s.erase || s.highlight || s.points.length === 1 || s.points.every((q) => q.p == null)) {
        // 지우개·형광펜·단일점·필압 없는 스트로크: 고정 굵기(단일 패스)
        ctx.lineWidth = s.width;
        ctx.beginPath(); ctx.moveTo(s.points[0].x, s.points[0].y);
        for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
        if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1);
        ctx.stroke();
      } else {
        // 펜 필압: 구간별 굵기 = base × (0.35 + p×1.3)
        for (let i = 1; i < s.points.length; i++) {
          const a = s.points[i - 1], b = s.points[i];
          ctx.lineWidth = s.width * (0.35 + ((b.p ?? 0.5)) * 1.3);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function loadBg(fileId: string | null) {
    bgFileIdRef.current = fileId;
    if (!fileId) { bgImgRef.current = null; redraw(); return; }
    api.fileBlobUrl(fileId).then((url) => {
      const img = new Image();
      img.onload = () => { bgImgRef.current = img; redraw(); };
      img.src = url;
    }).catch(() => {});
  }

  function scheduleAutosave() {
    setSaveState('dirty');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(), 1500);
  }

  useEffect(() => {
    const token = localStorage.getItem('mp_access') ?? '';
    const s = io(window.location.origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
    sockRef.current = s;
    s.on('connect', () => {
      s.emit('wb:join', { bookingId }, (r: { ok: boolean; strokes?: Stroke[]; backgroundFileId?: string | null }) => {
        if (!r?.ok) { setStatus('off'); return; }
        strokesRef.current = Array.isArray(r.strokes) ? r.strokes : [];
        setStatus('ready'); redraw();
        if (r.backgroundFileId) loadBg(r.backgroundFileId);
      });
    });
    // 라이브 잉크: 상대가 그리는 중인 부분 획을 실시간 반영
    s.on('wb:stroke:partial', ({ sid, meta, points }: { sid: string; meta: Partial<Stroke>; points: Pt[] }) => {
      let st = liveRef.current.get(sid);
      if (!st) { st = { color: meta.color ?? '#16242B', width: meta.width ?? 3, erase: meta.erase, highlight: meta.highlight, points: [] }; liveRef.current.set(sid, st); }
      st.points.push(...points); redraw();
    });
    s.on('wb:stroke', ({ stroke, sid }: { stroke: Stroke; sid?: string }) => { if (sid) liveRef.current.delete(sid); strokesRef.current.push(stroke); redraw(); });
    s.on('wb:clear', () => { strokesRef.current = []; liveRef.current.clear(); redraw(); });
    s.on('wb:image', ({ fileId }: { fileId: string | null }) => loadBg(fileId));
    return () => { s.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  function pt(e: React.PointerEvent): Pt {
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect();
    const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : e.pressure > 0 ? e.pressure : 0.5;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, p };
  }
  /** 팜리젝션: 펜 입력을 한 번이라도 봤으면 손가락(터치)은 그리기에서 무시. */
  function rejected(e: React.PointerEvent) {
    if (e.pointerType === 'pen') penSeenRef.current = true;
    return penSeenRef.current && e.pointerType === 'touch';
  }
  /** 아직 전송 안 한 포인트를 부분 획으로 전송(라이브 잉크). */
  function flushPartial() {
    const st = drawingRef.current;
    if (!st || pendingRef.current.length === 0) return;
    sockRef.current?.emit('wb:stroke:partial', {
      bookingId, sid: sidRef.current,
      meta: { color: st.color, width: st.width, erase: st.erase, highlight: st.highlight },
      points: pendingRef.current,
    });
    pendingRef.current = [];
  }
  function down(e: React.PointerEvent) {
    if (status !== 'ready' || rejected(e)) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p0 = pt(e);
    drawingRef.current = tool === 'eraser'
      ? { points: [p0], color: '#000', width: Math.max(16, width * 4), erase: true }
      : tool === 'highlighter'
        ? { points: [p0], color, width: Math.max(14, width * 4), highlight: true }
        : { points: [p0], color, width };
    sidRef.current = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    pendingRef.current = [p0];
    lastFlushRef.current = 0;
    redraw();
  }
  function move(e: React.PointerEvent) {
    if (!drawingRef.current || rejected(e)) return;
    const p = pt(e);
    drawingRef.current.points.push(p);
    pendingRef.current.push(p);
    redraw();
    const now = Date.now();
    if (now - lastFlushRef.current >= 50) { lastFlushRef.current = now; flushPartial(); } // ~20fps 스트리밍
  }
  function up() {
    const st = drawingRef.current; drawingRef.current = null;
    if (!st || st.points.length === 0) { pendingRef.current = []; return; }
    strokesRef.current.push(st); redraw();
    // 최종 획(전체) 전송 + sid 로 상대의 라이브 버퍼 확정·정리
    sockRef.current?.emit('wb:stroke', { bookingId, stroke: st, sid: sidRef.current });
    pendingRef.current = [];
    scheduleAutosave();
  }
  function clear() { strokesRef.current = []; loadBg(null); redraw(); sockRef.current?.emit('wb:clear', { bookingId }); sockRef.current?.emit('wb:image', { bookingId, fileId: null }); scheduleAutosave(); }
  function save() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setSaveState('saving');
    sockRef.current?.emit('wb:save', { bookingId, strokes: strokesRef.current, backgroundFileId: bgFileIdRef.current }, () => setSaveState('saved'));
  }

  async function useAsBackground(blob: Blob, name: string) {
    const form = new FormData(); form.append('file', blob, name);
    const r = await api.upload<{ id: string }>('/files', form);
    loadBg(r.id);
    sockRef.current?.emit('wb:image', { bookingId, fileId: r.id });
    scheduleAutosave();
  }
  async function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    await useAsBackground(f, f.name);
  }
  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      camStreamRef.current = stream; setCamOn(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } }, 30);
    } catch { alert('카메라를 사용할 수 없어요. 권한을 확인해 주세요.'); }
  }
  function closeCamera() { camStreamRef.current?.getTracks().forEach((t) => t.stop()); camStreamRef.current = null; setCamOn(false); }
  async function capture() {
    const v = videoRef.current; if (!v) return;
    const cw = v.videoWidth || 1280, ch = v.videoHeight || 720;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    c.getContext('2d')!.drawImage(v, 0, 0, cw, ch); // getUserMedia 캡처 = 무소음(네이티브 셔터음 없음)
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
    closeCamera();
    await useAsBackground(blob, 'shot.jpg');
  }
  useEffect(() => () => closeCamera(), []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title ?? '공유 화이트보드'} onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 960, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>🖊 {title ?? '공유 화이트보드'}</b>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {status !== 'off' && (call.inCall
              ? <>
                  <span style={{ fontSize: 12, color: call.peerPresent ? 'var(--chip-done)' : 'var(--muted)' }}>🎧 {call.peerPresent ? '통화 중' : '연결 대기'}</span>
                  <button className="btn ghost sm" onClick={call.toggleMute}>{call.muted ? '🔇 음소거' : '🎙 켜짐'}</button>
                  <button className="btn danger sm" onClick={call.hangup}>통화 종료</button>
                </>
              : <button className="btn ghost sm" onClick={call.start}>📞 음성통화</button>)}
            <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
          </div>
        </div>
        {status === 'off' ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>화이트보드는 프리미엄 상품에서 제공됩니다.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
              {COLORS.map((c) => (
                <button key={c} onClick={() => { setColor(c); setTool((t) => (t === 'eraser' ? 'pen' : t)); }} title={c} aria-label={`색상 ${c}`} aria-pressed={color === c && tool !== 'eraser'}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c && tool !== 'eraser' ? '3px solid var(--teal)' : '2px solid var(--line)' }} />
              ))}
              {[2, 3, 6, 10].map((w) => (
                <button key={w} onClick={() => setWidth(w)}
                  style={{ width: 28, height: 26, borderRadius: 6, cursor: 'pointer', border: width === w ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontWeight: 700, fontSize: 12 }}>{w}</button>
              ))}
              <button onClick={() => setTool('pen')} aria-pressed={tool === 'pen'} title="펜" style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: tool === 'pen' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}>✏️</button>
              <button onClick={() => setTool('highlighter')} aria-pressed={tool === 'highlighter'} title="형광펜" style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: tool === 'highlighter' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}>🖍</button>
              <button onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} title="지우개" style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: tool === 'eraser' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}>🧽</button>
              <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAttach} />
              <button className="btn ghost sm" onClick={() => fileRef.current?.click()}>🖼 이미지</button>
              <button className="btn ghost sm" onClick={openCamera}>📷 촬영</button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '자동 저장됨 ✓' : saveState === 'dirty' ? '변경됨' : ''}</span>
              <button className="btn ghost sm" onClick={clear}>전체 지우기</button>
              <button className="btn sm" onClick={save}>저장</button>
            </div>
            <div style={{ position: 'relative' }}>
              <canvas ref={canvasRef} width={W} height={H} role="img" aria-label="공유 필기 캔버스"
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
                style={{ width: '100%', aspectRatio: `${W} / ${H}`, background: '#fff', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
              {camOn && (
                <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' }}>
                  <video ref={videoRef} playsInline muted style={{ flex: 1, width: '100%', objectFit: 'contain', minHeight: 0 }} />
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: 12, background: '#000' }}>
                    <button className="btn ghost sm" onClick={closeCamera}>취소</button>
                    <button className="btn sm" onClick={capture}>📸 촬영(무음)</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        <audio ref={call.remoteAudioRef} autoPlay />
      </div>
    </div>
  );
}
