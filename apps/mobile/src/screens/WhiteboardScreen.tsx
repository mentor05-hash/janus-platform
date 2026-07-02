import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api } from '../api';
import { useTheme, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { useVoiceCall } from '../voiceCall';

type Pt = { x: number; y: number };
type Stroke = { points: Pt[]; color: string; width: number; erase?: boolean };
const COLORS = ['#16242B', '#0E5C7C', '#E5484D', '#2F9E44', '#F08C00'];
const W = 720, H = 900;

/** 공유 화이트보드(모바일/expo-web). web 에서는 실제 canvas 를 DOM 에 주입해 웹 패널과 동일 프로토콜 사용. */
export function WhiteboardScreen({ bookingId, title, onClose }: { bookingId: string; title: string; onClose: () => void }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isWeb = typeof document !== 'undefined';
  const hostRef = useRef<View>(null);
  const sockRef = useRef<Socket | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorRef = useRef(COLORS[0]);
  const widthRef = useRef(4);
  const toolRef = useRef<'pen' | 'eraser'>('pen');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgFileIdRef = useRef<string | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const call = useVoiceCall(() => sockRef.current, bookingId);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>(isWeb ? 'connecting' : 'off');
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  useWebBack(true, onClose);

  function redraw() {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (bgImgRef.current) {
      const img = bgImgRef.current, ir = img.width / img.height, cr = W / H;
      let dw = W, dh = H, dx = 0, dy = 0;
      if (ir > cr) { dh = W / ir; dy = (H - dh) / 2; } else { dw = H * ir; dx = (W - dw) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of [...strokesRef.current, ...(drawingRef.current ? [drawingRef.current] : [])]) {
      if (s.points.length < 1) continue;
      ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width;
      ctx.beginPath(); ctx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
      if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function scheduleAutosave() {
    setSaveState('dirty');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(), 1500);
  }
  function loadBg(fileId: string | null) {
    bgFileIdRef.current = fileId;
    if (!fileId || typeof document === 'undefined') { bgImgRef.current = null; redraw(); return; }
    api.fileBlobUrl(fileId).then((url) => { const img = new Image(); img.onload = () => { bgImgRef.current = img; redraw(); }; img.src = url; }).catch(() => {});
  }

  useEffect(() => {
    if (!isWeb) return;
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.style.cssText = 'width:100%;height:100%;background:#fff;touch-action:none;display:block;border-radius:8px;';
    host.appendChild(cv); canvasRef.current = cv;
    const toLogical = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
    const down = (e: PointerEvent) => {
      if (status !== 'ready') return; cv.setPointerCapture?.(e.pointerId);
      drawingRef.current = toolRef.current === 'eraser'
        ? { points: [toLogical(e)], color: '#000', width: Math.max(16, widthRef.current * 4), erase: true }
        : { points: [toLogical(e)], color: colorRef.current, width: widthRef.current };
      redraw();
    };
    const move = (e: PointerEvent) => { if (!drawingRef.current) return; drawingRef.current.points.push(toLogical(e)); redraw(); };
    const up = () => { const st = drawingRef.current; drawingRef.current = null; if (!st || !st.points.length) return; strokesRef.current.push(st); redraw(); sockRef.current?.emit('wb:stroke', { bookingId, stroke: st }); scheduleAutosave(); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointerleave', up);

    const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('itall_access') : '') ?? '';
    const s = io(window.location.origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
    sockRef.current = s;
    s.on('connect', () => s.emit('wb:join', { bookingId }, (r: { ok: boolean; strokes?: Stroke[]; backgroundFileId?: string | null }) => {
      if (!r?.ok) { setStatus('off'); return; }
      strokesRef.current = Array.isArray(r.strokes) ? r.strokes : []; setStatus('ready'); redraw();
      if (r.backgroundFileId) loadBg(r.backgroundFileId);
    }));
    s.on('wb:stroke', ({ stroke }: { stroke: Stroke }) => { strokesRef.current.push(stroke); redraw(); });
    s.on('wb:clear', () => { strokesRef.current = []; redraw(); });
    s.on('wb:image', ({ fileId }: { fileId: string | null }) => loadBg(fileId));
    return () => { s.disconnect(); cv.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => { redraw(); }, [status]);
  useEffect(() => () => closeCamera(), []);
  function pick(c: string) { setColor(c); colorRef.current = c; setTool('pen'); toolRef.current = 'pen'; }
  function pickW(w: number) { setWidth(w); widthRef.current = w; }
  function pickTool(t: 'pen' | 'eraser') { setTool(t); toolRef.current = t; }
  function clear() { strokesRef.current = []; loadBg(null); redraw(); sockRef.current?.emit('wb:clear', { bookingId }); sockRef.current?.emit('wb:image', { bookingId, fileId: null }); scheduleAutosave(); }
  function save() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setSaveState('saving');
    sockRef.current?.emit('wb:save', { bookingId, strokes: strokesRef.current, backgroundFileId: bgFileIdRef.current }, () => setSaveState('saved'));
  }
  async function useAsBackground(blob: Blob, name: string) {
    try { const r = await api.uploadWeb(blob as unknown as File, name); loadBg(r.id); sockRef.current?.emit('wb:image', { bookingId, fileId: r.id }); scheduleAutosave(); } catch { /* noop */ }
  }
  function attachImage() {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => { const f = input.files?.[0]; if (f && f.type.startsWith('image/')) await useAsBackground(f, f.name); };
    input.click();
  }
  async function openCamera() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof document === 'undefined') return;
    const host = hostRef.current as unknown as HTMLElement | null; if (!host) return;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      camStreamRef.current = st; setCamOn(true);
      const ov = document.createElement('div'); ov.id = 'wb-cam-ov';
      ov.style.cssText = 'position:absolute;inset:0;background:#000;display:flex;flex-direction:column;z-index:20;';
      const v = document.createElement('video'); v.playsInline = true; v.muted = true;
      v.style.cssText = 'flex:1;width:100%;object-fit:contain;min-height:0;'; v.srcObject = st; void v.play();
      const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:10px;justify-content:center;padding:12px;background:#000;';
      const btn = (t: string, bg: string) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = `padding:9px 16px;border-radius:8px;border:none;font-weight:700;font-size:14px;color:#fff;background:${bg};`; return b; };
      const cancel = btn('취소', '#3a4a52'); cancel.onclick = () => closeCamera();
      const shot = btn('📸 촬영(무음)', '#0E5C7C'); shot.onclick = () => capture(v);
      bar.append(cancel, shot); ov.append(v, bar); host.appendChild(ov);
    } catch { /* 권한 거부 */ }
  }
  function closeCamera() { camStreamRef.current?.getTracks().forEach((t) => t.stop()); camStreamRef.current = null; if (typeof document !== 'undefined') document.getElementById('wb-cam-ov')?.remove(); setCamOn(false); }
  async function capture(v: HTMLVideoElement) {
    const cw = v.videoWidth || 1280, ch = v.videoHeight || 720;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d')!.drawImage(v, 0, 0, cw, ch);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
    closeCamera(); await useAsBackground(blob, 'shot.jpg');
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.headT}>🖊 {title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {status !== 'off' && call.supported && (call.inCall
              ? <>
                  <TouchableOpacity onPress={call.toggleMute}><Text style={{ fontSize: 18 }}>{call.muted ? '🔇' : '🎙'}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={call.hangup}><Text style={{ color: '#E5484D', fontWeight: '800', fontSize: 13 }}>종료</Text></TouchableOpacity>
                </>
              : <TouchableOpacity onPress={call.start}><Text style={{ fontSize: 18 }}>📞</Text></TouchableOpacity>)}
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.close}>✕</Text></TouchableOpacity>
          </View>
        </View>
        {status === 'off' ? (
          <Text style={styles.hint}>{isWeb ? '화이트보드는 프리미엄 상품에서 제공됩니다.' : '화이트보드는 웹에서 지원됩니다.'}</Text>
        ) : (
          <>
            <View style={styles.tools}>
              {COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => pick(c)} style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? C.teal : C.line, borderWidth: color === c ? 3 : 1 }]} />
              ))}
              <View style={{ width: 8 }} />
              {[2, 4, 8].map((w) => (
                <TouchableOpacity key={w} onPress={() => pickW(w)} style={[styles.wbtn, width === w && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>{w}</Text></TouchableOpacity>
              ))}
              <View style={{ width: 6 }} />
              <TouchableOpacity onPress={() => pickTool('pen')} style={[styles.wbtn, { width: 40 }, tool === 'pen' && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>✏️</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => pickTool('eraser')} style={[styles.wbtn, { width: 40 }, tool === 'eraser' && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>🧽</Text></TouchableOpacity>
              <TouchableOpacity onPress={attachImage} style={[styles.wbtn, { width: 40 }]}><Text style={styles.wtxt}>🖼</Text></TouchableOpacity>
              <TouchableOpacity onPress={openCamera} style={[styles.wbtn, { width: 40 }]}><Text style={styles.wtxt}>📷</Text></TouchableOpacity>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 10, color: C.muted, marginRight: 4 }}>{saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '자동저장 ✓' : saveState === 'dirty' ? '변경됨' : ''}</Text>
              <TouchableOpacity onPress={clear} style={styles.act}><Text style={styles.actT}>전체 지우기</Text></TouchableOpacity>
              <TouchableOpacity onPress={save} style={[styles.act, styles.actP]}><Text style={[styles.actT, { color: '#fff' }]}>저장</Text></TouchableOpacity>
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
  sheet: { width: '100%', maxWidth: 480, height: '90%', backgroundColor: C.bg, borderRadius: 14, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  headT: { fontSize: 15, fontWeight: '800', color: C.ink },
  close: { fontSize: 18, color: C.muted },
  hint: { color: C.muted, fontSize: 13, textAlign: 'center', padding: 40 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderBottomWidth: 1, borderBottomColor: C.line, flexWrap: 'wrap' },
  swatch: { width: 24, height: 24, borderRadius: 12 },
  wbtn: { width: 30, height: 26, borderRadius: 6, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
  wtxt: { fontSize: 12, fontWeight: '700', color: C.ink },
  act: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  actP: { backgroundColor: C.teal, borderColor: C.teal },
  actT: { fontSize: 13, fontWeight: '700', color: C.muted },
  canvasHost: { flex: 1, margin: 10, borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' },
});
