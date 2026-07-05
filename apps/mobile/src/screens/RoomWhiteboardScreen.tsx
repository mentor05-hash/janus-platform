import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { useTheme, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { useRoomVoiceCall } from '../roomVoiceCall';
import { useSessionPhase, canInteract, sessionNotice, type SessionInfo } from '../session';
import type { RoomSession } from './RoomChatScreen';

type Pt = { x: number; y: number; p?: number };
type Stroke = { points: Pt[]; color: string; width: number; erase?: boolean; highlight?: boolean };
const COLORS = ['#16242B', '#0E5C7C', '#E5484D', '#2F9E44', '#F08C00'];
const W = 720, H = 900;

/** 룸 서비스 기반 공유 화이트보드(모바일/expo-web 이관 경로). 이미지 배경 + 필기 + 음성. PDF 는 이음새로 보류. */
export function RoomWhiteboardScreen({ title, onClose, embedded, session: rs }: { bookingId: string; title: string; onClose: () => void; embedded?: boolean; session: RoomSession }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isWeb = typeof document !== 'undefined';
  const hostRef = useRef<View>(null);
  const sockRef = useRef<Socket | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const liveRef = useRef<Map<string, Stroke>>(new Map());
  const sidRef = useRef('');
  const pendingRef = useRef<Pt[]>([]);
  const lastFlushRef = useRef(0);
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const pointersRef = useRef(new Map<number, { cx: number; cy: number }>());
  const pinchRef = useRef<{ dist: number; midCx: number; midCy: number; view: { scale: number; tx: number; ty: number } } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkRef = useRef<HTMLCanvasElement | null>(null); // 잉크 작업 레이어(지우개가 배경을 안 뚫게)
  const cacheRef = useRef<HTMLCanvasElement | null>(null); // 확정 스트로크 캐시(핫패스 O(1) 복원)
  const rafRef = useRef(0); // rAF 코얼레싱 핸들
  const cacheDirtyRef = useRef(true); // 확정 집합/뷰 변경 시 캐시 재빌드 필요
  const colorRef = useRef(COLORS[0]);
  const widthRef = useRef(4);
  const toolRef = useRef<'pen' | 'eraser' | 'highlighter'>('pen');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgUrlRef = useRef<string | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const okRef = useRef(true);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'highlighter'>('pen');
  const [zoomPct, setZoomPct] = useState(100);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>(isWeb ? 'connecting' : 'off');
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [session, setSession] = useState<SessionInfo>(rs.session);
  const call = useRoomVoiceCall(() => sockRef.current);
  useWebBack(!embedded, onClose);

  function paintStroke(ictx: CanvasRenderingContext2D, s: Stroke) {
    if (s.points.length < 1) return;
    ictx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; ictx.globalAlpha = s.highlight ? 0.32 : 1; ictx.strokeStyle = s.color;
    if (s.erase || s.highlight || s.points.length === 1 || s.points.every((q) => q.p == null)) {
      ictx.lineWidth = s.width; ictx.beginPath(); ictx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points.slice(1)) ictx.lineTo(p.x, p.y);
      if (s.points.length === 1) ictx.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1); ictx.stroke();
    } else { for (let i = 1; i < s.points.length; i++) { const a = s.points[i - 1], b = s.points[i]; ictx.lineWidth = s.width * (0.35 + (b.p ?? 0.5) * 1.3); ictx.beginPath(); ictx.moveTo(a.x, a.y); ictx.lineTo(b.x, b.y); ictx.stroke(); } }
  }

  function rebuildCache() {
    const cv = canvasRef.current; if (!cv) return;
    const cache = (cacheRef.current ??= document.createElement('canvas'));
    if (cache.width !== cv.width || cache.height !== cv.height) { cache.width = cv.width; cache.height = cv.height; }
    const cctx = cache.getContext('2d'); if (!cctx) return;
    const v = viewRef.current;
    cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.clearRect(0, 0, cache.width, cache.height);
    cctx.setTransform(v.scale, 0, 0, v.scale, v.tx, v.ty); cctx.lineCap = 'round'; cctx.lineJoin = 'round';
    for (const s of strokesRef.current) paintStroke(cctx, s);
  }

  // 한 프레임 합성: 배경 + (확정 캐시 복사 + 라이브/진행 획). 확정 획 수와 무관하게 O(1) 복원.
  function drawFrame() {
    rafRef.current = 0;
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    if (cacheDirtyRef.current || !cacheRef.current) { rebuildCache(); cacheDirtyRef.current = false; }
    const v = viewRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(v.scale, 0, 0, v.scale, v.tx, v.ty);
    if (bgImgRef.current) { const img = bgImgRef.current, ir = img.width / img.height, cr = W / H; let dw = W, dh = H, dx = 0, dy = 0; if (ir > cr) { dh = W / ir; dy = (H - dh) / 2; } else { dw = H * ir; dx = (W - dw) / 2; } ctx.drawImage(img, dx, dy, dw, dh); }
    const ink = (inkRef.current ??= document.createElement('canvas'));
    if (ink.width !== cv.width || ink.height !== cv.height) { ink.width = cv.width; ink.height = cv.height; }
    const ictx = ink.getContext('2d'); if (!ictx) return;
    ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.clearRect(0, 0, ink.width, ink.height);
    if (cacheRef.current) ictx.drawImage(cacheRef.current, 0, 0);
    ictx.setTransform(v.scale, 0, 0, v.scale, v.tx, v.ty); ictx.lineCap = 'round'; ictx.lineJoin = 'round';
    for (const s of [...liveRef.current.values(), ...(drawingRef.current ? [drawingRef.current] : [])]) paintStroke(ictx, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(ink, 0, 0);
  }
  function requestPaint() { if (!rafRef.current) rafRef.current = requestAnimationFrame(drawFrame); }
  function redraw() { cacheDirtyRef.current = true; requestPaint(); }
  function clampView() { const v = viewRef.current; v.scale = Math.min(8, Math.max(1, v.scale)); v.tx = Math.min(0, Math.max(W - W * v.scale, v.tx)); v.ty = Math.min(0, Math.max(H - H * v.scale, v.ty)); }
  function zoomAt(cx: number, cy: number, f: number) { const v = viewRef.current; const ns = Math.min(8, Math.max(1, v.scale * f)); const k = ns / v.scale; v.tx = cx - (cx - v.tx) * k; v.ty = cy - (cy - v.ty) * k; v.scale = ns; clampView(); setZoomPct(Math.round(v.scale * 100)); redraw(); }
  function resetZoom() { viewRef.current = { scale: 1, tx: 0, ty: 0 }; setZoomPct(100); redraw(); }
  function scheduleAutosave() { setSaveState('dirty'); if (saveTimerRef.current) clearTimeout(saveTimerRef.current); saveTimerRef.current = setTimeout(() => save(), 1500); }
  function loadBg(fileUrl: string | null) {
    bgUrlRef.current = fileUrl;
    if (!fileUrl || typeof document === 'undefined') { bgImgRef.current = null; requestPaint(); return; }
    const abs = `${rs.url}${fileUrl}${fileUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(rs.token)}`;
    fetch(abs).then((r) => r.blob()).then((b) => { const img = new Image(); img.onload = () => { bgImgRef.current = img; requestPaint(); }; img.src = URL.createObjectURL(b); }).catch(() => {});
  }

  useEffect(() => {
    if (!isWeb) return;
    const host = hostRef.current as unknown as HTMLElement | null; if (!host) return;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.style.cssText = 'width:100%;height:100%;background:#fff;touch-action:none;display:block;border-radius:8px;';
    host.appendChild(cv); canvasRef.current = cv;
    let penSeen = false;
    const rejected = (e: PointerEvent) => { if (e.pointerType === 'pen') penSeen = true; return penSeen && e.pointerType === 'touch'; };
    const cs = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { cx: ((e.clientX - r.left) / r.width) * W, cy: ((e.clientY - r.top) / r.height) * H }; };
    const pt = (e: PointerEvent): Pt => { const { cx, cy } = cs(e); const v = viewRef.current; const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : e.pressure > 0 ? e.pressure : 0.5; return { x: (cx - v.tx) / v.scale, y: (cy - v.ty) / v.scale, p }; };
    const flush = () => { const st = drawingRef.current; if (!st || pendingRef.current.length === 0) return; sockRef.current?.emit('wb:stroke:partial', { sid: sidRef.current, meta: { color: st.color, width: st.width, erase: st.erase, highlight: st.highlight }, points: pendingRef.current }); pendingRef.current = []; };
    const finalize = () => { const st = drawingRef.current; drawingRef.current = null; if (!st || !st.points.length) { pendingRef.current = []; return; } strokesRef.current.push(st); redraw(); sockRef.current?.emit('wb:stroke', { stroke: st, sid: sidRef.current }); pendingRef.current = []; scheduleAutosave(); };
    const beginPinch = () => { const p = [...pointersRef.current.values()]; if (p.length < 2) return; const [a, b] = p; pinchRef.current = { dist: Math.hypot(a.cx - b.cx, a.cy - b.cy) || 1, midCx: (a.cx + b.cx) / 2, midCy: (a.cy + b.cy) / 2, view: { ...viewRef.current } }; };
    const down = (e: PointerEvent) => {
      if (status !== 'ready') return; cv.setPointerCapture?.(e.pointerId); pointersRef.current.set(e.pointerId, cs(e));
      if (pointersRef.current.size >= 2) { finalize(); beginPinch(); return; }
      if (!okRef.current) return; if (rejected(e)) return;
      const p0 = pt(e);
      drawingRef.current = toolRef.current === 'eraser' ? { points: [p0], color: '#000', width: Math.max(16, widthRef.current * 4), erase: true }
        : toolRef.current === 'highlighter' ? { points: [p0], color: colorRef.current, width: Math.max(14, widthRef.current * 4), highlight: true }
          : { points: [p0], color: colorRef.current, width: widthRef.current };
      sidRef.current = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; pendingRef.current = [p0]; lastFlushRef.current = 0; requestPaint();
    };
    const move = (e: PointerEvent) => {
      if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, cs(e));
      if (pinchRef.current && pointersRef.current.size >= 2) {
        const [a, b] = [...pointersRef.current.values()]; const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy) || 1;
        const midCx = (a.cx + b.cx) / 2, midCy = (a.cy + b.cy) / 2, pin = pinchRef.current, v = viewRef.current;
        const k = Math.min(8, Math.max(1, (pin.view.scale * dist) / pin.dist)) / pin.view.scale;
        v.scale = pin.view.scale * k; v.tx = midCx - (pin.midCx - pin.view.tx) * k; v.ty = midCy - (pin.midCy - pin.view.ty) * k; clampView(); setZoomPct(Math.round(v.scale * 100)); redraw(); return;
      }
      if (!drawingRef.current || rejected(e)) return;
      const p = pt(e); drawingRef.current.points.push(p); pendingRef.current.push(p); requestPaint();
      const now = Date.now(); if (now - lastFlushRef.current >= 50) { lastFlushRef.current = now; flush(); }
    };
    const up = (e: PointerEvent) => { pointersRef.current.delete(e.pointerId); if (pointersRef.current.size < 2) pinchRef.current = null; finalize(); };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const { cx, cy } = cs(e as unknown as PointerEvent); if (e.ctrlKey || e.metaKey) zoomAt(cx, cy, e.deltaY < 0 ? 1.1 : 1 / 1.1); else { const v = viewRef.current; v.tx -= e.deltaX; v.ty -= e.deltaY; clampView(); redraw(); } };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointerleave', up); cv.addEventListener('wheel', onWheel, { passive: false });

    const s = io(rs.url, { path: '/api/rt/v1/socket.io', auth: { token: rs.token }, transports: ['websocket'] });
    sockRef.current = s;
    s.on('connect', () => s.emit('wb:join', {}, (r: { ok: boolean; strokes?: Stroke[]; backgroundUrl?: string | null; session?: SessionInfo }) => {
      if (!r?.ok) { setStatus('off'); return; }
      strokesRef.current = Array.isArray(r.strokes) ? r.strokes : []; if (r.session) setSession(r.session); setStatus('ready'); redraw();
      if (r.backgroundUrl) loadBg(r.backgroundUrl);
    }));
    s.on('wb:stroke:partial', ({ sid, meta, points }: { sid: string; meta: Partial<Stroke>; points: Pt[] }) => { let st = liveRef.current.get(sid); if (!st) { st = { color: meta.color ?? '#16242B', width: meta.width ?? 4, erase: meta.erase, highlight: meta.highlight, points: [] }; liveRef.current.set(sid, st); } st.points.push(...points); requestPaint(); });
    s.on('wb:stroke', ({ stroke, sid }: { stroke: Stroke; sid?: string }) => { if (sid) liveRef.current.delete(sid); strokesRef.current.push(stroke); redraw(); });
    s.on('wb:clear', () => { strokesRef.current = []; liveRef.current.clear(); redraw(); });
    s.on('wb:image', ({ fileUrl }: { fileUrl: string | null }) => loadBg(fileUrl));
    s.on('session:closed', (e: { closesAt?: string }) => setSession((v) => ({ ...v, state: 'closed', closesAt: e.closesAt ?? v.closesAt })));
    s.on('session:revoked', () => setStatus('off'));
    return () => { s.disconnect(); cv.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rs.url, rs.token]);

  useEffect(() => { redraw(); }, [status]);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
  useEffect(() => () => closeCamera(), []);
  const phase = useSessionPhase(session);
  const rw = canInteract(phase);
  const notice = sessionNotice(phase, session);
  useEffect(() => { okRef.current = rw; }, [rw]);
  useEffect(() => { if (phase === 'closed' && status === 'ready') save(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [phase]);
  useEffect(() => { if (!rw && call.inCall) call.hangup(); }, [rw, call.inCall]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(c: string) { setColor(c); colorRef.current = c; if (toolRef.current === 'eraser') { setTool('pen'); toolRef.current = 'pen'; } }
  function pickW(w: number) { setWidth(w); widthRef.current = w; }
  function pickTool(t: 'pen' | 'eraser' | 'highlighter') { setTool(t); toolRef.current = t; }
  function clear() { strokesRef.current = []; loadBg(null); redraw(); sockRef.current?.emit('wb:clear'); sockRef.current?.emit('wb:image', { fileUrl: null }); scheduleAutosave(); }
  function save() { if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; } setSaveState('saving'); sockRef.current?.emit('wb:save', { strokes: strokesRef.current, backgroundUrl: bgUrlRef.current }, () => setSaveState('saved')); }
  async function useAsBackground(blob: Blob, name: string) {
    const form = new FormData(); form.append('file', blob as unknown as Blob, name);
    const r = await fetch(`${rs.url}/api/rt/v1/files`, { method: 'POST', headers: { authorization: `Bearer ${rs.token}` }, body: form });
    if (!r.ok) return; const { fileUrl } = await r.json() as { fileUrl: string };
    loadBg(fileUrl); sockRef.current?.emit('wb:image', { fileUrl }); scheduleAutosave();
  }
  function attachImage() {
    if (typeof document === 'undefined') return;
    // 이음새(N22): 현재 이미지 배경만. 사업확장 후 룸 서비스 PDF 렌더 추가 시 PDF 분기 활성화. 결정사항 Decision-Register C-7 참조.
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => { const f = input.files?.[0]; if (!f) return; if (f.type.startsWith('image/')) { try { await useAsBackground(f, f.name); } catch { /* noop */ } } };
    input.click();
  }
  async function openCamera() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof document === 'undefined') return;
    const host = hostRef.current as unknown as HTMLElement | null; if (!host) return;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); camStreamRef.current = st;
      const ov = document.createElement('div'); ov.id = 'rwb-cam-ov'; ov.style.cssText = 'position:absolute;inset:0;background:#000;display:flex;flex-direction:column;z-index:20;';
      const v = document.createElement('video'); v.playsInline = true; v.muted = true; v.style.cssText = 'flex:1;width:100%;object-fit:contain;min-height:0;'; v.srcObject = st; void v.play();
      const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:10px;justify-content:center;padding:12px;background:#000;';
      const btn = (t: string, bg: string) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = `padding:9px 16px;border-radius:8px;border:none;font-weight:700;font-size:14px;color:#fff;background:${bg};`; return b; };
      const cancel = btn('취소', '#3a4a52'); cancel.onclick = () => closeCamera();
      const shot = btn('📸 촬영(무음)', '#0E5C7C'); shot.onclick = async () => { const cw = v.videoWidth || 1280, ch = v.videoHeight || 720; const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d')!.drawImage(v, 0, 0, cw, ch); const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85)); closeCamera(); await useAsBackground(blob, 'shot.jpg'); };
      bar.append(cancel, shot); ov.append(v, bar); host.appendChild(ov);
    } catch { /* 권한 거부 */ }
  }
  function closeCamera() { camStreamRef.current?.getTracks().forEach((t) => t.stop()); camStreamRef.current = null; if (typeof document !== 'undefined') document.getElementById('rwb-cam-ov')?.remove(); }

  return (
    <View style={embedded ? styles.embWrap : styles.overlay}>
      <View style={[styles.sheet, embedded && styles.embSheet]}>
        <View style={styles.head}>
          <Text style={styles.headT}>🖊 {title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {status !== 'off' && call.supported && (call.inCall
              ? <>
                  <TouchableOpacity onPress={call.toggleMute}><Text style={{ fontSize: 18 }}>{call.muted ? '🔇' : '🎙'}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={call.hangup}><Text style={{ color: '#E5484D', fontWeight: '800', fontSize: 13 }}>종료</Text></TouchableOpacity>
                </>
              : rw ? <TouchableOpacity onPress={call.start}><Text style={{ fontSize: 18 }}>📞</Text></TouchableOpacity> : null)}
            {!embedded && <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.close}>✕</Text></TouchableOpacity>}
          </View>
        </View>
        {status === 'off' ? (
          <Text style={styles.hint}>{isWeb ? '화이트보드 세션이 종료되었어요.' : '화이트보드는 웹에서 지원됩니다.'}</Text>
        ) : (
          <>
            {!rw && <View style={[styles.notice, phase === 'closed' && { backgroundColor: C.lineSoft }]}><Text style={styles.noticeT}>{phase === 'closed' ? '🔒 ' : '⏳ '}{notice} 필기는 예약 시간대에만 가능하고 지금은 열람만 됩니다.</Text></View>}
            <View style={styles.tools}>
              {COLORS.map((c) => (<TouchableOpacity key={c} onPress={() => pick(c)} style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? C.teal : C.line, borderWidth: color === c ? 3 : 1 }]} />))}
              <View style={{ width: 8 }} />
              {[2, 4, 8].map((w) => (<TouchableOpacity key={w} onPress={() => pickW(w)} style={[styles.wbtn, width === w && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>{w}</Text></TouchableOpacity>))}
              <View style={{ width: 6 }} />
              <TouchableOpacity onPress={() => pickTool('pen')} style={[styles.wbtn, { width: 40 }, tool === 'pen' && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>✏️</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => pickTool('highlighter')} style={[styles.wbtn, { width: 40 }, tool === 'highlighter' && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>🖍</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => pickTool('eraser')} style={[styles.wbtn, { width: 40 }, tool === 'eraser' && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>🧽</Text></TouchableOpacity>
              <TouchableOpacity disabled={!rw} onPress={attachImage} style={[styles.wbtn, { width: 40, opacity: rw ? 1 : 0.4 }]}><Text style={styles.wtxt}>🖼</Text></TouchableOpacity>
              <TouchableOpacity disabled={!rw} onPress={openCamera} style={[styles.wbtn, { width: 40, opacity: rw ? 1 : 0.4 }]}><Text style={styles.wtxt}>📷</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => zoomAt(W / 2, H / 2, 1 / 1.25)} style={[styles.wbtn, { width: 34 }]}><Text style={styles.wtxt}>−</Text></TouchableOpacity>
              <TouchableOpacity onPress={resetZoom} style={[styles.wbtn, { width: 48 }]}><Text style={styles.wtxt}>{zoomPct}%</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => zoomAt(W / 2, H / 2, 1.25)} style={[styles.wbtn, { width: 34 }]}><Text style={styles.wtxt}>＋</Text></TouchableOpacity>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 10, color: C.muted, marginRight: 4 }}>{saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '자동저장 ✓' : saveState === 'dirty' ? '변경됨' : ''}</Text>
              <TouchableOpacity disabled={!rw} onPress={clear} style={[styles.act, !rw && { opacity: 0.4 }]}><Text style={styles.actT}>전체 지우기</Text></TouchableOpacity>
              <TouchableOpacity disabled={!rw} onPress={save} style={[styles.act, styles.actP, !rw && { opacity: 0.4 }]}><Text style={[styles.actT, { color: '#fff' }]}>저장</Text></TouchableOpacity>
            </View>
            <View ref={hostRef} style={styles.canvasHost} />
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(8,16,20,0.5)', justifyContent: 'center', alignItems: 'center', padding: 10, zIndex: 100 },
  embWrap: { flex: 1, backgroundColor: C.bg },
  sheet: { width: '100%', maxWidth: 480, height: '90%', backgroundColor: C.bg, borderRadius: 14, overflow: 'hidden' },
  embSheet: { maxWidth: 100000, height: '100%', borderRadius: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  headT: { fontSize: 15, fontWeight: '800', color: C.ink },
  close: { fontSize: 18, color: C.muted },
  hint: { color: C.muted, fontSize: 13, textAlign: 'center', padding: 40 },
  notice: { paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.lineSoft, alignItems: 'center' },
  noticeT: { fontSize: 12, color: C.muted, textAlign: 'center' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderBottomWidth: 1, borderBottomColor: C.line, flexWrap: 'wrap' },
  swatch: { width: 24, height: 24, borderRadius: 12 },
  wbtn: { width: 30, height: 26, borderRadius: 6, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
  wtxt: { fontSize: 12, fontWeight: '700', color: C.ink },
  act: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  actP: { backgroundColor: C.teal, borderColor: C.teal },
  actT: { fontSize: 13, fontWeight: '700', color: C.muted },
  canvasHost: { flex: 1, margin: 10, borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' },
});
