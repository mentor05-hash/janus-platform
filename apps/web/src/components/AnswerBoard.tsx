// P4(큐브 벤치마크): 답변용 필기 보드 — 질문 사진을 배경으로 풀이를 필기해 PNG 로 확정.
// 실시간 공유 없음(로컬 전용) — 렌더는 board-core 단일 소스(paintStroke) 재사용.
import { useEffect, useRef, useState } from 'react';
import { paintStroke, type Pt, type Stroke } from '@mentoring/board-core';
import { api } from '../api/client';

const W = 900, H = 620;
const COLORS = ['#E5484D', '#1E3550', '#2F6FB3'];

export function AnswerBoard({ bgFileId, onDone, onClose }: { bgFileId?: string | null; onDone: (png: Blob) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const rafRef = useRef(0);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [canUndo, setCanUndo] = useState(false);
  const [busy, setBusy] = useState(false);

  // 배경(질문 이미지) 로드 — contain 배치.
  useEffect(() => {
    if (!bgFileId) return;
    let live = true;
    api.fileBlobUrl(bgFileId).then((url) => {
      const img = new Image();
      img.onload = () => { if (live) { bgImgRef.current = img; paint(); } };
      img.src = url;
    }).catch(() => { /* 배경 없이 진행 */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgFileId]);

  function compose(ctx: CanvasRenderingContext2D, scale = 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W * scale, H * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (bgImgRef.current) {
      const img = bgImgRef.current, ir = img.width / img.height, cr = W / H;
      let dw = W, dh = H, dx = 0, dy = 0;
      if (ir > cr) { dh = W / ir; dy = (H - dh) / 2; } else { dw = H * ir; dx = (W - dw) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    // 잉크 레이어 분리 — 지우개(destination-out)가 배경·흰 바탕을 안 뚫게.
    const ink = document.createElement('canvas'); ink.width = W * scale; ink.height = H * scale;
    const ictx = ink.getContext('2d')!;
    ictx.setTransform(scale, 0, 0, scale, 0, 0); ictx.lineCap = 'round'; ictx.lineJoin = 'round';
    for (const s of [...strokesRef.current, ...(drawingRef.current ? [drawingRef.current] : [])]) paintStroke(ictx, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(ink, 0, 0);
  }

  function paint() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const cv = canvasRef.current; if (!cv) return;
      const ctx = cv.getContext('2d'); if (!ctx) return;
      compose(ctx);
    });
  }
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
  useEffect(() => { paint(); }, []); // 초기 흰 바탕 렌더 // eslint-disable-line react-hooks/exhaustive-deps

  function pt(e: React.PointerEvent): Pt {
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect();
    const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : e.pressure > 0 ? e.pressure : 0.5;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, p };
  }
  function down(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p0 = pt(e);
    drawingRef.current = tool === 'eraser'
      ? { points: [p0], color: '#000', width: Math.max(16, width * 4), erase: true }
      : tool === 'highlighter'
        ? { points: [p0], color, width: Math.max(14, width * 4), highlight: true }
        : { points: [p0], color, width };
    paint();
  }
  function move(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    drawingRef.current.points.push(pt(e));
    paint();
  }
  function up() {
    const st = drawingRef.current; drawingRef.current = null;
    if (st && st.points.length) { strokesRef.current.push(st); setCanUndo(true); }
    paint();
  }
  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setCanUndo(strokesRef.current.length > 0);
    paint();
  }
  function clearInk() { strokesRef.current = []; setCanUndo(false); paint(); }

  async function done() {
    if (busy) return;
    setBusy(true);
    try {
      const out = document.createElement('canvas'); out.width = W * 2; out.height = H * 2;
      compose(out.getContext('2d')!, 2);
      const blob: Blob | null = await new Promise((res) => out.toBlob(res, 'image/png'));
      if (blob) onDone(blob);
    } finally { setBusy(false); }
  }

  const tbtn = (active: boolean): React.CSSProperties => ({ padding: '5px 9px', borderRadius: 6, cursor: 'pointer', border: active ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 });
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 960, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 860, padding: 0, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
          <b style={{ fontSize: 14 }}>🖊 필기로 풀이</b>
          {COLORS.map((c) => (
            <button key={c} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }} aria-label={`색상 ${c}`}
              style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c && tool !== 'eraser' ? '3px solid var(--teal)' : '2px solid var(--line)' }} />
          ))}
          {[2, 3, 6].map((w) => (
            <button key={w} onClick={() => setWidth(w)} style={{ ...tbtn(width === w), width: 28, fontWeight: 700, fontSize: 12 }}>{w}</button>
          ))}
          <button onClick={() => setTool('pen')} aria-pressed={tool === 'pen'} style={tbtn(tool === 'pen')}>✏️</button>
          <button onClick={() => setTool('highlighter')} aria-pressed={tool === 'highlighter'} style={tbtn(tool === 'highlighter')}>🖍</button>
          <button onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} style={tbtn(tool === 'eraser')}>🧽</button>
          <div style={{ flex: 1 }} />
          <button className="btn ghost sm" disabled={!canUndo} onClick={undo}>↶</button>
          <button className="btn ghost sm" onClick={clearInk}>필기 지우기</button>
          <button className="btn ghost sm" onClick={onClose}>취소</button>
          <button className="btn sm" disabled={busy} onClick={() => void done()}>{busy ? '생성 중…' : '답변에 첨부'}</button>
        </div>
        <canvas ref={canvasRef} width={W} height={H}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          style={{ width: '100%', aspectRatio: `${W} / ${H}`, background: '#fff', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
      </div>
    </div>
  );
}
