import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

type Pt = { x: number; y: number };
type Stroke = { points: Pt[]; color: string; width: number };
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
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [saved, setSaved] = useState(false);

  function redraw() {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of [...strokesRef.current, ...(drawingRef.current ? [drawingRef.current] : [])]) {
      if (s.points.length < 1) continue;
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width;
      ctx.beginPath(); ctx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
      if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1);
      ctx.stroke();
    }
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
    drawingRef.current = { points: [toLogical(e)], color, width }; redraw();
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
    setSaved(false);
  }
  function clear() { strokesRef.current = []; redraw(); sockRef.current?.emit('wb:clear', { bookingId }); setSaved(false); }
  function save() { sockRef.current?.emit('wb:save', { bookingId, strokes: strokesRef.current }, () => setSaved(true)); }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 960, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>🖊 {title ?? '공유 화이트보드'}</b>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        {status === 'off' ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>화이트보드는 프리미엄 상품에서 제공됩니다.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} title={c}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '3px solid var(--teal)' : '2px solid var(--line)' }} />
              ))}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>굵기</span>
              {[2, 3, 6, 10].map((w) => (
                <button key={w} onClick={() => setWidth(w)}
                  style={{ width: 30, height: 26, borderRadius: 6, cursor: 'pointer', border: width === w ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontWeight: 700, fontSize: 12 }}>{w}</button>
              ))}
              <div style={{ flex: 1 }} />
              <button className="btn ghost sm" onClick={clear}>지우기</button>
              <button className="btn sm" onClick={save}>{saved ? '저장됨 ✓' : '저장'}</button>
            </div>
            <canvas ref={canvasRef} width={W} height={H}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
              style={{ width: '100%', aspectRatio: `${W} / ${H}`, background: '#fff', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
          </>
        )}
      </div>
    </div>
  );
}
