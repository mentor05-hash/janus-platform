import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

type Pt = { x: number; y: number };
type Stroke = { points: Pt[]; color: string; width: number; erase?: boolean };
const COLORS = ['#16242B', '#0E5C7C', '#E5484D', '#2F9E44', '#F08C00'];
const W = 900, H = 620; // 논리 좌표(비율 유지 스케일링)

/** 예약 기반 공유 화이트보드(웹). wb:stroke 로 완결 스트로크 브로드캐스트, wb:save 로 스냅샷 저장. */
export function WhiteboardPanel({ bookingId, title, onClose }: { bookingId: string; title?: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sockRef = useRef<Socket | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function redraw() {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of [...strokesRef.current, ...(drawingRef.current ? [drawingRef.current] : [])]) {
      if (s.points.length < 1) continue;
      ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; // 지우개=투명화
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width;
      ctx.beginPath(); ctx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
      if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** 변경 후 자동저장(디바운스) — 수동 저장 없이도 스냅샷 영속. */
  function scheduleAutosave() {
    setSaveState('dirty');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(), 1500);
  }

  useEffect(() => {
    const token = localStorage.getItem('itall_access') ?? '';
    const s = io(window.location.origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
    sockRef.current = s;
    s.on('connect', () => {
      s.emit('wb:join', { bookingId }, (r: { ok: boolean; strokes?: Stroke[] }) => {
        if (!r?.ok) { setStatus('off'); return; }
        strokesRef.current = Array.isArray(r.strokes) ? r.strokes : [];
        setStatus('ready'); redraw();
      });
    });
    s.on('wb:stroke', ({ stroke }: { stroke: Stroke }) => { strokesRef.current.push(stroke); redraw(); });
    s.on('wb:clear', () => { strokesRef.current = []; redraw(); });
    return () => { s.disconnect(); };
  }, [bookingId]);

  function toLogical(e: React.PointerEvent) {
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function down(e: React.PointerEvent) {
    if (status !== 'ready') return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawingRef.current = tool === 'eraser'
      ? { points: [toLogical(e)], color: '#000', width: Math.max(16, width * 4), erase: true }
      : { points: [toLogical(e)], color, width };
    redraw();
  }
  function move(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    drawingRef.current.points.push(toLogical(e)); redraw();
  }
  function up() {
    const st = drawingRef.current; drawingRef.current = null;
    if (!st || st.points.length === 0) return;
    strokesRef.current.push(st); redraw();
    sockRef.current?.emit('wb:stroke', { bookingId, stroke: st });
    scheduleAutosave();
  }
  function clear() { strokesRef.current = []; redraw(); sockRef.current?.emit('wb:clear', { bookingId }); scheduleAutosave(); }
  function save() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setSaveState('saving');
    sockRef.current?.emit('wb:save', { bookingId, strokes: strokesRef.current }, () => setSaveState('saved'));
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title ?? '공유 화이트보드'} onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 960, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>🖊 {title ?? '공유 화이트보드'}</b>
          <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        {status === 'off' ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>화이트보드는 프리미엄 상품에서 제공됩니다.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} title={c} aria-label={`색상 ${c}`} aria-pressed={color === c}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '3px solid var(--teal)' : '2px solid var(--line)' }} />
              ))}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>굵기</span>
              {[2, 3, 6, 10].map((w) => (
                <button key={w} onClick={() => setWidth(w)}
                  style={{ width: 30, height: 26, borderRadius: 6, cursor: 'pointer', border: width === w ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontWeight: 700, fontSize: 12 }}>{w}</button>
              ))}
              <span style={{ marginLeft: 8, display: 'inline-flex', gap: 4 }}>
                <button onClick={() => setTool('pen')} aria-pressed={tool === 'pen'} title="펜"
                  style={{ padding: '5px 9px', borderRadius: 6, cursor: 'pointer', border: tool === 'pen' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}>✏️ 펜</button>
                <button onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} title="지우개"
                  style={{ padding: '5px 9px', borderRadius: 6, cursor: 'pointer', border: tool === 'eraser' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}>🧽 지우개</button>
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '자동 저장됨 ✓' : saveState === 'dirty' ? '변경됨' : ''}
              </span>
              <button className="btn ghost sm" onClick={clear}>전체 지우기</button>
              <button className="btn sm" onClick={save}>저장</button>
            </div>
            <canvas ref={canvasRef} width={W} height={H} role="img" aria-label="공유 필기 캔버스"
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
              style={{ width: '100%', aspectRatio: `${W} / ${H}`, background: '#fff', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
          </>
        )}
      </div>
    </div>
  );
}
