// ⚠ 쌍둥이 구현 4파일: RoomWhiteboardScreen(모바일 룸) + 웹 WhiteboardPanel/RoomWhiteboardPanel 과
//   캔버스 합성·입력 로직이 병행 유지된다. 지우개(합성 상태 초기화) 등 캔버스 공통 수정은 **4파일 전수 반영**할 것.
//   (전례: 지우개 destination-out 누수 수정(b9ce125)이 웹 룸에만 들어가 재발 — O81)
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { paintStroke, paintGuide as renderGuide, paintLasers as renderLasers, addLaser as pushLaser, SHAPE_TOOLS, type Pt, type Stroke, type GridMode } from '@mentoring/board-core';
import { api } from '../api';
import { useTheme, type Palette } from '../theme';
import { useWebBack } from '../webBack';
import { useVoiceCall } from '../voiceCall';
import { useSessionPhase, canInteract, sessionNotice, type SessionInfo } from '../session';

type Tool = 'pen' | 'eraser' | 'highlighter' | 'laser' | 'line' | 'arrow' | 'rect' | 'ellipse';
const COLORS = ['#1E3550', '#2F6FB3', '#E5484D', '#2A8A5F', '#CF9A3A'];
const W = 720, H = 900;

/** 공유 화이트보드(모바일/expo-web). web 에서는 실제 canvas 를 DOM 에 주입해 웹 패널과 동일 프로토콜 사용. */
export function WhiteboardScreen({ bookingId, title, onClose, embedded }: { bookingId: string; title: string; onClose: () => void; embedded?: boolean }) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isWeb = typeof document !== 'undefined';
  const hostRef = useRef<View>(null);
  const sockRef = useRef<Socket | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  // 라이브 잉크: 상대가 그리는 중인 획(sid별) + 내 획 스트리밍 상태
  const liveRef = useRef<Map<string, Stroke>>(new Map());
  const sidRef = useRef('');
  const pendingRef = useRef<Pt[]>([]);
  const lastFlushRef = useRef(0);
  // 뷰포트(줌/팬) — 배경+필기 함께 확대/축소. 필기 데이터는 논리좌표 유지(공유·저장 불변).
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
  const toolRef = useRef<Tool>('pen');
  // 레이저 궤적(비영구) + undo/redo + 안내선 — 웹 패널과 파리티(쌍둥이 4파일).
  const laserRef = useRef<Map<string, { pts: Array<{ x: number; y: number; t: number }>; color: string }>>(new Map());
  const laserFlushRef = useRef(0);
  const laserPendingRef = useRef<Pt[]>([]);
  const redoRef = useRef<Stroke[]>([]);
  const gridRef = useRef<GridMode>('none');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgFileIdRef = useRef<string | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const call = useVoiceCall(() => sockRef.current, bookingId);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [tool, setTool] = useState<Tool>('pen');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [grid, setGrid] = useState<GridMode>('none');
  const [zoomPct, setZoomPct] = useState(100);
  const [pdf, setPdf] = useState<{ pdfId?: string; page: number; pageCount: number } | null>(null); // PDF 페이지 넘김
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>(isWeb ? 'connecting' : 'off');
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const okRef = useRef(true); // 세션 시간창 열림 여부(이펙트 클로저 안 그리기 핸들러가 참조)
  useWebBack(!embedded, onClose); // 임베드(통합 화면)면 back은 호스트가 처리


  // 안내선·템플릿 — 렌더는 board-core 단일 소스.
  function paintGuide(ctx: CanvasRenderingContext2D) { renderGuide(ctx, gridRef.current, W, H); }

  // 레이저 — 렌더는 board-core 단일 소스.
  function paintLasers(ctx: CanvasRenderingContext2D, v: { scale: number; tx: number; ty: number }): boolean { return renderLasers(ctx, laserRef.current, v); }
  function addLaser(key: string, x: number, y: number) { pushLaser(laserRef.current, key, x, y); }
  function flushLaser() {
    if (laserPendingRef.current.length === 0) return;
    sockRef.current?.emit('wb:laser', { bookingId, sid: sidRef.current, points: laserPendingRef.current.map((q) => ({ x: q.x, y: q.y })) });
    laserPendingRef.current = [];
  }

  // 확정 스트로크만 캐시에 재렌더 — 뷰 변환 반영(핫패스 아님).
  function rebuildCache() {
    const cv = canvasRef.current; if (!cv) return;
    const cache = (cacheRef.current ??= document.createElement('canvas'));
    if (cache.width !== cv.width || cache.height !== cv.height) { cache.width = cv.width; cache.height = cv.height; }
    const cctx = cache.getContext('2d'); if (!cctx) return;
    const v = viewRef.current;
    cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.globalCompositeOperation = 'source-over'; cctx.globalAlpha = 1; cctx.clearRect(0, 0, cache.width, cache.height);
    cctx.setTransform(v.scale, 0, 0, v.scale, v.tx, v.ty);
    cctx.lineCap = 'round'; cctx.lineJoin = 'round';
    for (const s of strokesRef.current) paintStroke(cctx, s);
    cctx.globalCompositeOperation = 'source-over'; cctx.globalAlpha = 1; // paintStroke 잔여 상태 초기화(다음 프레임 오염 방지)
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
    if (!bgImgRef.current) paintGuide(ctx); // 안내선·템플릿(배경 이미지 없을 때만)
    if (bgImgRef.current) {
      const img = bgImgRef.current, ir = img.width / img.height, cr = W / H;
      let dw = W, dh = H, dx = 0, dy = 0;
      if (ir > cr) { dh = W / ir; dy = (H - dh) / 2; } else { dw = H * ir; dx = (W - dw) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    const ink = (inkRef.current ??= document.createElement('canvas'));
    if (ink.width !== cv.width || ink.height !== cv.height) { ink.width = cv.width; ink.height = cv.height; }
    const ictx = ink.getContext('2d'); if (!ictx) return;
    // ⚠ ictx 는 프레임 간 재사용되는 영속 컨텍스트 — paintStroke 가 남긴 destination-out/알파가
    //    다음 프레임의 drawImage(cache) 를 오염시켜 "전체 획 사라짐→재등장" 버그를 유발한다. (b9ce125 동일 — 쌍둥이 반영)
    ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.globalCompositeOperation = 'source-over'; ictx.globalAlpha = 1; ictx.clearRect(0, 0, ink.width, ink.height);
    if (cacheRef.current) ictx.drawImage(cacheRef.current, 0, 0);
    ictx.setTransform(v.scale, 0, 0, v.scale, v.tx, v.ty);
    ictx.lineCap = 'round'; ictx.lineJoin = 'round';
    for (const s of [...liveRef.current.values(), ...(drawingRef.current ? [drawingRef.current] : [])]) paintStroke(ictx, s);
    ictx.globalCompositeOperation = 'source-over'; ictx.globalAlpha = 1; // 잔여 상태 초기화
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(ink, 0, 0);
    // 레이저 — 잉크 위에 얹고, 남아있으면 다음 프레임 자체 예약(페이드).
    const laserAlive = paintLasers(ctx, v);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (laserAlive) rafRef.current = requestAnimationFrame(drawFrame);
  }

  function requestPaint() { if (!rafRef.current) rafRef.current = requestAnimationFrame(drawFrame); }
  function redraw() { cacheDirtyRef.current = true; requestPaint(); }
  /** 뷰포트 범위 제한(scale 1~8, 팬 클램프). */
  function clampView() {
    const v = viewRef.current;
    v.scale = Math.min(8, Math.max(1, v.scale));
    v.tx = Math.min(0, Math.max(W - W * v.scale, v.tx));
    v.ty = Math.min(0, Math.max(H - H * v.scale, v.ty));
  }
  function zoomAt(cx: number, cy: number, factor: number) {
    const v = viewRef.current;
    const ns = Math.min(8, Math.max(1, v.scale * factor));
    const k = ns / v.scale;
    v.tx = cx - (cx - v.tx) * k; v.ty = cy - (cy - v.ty) * k; v.scale = ns;
    clampView(); setZoomPct(Math.round(v.scale * 100)); redraw();
  }
  function resetZoom() { viewRef.current = { scale: 1, tx: 0, ty: 0 }; setZoomPct(100); redraw(); }
  function scheduleAutosave() {
    setSaveState('dirty');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(), 1500);
  }
  function loadBg(fileId: string | null, attempt = 0) {
    bgFileIdRef.current = fileId;
    if (!fileId || typeof document === 'undefined') { bgImgRef.current = null; requestPaint(); return; }
    api.fileBlobUrl(fileId).then((url) => {
      if (bgFileIdRef.current !== fileId) return; // 그 사이 배경이 바뀜 — 폐기
      const img = new Image(); img.onload = () => { if (bgFileIdRef.current === fileId) { bgImgRef.current = img; requestPaint(); } }; img.src = url;
    }).catch(() => {
      // 공유 직후엔 상대 자동저장(스냅샷 ACL 편입, ~1.5s) 전이라 403 — 잠시 후 재시도
      if (attempt < 6 && bgFileIdRef.current === fileId) setTimeout(() => { if (bgFileIdRef.current === fileId) loadBg(fileId, attempt + 1); }, 1200);
    });
  }

  useEffect(() => {
    if (!isWeb) return;
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.style.cssText = 'width:100%;height:100%;background:#fff;touch-action:none;display:block;border-radius:8px;';
    host.appendChild(cv); canvasRef.current = cv;
    let penSeen = false;
    const rejected = (e: PointerEvent) => { if (e.pointerType === 'pen') penSeen = true; return penSeen && e.pointerType === 'touch'; };
    const cs = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { cx: ((e.clientX - r.left) / r.width) * W, cy: ((e.clientY - r.top) / r.height) * H }; };
    const pt = (e: PointerEvent): Pt => { const { cx, cy } = cs(e); const v = viewRef.current; const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : e.pressure > 0 ? e.pressure : 0.5; return { x: (cx - v.tx) / v.scale, y: (cy - v.ty) / v.scale, p }; };
    const flush = () => {
      const st = drawingRef.current;
      if (!st || pendingRef.current.length === 0) return;
      sockRef.current?.emit('wb:stroke:partial', { bookingId, sid: sidRef.current, meta: { color: st.color, width: st.width, erase: st.erase, highlight: st.highlight }, points: pendingRef.current });
      pendingRef.current = [];
    };
    const finalize = () => { const st = drawingRef.current; drawingRef.current = null; if (!st || !st.points.length) { pendingRef.current = []; return; } strokesRef.current.push(st); redraw(); setCanUndo(true); redoRef.current = []; setCanRedo(false); sockRef.current?.emit('wb:stroke', { bookingId, stroke: st, sid: sidRef.current }); pendingRef.current = []; scheduleAutosave(); };
    const beginPinch = () => { const p = [...pointersRef.current.values()]; if (p.length < 2) return; const [a, b] = p; pinchRef.current = { dist: Math.hypot(a.cx - b.cx, a.cy - b.cy) || 1, midCx: (a.cx + b.cx) / 2, midCy: (a.cy + b.cy) / 2, view: { ...viewRef.current } }; };
    const down = (e: PointerEvent) => {
      if (status !== 'ready') return; cv.setPointerCapture?.(e.pointerId);
      pointersRef.current.set(e.pointerId, cs(e));
      if (pointersRef.current.size >= 2) { finalize(); beginPinch(); return; } // 두 손가락 → 줌/팬(열람 중에도 허용)
      if (!okRef.current) return; // 세션 시간창 밖 → 필기 불가(보기 전용)
      if (rejected(e)) return;
      const p0 = pt(e);
      sidRef.current = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      if (toolRef.current === 'laser') { // 레이저 — 비영구 궤적만 방송
        laserPendingRef.current = []; laserFlushRef.current = 0; addLaser('me', p0.x, p0.y); laserPendingRef.current.push(p0); flushLaser(); requestPaint(); return;
      }
      if ((SHAPE_TOOLS as readonly string[]).includes(toolRef.current)) { // 도형 — 시작→끝 두 점
        drawingRef.current = { points: [p0, p0], color: colorRef.current, width: widthRef.current, shape: toolRef.current as Stroke['shape'] };
        pendingRef.current = []; lastFlushRef.current = 0; requestPaint(); return;
      }
      drawingRef.current = toolRef.current === 'eraser'
        ? { points: [p0], color: '#000', width: Math.max(16, widthRef.current * 4), erase: true }
        : toolRef.current === 'highlighter'
          ? { points: [p0], color: colorRef.current, width: Math.max(14, widthRef.current * 4), highlight: true }
          : { points: [p0], color: colorRef.current, width: widthRef.current };
      pendingRef.current = [p0]; lastFlushRef.current = 0; requestPaint();
    };
    const move = (e: PointerEvent) => {
      if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, cs(e));
      if (pinchRef.current && pointersRef.current.size >= 2) {
        const [a, b] = [...pointersRef.current.values()];
        const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy) || 1;
        const midCx = (a.cx + b.cx) / 2, midCy = (a.cy + b.cy) / 2, pin = pinchRef.current, v = viewRef.current;
        const k = Math.min(8, Math.max(1, (pin.view.scale * dist) / pin.dist)) / pin.view.scale;
        v.scale = pin.view.scale * k; v.tx = midCx - (pin.midCx - pin.view.tx) * k; v.ty = midCy - (pin.midCy - pin.view.ty) * k;
        clampView(); setZoomPct(Math.round(v.scale * 100)); redraw(); return;
      }
      if (toolRef.current === 'laser') {
        if (!sidRef.current || pointersRef.current.size >= 2 || !okRef.current) return;
        const q = pt(e); addLaser('me', q.x, q.y); laserPendingRef.current.push(q); requestPaint();
        const nowL = Date.now(); if (nowL - laserFlushRef.current >= 50) { laserFlushRef.current = nowL; flushLaser(); }
        return;
      }
      if (drawingRef.current?.shape) { drawingRef.current.points = [drawingRef.current.points[0], pt(e)]; requestPaint(); return; }
      if (!drawingRef.current || rejected(e)) return;
      const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const evs = coalesced.length ? coalesced : [e];
      for (const ev of evs) { const p = pt(ev); drawingRef.current.points.push(p); pendingRef.current.push(p); }
      requestPaint();
      const now = Date.now();
      if (now - lastFlushRef.current >= 50) { lastFlushRef.current = now; flush(); } // ~20fps 스트리밍
    };
    const up = (e: PointerEvent) => { pointersRef.current.delete(e.pointerId); if (pointersRef.current.size < 2) pinchRef.current = null; if (toolRef.current === 'laser') { flushLaser(); sidRef.current = ''; return; } finalize(); };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const { cx, cy } = cs(e as unknown as PointerEvent); if (e.ctrlKey || e.metaKey) zoomAt(cx, cy, e.deltaY < 0 ? 1.1 : 1 / 1.1); else { const v = viewRef.current; v.tx -= e.deltaX; v.ty -= e.deltaY; clampView(); redraw(); } };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointerleave', up);
    cv.addEventListener('wheel', onWheel, { passive: false });

    const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('mp_access') : '') ?? '';
    const s = io(window.location.origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
    sockRef.current = s;
    s.on('connect', () => s.emit('wb:join', { bookingId }, (r: { ok: boolean; strokes?: Stroke[]; backgroundFileId?: string | null; session?: SessionInfo }) => {
      if (!r?.ok) { setStatus('off'); return; }
      strokesRef.current = Array.isArray(r.strokes) ? r.strokes : []; setCanUndo(strokesRef.current.length > 0); setSession(r.session ?? null); setStatus('ready'); redraw();
      if (r.backgroundFileId) loadBg(r.backgroundFileId);
    }));
    s.on('wb:stroke:partial', ({ sid, meta, points }: { sid: string; meta: Partial<Stroke>; points: Pt[] }) => {
      let st = liveRef.current.get(sid);
      if (!st) { st = { color: meta.color ?? '#1E3550', width: meta.width ?? 4, erase: meta.erase, highlight: meta.highlight, points: [] }; liveRef.current.set(sid, st); }
      st.points.push(...points); requestPaint();
    });
    s.on('wb:stroke', ({ stroke, sid }: { stroke: Stroke; sid?: string }) => { if (sid) liveRef.current.delete(sid); strokesRef.current.push(stroke); redraw(); setCanUndo(true); });
    s.on('wb:clear', () => { strokesRef.current = []; liveRef.current.clear(); redoRef.current = []; setCanRedo(false); redraw(); setCanUndo(false); });
    s.on('wb:sync', ({ strokes }: { strokes: Stroke[] }) => { strokesRef.current = Array.isArray(strokes) ? strokes : []; liveRef.current.clear(); redraw(); setCanUndo(strokesRef.current.length > 0); });
    s.on('wb:laser', ({ sid, points }: { sid?: string; points: Array<{ x: number; y: number }> }) => { if (!Array.isArray(points)) return; const key = `peer:${sid ?? ''}`; for (const q of points) addLaser(key, q.x, q.y); requestPaint(); });
    s.on('wb:grid', ({ grid: g }: { grid: GridMode }) => { gridRef.current = g; setGrid(g); requestPaint(); });
    s.on('wb:image', ({ fileId, page, pageCount }: { fileId: string | null; page?: number; pageCount?: number }) => {
      loadBg(fileId);
      if (fileId && pageCount) setPdf({ page: page ?? 1, pageCount }); else if (!fileId) setPdf(null);
    });
    return () => { s.disconnect(); cv.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => { redraw(); }, [status]);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
  useEffect(() => () => closeCamera(), []);
  const phase = useSessionPhase(session);
  const rw = canInteract(phase); // 지금 필기(쓰기) 가능 여부 — 라이브 세션은 예약 시간대에만
  const notice = sessionNotice(phase, session);
  useEffect(() => { okRef.current = rw; }, [rw]);
  // 세션 강제 종료(폐장) 시 마지막 상태 저장 + 음성통화 자동 종료 후 열람 전용.
  useEffect(() => { if (phase === 'closed' && status === 'ready') save(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [phase]);
  useEffect(() => { if (!rw && call.inCall) call.hangup(); }, [rw, call.inCall]); // eslint-disable-line react-hooks/exhaustive-deps
  function pick(c: string) { setColor(c); colorRef.current = c; if (toolRef.current === 'eraser' || toolRef.current === 'laser') { setTool('pen'); toolRef.current = 'pen'; } }
  function pickW(w: number) { setWidth(w); widthRef.current = w; }
  function pickTool(t: Tool) { setTool(t); toolRef.current = t; }
  // 되돌리기/다시 실행 — 전체 집합 재동기화(웹과 동일 규약).
  function undo() {
    if (!rw || strokesRef.current.length === 0) return;
    redoRef.current.push(strokesRef.current[strokesRef.current.length - 1]); setCanRedo(true);
    strokesRef.current = strokesRef.current.slice(0, -1); liveRef.current.clear(); redraw(); setCanUndo(strokesRef.current.length > 0);
    sockRef.current?.emit('wb:sync', { bookingId, strokes: strokesRef.current }); scheduleAutosave();
  }
  function redo() {
    if (!rw) return;
    const st = redoRef.current.pop();
    setCanRedo(redoRef.current.length > 0);
    if (!st) return;
    strokesRef.current.push(st); redraw(); setCanUndo(true);
    sockRef.current?.emit('wb:sync', { bookingId, strokes: strokesRef.current }); scheduleAutosave();
  }
  // 필기만 지우기(배경 유지).
  function clearInk() { strokesRef.current = []; liveRef.current.clear(); redoRef.current = []; setCanRedo(false); redraw(); setCanUndo(false); sockRef.current?.emit('wb:clear', { bookingId }); scheduleAutosave(); }
  // 안내선·템플릿 순환(없음→모눈→줄→오답노트→4분면) — 상대와 동기화.
  function cycleGuide() {
    const order: GridMode[] = ['none', 'grid', 'lines', 'wrongnote', 'quad'];
    const next = order[(order.indexOf(grid) + 1) % order.length];
    gridRef.current = next; setGrid(next); requestPaint();
    sockRef.current?.emit('wb:grid', { bookingId, grid: next });
  }
  function clear() { strokesRef.current = []; setPdf(null); loadBg(null); redraw(); sockRef.current?.emit('wb:clear', { bookingId }); sockRef.current?.emit('wb:image', { bookingId, fileId: null }); scheduleAutosave(); }
  /** PDF 페이지 넘김(업로더만). */
  async function gotoPage(np: number) {
    if (!pdf?.pdfId || np < 1 || np > pdf.pageCount) return;
    try {
      const r = await api.post<{ id: string; page: number; pageCount: number }>('/files/pdf-render', { pdfId: pdf.pdfId, page: np });
      setPdf({ pdfId: pdf.pdfId, page: r.page, pageCount: r.pageCount });
      loadBg(r.id); resetZoom();
      sockRef.current?.emit('wb:image', { bookingId, fileId: r.id, page: r.page, pageCount: r.pageCount });
      scheduleAutosave();
    } catch { /* noop */ }
  }
  function save() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setSaveState('saving');
    sockRef.current?.emit('wb:save', { bookingId, strokes: strokesRef.current, backgroundFileId: bgFileIdRef.current }, () => setSaveState('saved'));
  }
  async function useAsBackground(blob: Blob, name: string) {
    setPdf(null);
    try { const r = await api.uploadWeb(blob as unknown as File, name); loadBg(r.id); sockRef.current?.emit('wb:image', { bookingId, fileId: r.id }); scheduleAutosave(); } catch { /* noop */ }
  }
  function attachImage() {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/pdf,image/*';
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return;
      try {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          // PDF → 서버에서 첫 페이지 PNG 로 렌더(공유 배경은 항상 PNG)
          const r = (await api.uploadWeb(f, f.name, '/files/pdf-page')) as unknown as { id: string; pdfId: string; page: number; pageCount: number };
          setPdf({ pdfId: r.pdfId, page: r.page, pageCount: r.pageCount });
          loadBg(r.id); resetZoom();
          sockRef.current?.emit('wb:image', { bookingId, fileId: r.id, page: r.page, pageCount: r.pageCount });
          scheduleAutosave();
        } else if (f.type.startsWith('image/')) { await useAsBackground(f, f.name); }
      } catch { /* 실패 시 무시 */ }
    };
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
      const shot = btn('📸 촬영(무음)', '#2F6FB3'); shot.onclick = () => capture(v);
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
    <View style={embedded ? styles.embWrap : styles.overlay}>
      <View style={[styles.sheet, embedded && styles.embSheet]}>
        <View style={styles.head}>
          <Text style={styles.headT}>🖊 {title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* 음성 통화는 화상(zoom) 예약에서만 노출(O89) */}
            {status !== 'off' && call.supported && session?.mode === 'zoom' && (call.inCall
              ? <>
                  <TouchableOpacity onPress={call.toggleMute}><Text style={{ fontSize: 18 }}>{call.muted ? '🔇' : '🎙'}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={call.hangup}><Text style={{ color: '#E5484D', fontWeight: '800', fontSize: 13 }}>종료</Text></TouchableOpacity>
                </>
              : rw ? <TouchableOpacity onPress={call.start}><Text style={{ fontSize: 18 }}>📞</Text></TouchableOpacity> : null)}
            {!embedded && <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.close}>✕</Text></TouchableOpacity>}
          </View>
        </View>
        {status === 'off' ? (
          <Text style={styles.hint}>{isWeb ? '화이트보드는 프리미엄 상품에서 제공됩니다.' : '화이트보드는 웹에서 지원됩니다.'}</Text>
        ) : (
          <>
            {!rw && (
              <View style={[styles.notice, phase === 'closed' && { backgroundColor: C.lineSoft }]}>
                <Text style={styles.noticeT}>{phase === 'closed' ? '🔒 ' : '⏳ '}{notice} 필기는 예약 시간대에만 가능하고 지금은 열람만 됩니다.</Text>
              </View>
            )}
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
              <TouchableOpacity onPress={() => pickTool('highlighter')} style={[styles.wbtn, { width: 40 }, tool === 'highlighter' && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>🖍</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => pickTool('eraser')} style={[styles.wbtn, { width: 40 }, tool === 'eraser' && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>🧽</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => pickTool('laser')} style={[styles.wbtn, { width: 40 }, tool === 'laser' && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>🔦</Text></TouchableOpacity>
              {(([['line', '╱'], ['arrow', '↗'], ['rect', '▭'], ['ellipse', '◯']]) as Array<[Tool, string]>).map(([t, icon]) => (
                <TouchableOpacity key={t} onPress={() => pickTool(t)} style={[styles.wbtn, { width: 34 }, tool === t && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>{icon}</Text></TouchableOpacity>
              ))}
              <TouchableOpacity onPress={cycleGuide} style={[styles.wbtn, { width: 34 }, grid !== 'none' && { borderColor: C.teal, borderWidth: 2 }]}><Text style={styles.wtxt}>{grid === 'lines' ? '▤' : grid === 'wrongnote' ? '📋' : grid === 'quad' ? '➕' : '⊞'}</Text></TouchableOpacity>
              <TouchableOpacity disabled={!rw} onPress={attachImage} style={[styles.wbtn, { width: 40, opacity: rw ? 1 : 0.4 }]}><Text style={styles.wtxt}>🖼</Text></TouchableOpacity>
              <TouchableOpacity disabled={!rw} onPress={openCamera} style={[styles.wbtn, { width: 40, opacity: rw ? 1 : 0.4 }]}><Text style={styles.wtxt}>📷</Text></TouchableOpacity>
              {/* 줌: 배경+필기 함께 확대/축소 (두 손가락 핀치도 가능) */}
              <TouchableOpacity onPress={() => zoomAt(W / 2, H / 2, 1 / 1.25)} style={[styles.wbtn, { width: 34 }]}><Text style={styles.wtxt}>−</Text></TouchableOpacity>
              <TouchableOpacity onPress={resetZoom} style={[styles.wbtn, { width: 48 }]}><Text style={styles.wtxt}>{zoomPct}%</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => zoomAt(W / 2, H / 2, 1.25)} style={[styles.wbtn, { width: 34 }]}><Text style={styles.wtxt}>＋</Text></TouchableOpacity>
              {pdf && pdf.pageCount > 1 && (<>
                <TouchableOpacity disabled={!pdf.pdfId || pdf.page <= 1} onPress={() => gotoPage(pdf.page - 1)} style={[styles.wbtn, { width: 30, opacity: !pdf.pdfId || pdf.page <= 1 ? 0.4 : 1 }]}><Text style={styles.wtxt}>◀</Text></TouchableOpacity>
                <View style={[styles.wbtn, { width: 44 }]}><Text style={styles.wtxt}>{pdf.page}/{pdf.pageCount}</Text></View>
                <TouchableOpacity disabled={!pdf.pdfId || pdf.page >= pdf.pageCount} onPress={() => gotoPage(pdf.page + 1)} style={[styles.wbtn, { width: 30, opacity: !pdf.pdfId || pdf.page >= pdf.pageCount ? 0.4 : 1 }]}><Text style={styles.wtxt}>▶</Text></TouchableOpacity>
              </>)}
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 10, color: C.muted, marginRight: 4 }}>{saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '자동저장 ✓' : saveState === 'dirty' ? '변경됨' : ''}</Text>
              <TouchableOpacity disabled={!rw || !canUndo} onPress={undo} style={[styles.wbtn, { width: 34 }, (!rw || !canUndo) && { opacity: 0.4 }]}><Text style={styles.wtxt}>↶</Text></TouchableOpacity>
              <TouchableOpacity disabled={!rw || !canRedo} onPress={redo} style={[styles.wbtn, { width: 34 }, (!rw || !canRedo) && { opacity: 0.4 }]}><Text style={styles.wtxt}>↷</Text></TouchableOpacity>
              <TouchableOpacity disabled={!rw} onPress={clearInk} style={[styles.act, !rw && { opacity: 0.4 }]}><Text style={styles.actT}>필기 지우기</Text></TouchableOpacity>
              <TouchableOpacity disabled={!rw} onPress={clear} style={[styles.act, !rw && { opacity: 0.4 }]}><Text style={styles.actT}>전체</Text></TouchableOpacity>
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
