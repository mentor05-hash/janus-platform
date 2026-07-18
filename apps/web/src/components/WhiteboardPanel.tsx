import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useMediaSession } from '@mentoring/media-kit';
import { api } from '../api/client';
import { track } from '../utils/track';
import { useVoiceCall } from '../utils/voiceCall';
import { useSessionPhase, canInteract, sessionNotice, type SessionInfo } from '../utils/session';

/** O79 M1 — 상담 미디어 스택 플래그: 'livekit' 이면 미디어킷(음성+화상), 아니면 기존 P2P 폴백(무변경). */
const LK_ON = ((import.meta.env as Record<string, string | undefined>).VITE_MEDIA_CONSULT ?? '') === 'livekit';

type Pt = { x: number; y: number; p?: number }; // p=필압(0~1)
type Stroke = { points: Pt[]; color: string; width: number; erase?: boolean; highlight?: boolean };
const COLORS = ['#1E3550', '#2F6FB3', '#E5484D', '#2A8A5F', '#CF9A3A'];
const W = 900, H = 620; // 논리 좌표(비율 유지 스케일링)

/** 예약 기반 공유 화이트보드(웹). 배경 이미지(첨부/촬영) 위에 필기 + 음성통화 동시. */
export function WhiteboardPanel({ bookingId, title, onClose }: { bookingId: string; title?: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement | null>(null); // 잉크 작업 레이어(지우개가 배경을 안 뚫게)
  const cacheRef = useRef<HTMLCanvasElement | null>(null); // 확정 스트로크 캐시(핫패스에서 O(1) 복원)
  const rafRef = useRef(0); // rAF 코얼레싱 핸들
  const cacheDirtyRef = useRef(true); // 확정 집합/뷰 변경 시 캐시 재빌드 필요
  const sockRef = useRef<Socket | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  // 라이브 잉크: 상대가 그리는 중인 획(sid별) + 내 획 스트리밍 상태
  const liveRef = useRef<Map<string, Stroke>>(new Map());
  const sidRef = useRef('');
  const pendingRef = useRef<Pt[]>([]); // 아직 전송 안 한 포인트
  const lastFlushRef = useRef(0);
  // 뷰포트(줌/팬) — 배경+필기를 함께 확대/축소. 필기 데이터는 논리좌표 유지(공유·저장 불변).
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const pointersRef = useRef(new Map<number, { cx: number; cy: number }>()); // 활성 포인터(캔버스 좌표)
  const pinchRef = useRef<{ dist: number; midCx: number; midCy: number; view: { scale: number; tx: number; ty: number } } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  // PDF 배경 페이지 넘김 컨텍스트. pdfId 가 있으면 이 클라이언트가 업로더(넘김 가능), 없으면 상대(표시만).
  const [pdf, setPdf] = useState<{ pdfId?: string; page: number; pageCount: number } | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgFileIdRef = useRef<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'highlighter'>('pen');
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [camOn, setCamOn] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penSeenRef = useRef(false); // 펜(스타일러스) 입력을 본 적 있으면 손가락(터치)은 무시(팜리젝션)
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const call = useVoiceCall(() => sockRef.current, bookingId); // 기존 P2P(폴백 — LK_ON 이면 미사용)
  // 미디어킷(LiveKit) — 음성+화상. 토큰은 M-계약 M1(/media/token, 예약·시간창 서버 게이팅).
  const lk = useMediaSession({
    getToken: async () => {
      const r = await api.post<{ url: string | null; token: string | null }>('/media/token', { context: 'consult', refId: bookingId });
      return r.url && r.token ? { url: r.url, token: r.token } : null;
    },
    video: true,
    onEvent: (ev, meta) => track('consult_media', 'view', undefined, { ev, stack: 'livekit', bookingId, ...meta }),
  });
  const phase = useSessionPhase(session);
  const rw = canInteract(phase); // 지금 필기·음성 가능 여부 — 라이브 세션은 예약 시간대에만
  const notice = sessionNotice(phase, session);
  // 세션 창이 닫히면(강제 종료) 진행 중 음성통화도 자동 종료.
  useEffect(() => { if (!rw && call.inCall) call.hangup(); }, [rw, call.inCall]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!rw && lk.status !== 'idle') void lk.leave(); }, [rw, lk.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // 한 획을 잉크 컨텍스트에 렌더(변환은 호출측 적용). 지우개(destination-out)·형광펜(반투명)·필압.
  function paintStroke(ictx: CanvasRenderingContext2D, s: Stroke) {
    if (s.points.length < 1) return;
    ictx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ictx.globalAlpha = s.highlight ? 0.32 : 1;
    ictx.strokeStyle = s.color;
    if (s.erase || s.highlight || s.points.length === 1 || s.points.every((q) => q.p == null)) {
      ictx.lineWidth = s.width;
      ictx.beginPath(); ictx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points.slice(1)) ictx.lineTo(p.x, p.y);
      if (s.points.length === 1) ictx.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1);
      ictx.stroke();
    } else {
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1], b = s.points[i];
        ictx.lineWidth = s.width * (0.35 + ((b.p ?? 0.5)) * 1.3);
        ictx.beginPath(); ictx.moveTo(a.x, a.y); ictx.lineTo(b.x, b.y); ictx.stroke();
      }
    }
  }

  // 확정 스트로크만 캐시에 재렌더 — 뷰 변환 반영. 확정 집합/뷰 변경 시에만(핫패스 아님).
  function rebuildCache() {
    const cv = canvasRef.current; if (!cv) return;
    const cache = (cacheRef.current ??= document.createElement('canvas'));
    if (cache.width !== cv.width || cache.height !== cv.height) { cache.width = cv.width; cache.height = cv.height; }
    const cctx = cache.getContext('2d'); if (!cctx) return;
    const v = viewRef.current;
    cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.clearRect(0, 0, cache.width, cache.height);
    cctx.setTransform(v.scale, 0, 0, v.scale, v.tx, v.ty);
    cctx.lineCap = 'round'; cctx.lineJoin = 'round';
    for (const s of strokesRef.current) paintStroke(cctx, s);
  }

  // 한 프레임 합성: 배경 + (확정 캐시 복사 + 라이브/진행 획). 확정 획 수와 무관하게 O(1) 복원.
  // 진행/라이브 획이 지우개면 캐시 "복사본"만 지워 정합 유지(원 캐시는 확정 시 갱신).
  function drawFrame() {
    rafRef.current = 0;
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    if (cacheDirtyRef.current || !cacheRef.current) { rebuildCache(); cacheDirtyRef.current = false; }
    const v = viewRef.current;
    // 배경(이미지/PDF) — 뷰 변환, 비율 유지 contain
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(v.scale, 0, 0, v.scale, v.tx, v.ty);
    if (bgImgRef.current) {
      const img = bgImgRef.current; const ir = img.width / img.height, cr = W / H;
      let dw = W, dh = H, dx = 0, dy = 0;
      if (ir > cr) { dh = W / ir; dy = (H - dh) / 2; } else { dw = H * ir; dx = (W - dw) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    // 작업 잉크 = 확정 캐시 복사(O(1)) + 라이브 + 진행 획
    const ink = (inkRef.current ??= document.createElement('canvas'));
    if (ink.width !== cv.width || ink.height !== cv.height) { ink.width = cv.width; ink.height = cv.height; }
    const ictx = ink.getContext('2d'); if (!ictx) return;
    ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.clearRect(0, 0, ink.width, ink.height);
    if (cacheRef.current) ictx.drawImage(cacheRef.current, 0, 0);
    ictx.setTransform(v.scale, 0, 0, v.scale, v.tx, v.ty);
    ictx.lineCap = 'round'; ictx.lineJoin = 'round';
    for (const s of [...liveRef.current.values(), ...(drawingRef.current ? [drawingRef.current] : [])]) paintStroke(ictx, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(ink, 0, 0); // 배경 위에 잉크 레이어 합성
  }

  // rAF 코얼레싱: pointermove 가 몰려도 프레임당 최대 1회 합성.
  function requestPaint() { if (!rafRef.current) rafRef.current = requestAnimationFrame(drawFrame); }
  // 확정 집합/뷰 변경 → 캐시 재빌드 표시 후 재합성(둘 다 코얼레싱).
  function redraw() { cacheDirtyRef.current = true; requestPaint(); }

  function loadBg(fileId: string | null) {
    bgFileIdRef.current = fileId;
    if (!fileId) { bgImgRef.current = null; requestPaint(); return; }
    api.fileBlobUrl(fileId).then((url) => {
      const img = new Image();
      img.onload = () => { bgImgRef.current = img; requestPaint(); };
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
      s.emit('wb:join', { bookingId }, (r: { ok: boolean; strokes?: Stroke[]; backgroundFileId?: string | null; session?: SessionInfo }) => {
        if (!r?.ok) { setStatus('off'); return; }
        strokesRef.current = Array.isArray(r.strokes) ? r.strokes : [];
        setSession(r.session ?? null);
        setStatus('ready'); redraw();
        if (r.backgroundFileId) loadBg(r.backgroundFileId);
      });
    });
    // 라이브 잉크: 상대가 그리는 중인 부분 획을 실시간 반영
    s.on('wb:stroke:partial', ({ sid, meta, points }: { sid: string; meta: Partial<Stroke>; points: Pt[] }) => {
      let st = liveRef.current.get(sid);
      if (!st) { st = { color: meta.color ?? '#1E3550', width: meta.width ?? 3, erase: meta.erase, highlight: meta.highlight, points: [] }; liveRef.current.set(sid, st); }
      st.points.push(...points); requestPaint();
    });
    s.on('wb:stroke', ({ stroke, sid }: { stroke: Stroke; sid?: string }) => { if (sid) liveRef.current.delete(sid); strokesRef.current.push(stroke); redraw(); });
    s.on('wb:clear', () => { strokesRef.current = []; liveRef.current.clear(); redraw(); });
    s.on('wb:image', ({ fileId, page, pageCount }: { fileId: string | null; page?: number; pageCount?: number }) => {
      loadBg(fileId);
      if (fileId && pageCount) setPdf({ page: page ?? 1, pageCount }); else if (!fileId) setPdf(null);
    });
    return () => { s.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // 데스크톱: Ctrl/⌘+휠 = 커서 기준 확대/축소, 휠/트랙패드 = 팬(트랙패드 핀치는 ctrlKey 로 들어옴).
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const cx = ((e.clientX - r.left) / r.width) * W;
      const cy = ((e.clientY - r.top) / r.height) * H;
      if (e.ctrlKey || e.metaKey) { zoomAt(cx, cy, e.deltaY < 0 ? 1.1 : 1 / 1.1); }
      else { const v = viewRef.current; v.tx -= e.deltaX; v.ty -= e.deltaY; clampView(); redraw(); }
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 세션 강제 종료(폐장) 시 진행 중 획을 확정·저장하고 이후엔 열람 전용.
  useEffect(() => {
    if (phase === 'closed' && status === 'ready') { finalizeStroke(); save(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /** 클라이언트 좌표 → 캔버스(장치) 좌표. */
  function canvasSpace(e: { clientX: number; clientY: number }): { cx: number; cy: number } {
    const cv = canvasRef.current!; const r = cv.getBoundingClientRect();
    return { cx: ((e.clientX - r.left) / r.width) * W, cy: ((e.clientY - r.top) / r.height) * H };
  }
  /** 포인터 → 논리(월드) 좌표. 줌/팬 역변환 적용 → 확대 상태에서도 필기 위치 정확. */
  // 네이티브/합성 이벤트 모두 허용(getCoalescedEvents 로 초고속 획 중간점 복원).
  function pt(e: { clientX: number; clientY: number; pointerType: string; pressure: number }): Pt {
    const { cx, cy } = canvasSpace(e);
    const v = viewRef.current;
    const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : e.pressure > 0 ? e.pressure : 0.5;
    return { x: (cx - v.tx) / v.scale, y: (cy - v.ty) / v.scale, p };
  }
  /** 뷰포트 범위 제한 — scale 1~8, 축소 시 여백 없이 보드가 화면을 채우도록 팬 클램프. */
  function clampView() {
    const v = viewRef.current;
    v.scale = Math.min(8, Math.max(1, v.scale));
    v.tx = Math.min(0, Math.max(W - W * v.scale, v.tx));
    v.ty = Math.min(0, Math.max(H - H * v.scale, v.ty));
  }
  /** (cx,cy) 캔버스 좌표를 중심으로 factor 배 확대/축소. */
  function zoomAt(cx: number, cy: number, factor: number) {
    const v = viewRef.current;
    const ns = Math.min(8, Math.max(1, v.scale * factor));
    const k = ns / v.scale;
    v.tx = cx - (cx - v.tx) * k;
    v.ty = cy - (cy - v.ty) * k;
    v.scale = ns;
    clampView(); setZoomPct(Math.round(v.scale * 100)); redraw();
  }
  function resetZoom() { viewRef.current = { scale: 1, tx: 0, ty: 0 }; setZoomPct(100); redraw(); }
  /** 현재 획을 확정(최종 전송·저장). 진행 중이 아니면 무동작. */
  function finalizeStroke() {
    const st = drawingRef.current; drawingRef.current = null;
    if (!st || st.points.length === 0) { pendingRef.current = []; return; }
    strokesRef.current.push(st); redraw();
    sockRef.current?.emit('wb:stroke', { bookingId, stroke: st, sid: sidRef.current });
    pendingRef.current = [];
    scheduleAutosave();
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
  /** 두 손가락 핀치 시작 스냅샷(거리·중점·현재 뷰). */
  function beginPinch() {
    const p = [...pointersRef.current.values()]; if (p.length < 2) return;
    const [a, b] = p;
    pinchRef.current = { dist: Math.hypot(a.cx - b.cx, a.cy - b.cy) || 1, midCx: (a.cx + b.cx) / 2, midCy: (a.cy + b.cy) / 2, view: { ...viewRef.current } };
  }
  function down(e: React.PointerEvent) {
    if (status !== 'ready') return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, canvasSpace(e));
    if (pointersRef.current.size >= 2) { finalizeStroke(); beginPinch(); return; } // 두 손가락 → 줌/팬(열람 중에도 허용)
    if (!rw) return; // 세션 시간창 밖 → 필기 불가(보기 전용)
    if (rejected(e)) return; // 팜리젝션(펜 사용 중 손가락 무시)
    const p0 = pt(e);
    drawingRef.current = tool === 'eraser'
      ? { points: [p0], color: '#000', width: Math.max(16, width * 4), erase: true }
      : tool === 'highlighter'
        ? { points: [p0], color, width: Math.max(14, width * 4), highlight: true }
        : { points: [p0], color, width };
    sidRef.current = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    pendingRef.current = [p0];
    lastFlushRef.current = 0;
    requestPaint();
  }
  function move(e: React.PointerEvent) {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, canvasSpace(e));
    // 핀치(줌+팬): 두 포인터 거리비로 확대, 중점 이동으로 팬
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy) || 1;
      const midCx = (a.cx + b.cx) / 2, midCy = (a.cy + b.cy) / 2;
      const pin = pinchRef.current;
      const v = viewRef.current;
      const k = Math.min(8, Math.max(1, (pin.view.scale * dist) / pin.dist)) / pin.view.scale;
      v.scale = pin.view.scale * k;
      v.tx = midCx - (pin.midCx - pin.view.tx) * k;
      v.ty = midCy - (pin.midCy - pin.view.ty) * k;
      clampView(); setZoomPct(Math.round(v.scale * 100)); redraw();
      return;
    }
    if (!drawingRef.current || rejected(e)) return;
    // 초고속 획: 브라우저가 합친 pointermove 중간점을 복원 → 매끄러운 곡선.
    const ne = e.nativeEvent;
    const coalesced = typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [];
    const evs = coalesced.length ? coalesced : [ne];
    for (const ev of evs) { const p = pt(ev); drawingRef.current.points.push(p); pendingRef.current.push(p); }
    requestPaint();
    const now = Date.now();
    if (now - lastFlushRef.current >= 50) { lastFlushRef.current = now; flushPartial(); } // ~20fps 스트리밍
  }
  function up(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    finalizeStroke(); // 진행 중 획이 있으면 확정(핀치 진입 시엔 이미 null → 무동작)
  }
  function clear() { strokesRef.current = []; setPdf(null); loadBg(null); redraw(); sockRef.current?.emit('wb:clear', { bookingId }); sockRef.current?.emit('wb:image', { bookingId, fileId: null }); scheduleAutosave(); }
  function save() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setSaveState('saving');
    sockRef.current?.emit('wb:save', { bookingId, strokes: strokesRef.current, backgroundFileId: bgFileIdRef.current }, () => setSaveState('saved'));
  }

  /** PDF 페이지 넘김(업로더만) — 저장된 pdfId 의 새 페이지를 렌더·공유. */
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
  async function useAsBackground(blob: Blob, name: string) {
    setPdf(null);
    const form = new FormData(); form.append('file', blob, name);
    const r = await api.upload<{ id: string }>('/files', form);
    loadBg(r.id);
    sockRef.current?.emit('wb:image', { bookingId, fileId: r.id });
    scheduleAutosave();
  }
  async function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        // PDF → 서버에서 첫 페이지 PNG 로 렌더(공유 배경은 항상 PNG → 웹·모바일 호환)
        const form = new FormData(); form.append('file', f, f.name);
        const r = await api.upload<{ id: string; pdfId: string; page: number; pageCount: number }>('/files/pdf-page', form);
        setPdf({ pdfId: r.pdfId, page: r.page, pageCount: r.pageCount });
        loadBg(r.id); resetZoom();
        sockRef.current?.emit('wb:image', { bookingId, fileId: r.id, page: r.page, pageCount: r.pageCount });
        scheduleAutosave();
      } else if (f.type.startsWith('image/')) {
        await useAsBackground(f, f.name);
      }
    } catch { alert('배경 불러오기에 실패했어요. 다른 파일을 시도해 주세요.'); }
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
            {status !== 'off' && (LK_ON
              ? (lk.status !== 'idle'
                ? <>
                    <span style={{ fontSize: 12, color: lk.status === 'connected' ? 'var(--chip-done)' : lk.status === 'reconnecting' ? 'var(--chip-confirmed, #d97706)' : 'var(--muted)' }}>
                      📹 {lk.status === 'connected' ? '통화 중' : lk.status === 'reconnecting' ? '재연결 중…' : '연결 중…'}
                    </span>
                    <button className="btn ghost sm" onClick={() => void lk.toggleCam()}>{lk.camOn ? '📷 켜짐' : '📷 끔'}</button>
                    <button className="btn ghost sm" onClick={() => void lk.toggleMic()}>{lk.micOn ? '🎙 켜짐' : '🔇 음소거'}</button>
                    <button className="btn danger sm" onClick={() => void lk.leave()}>통화 종료</button>
                  </>
                : <button className="btn ghost sm" disabled={!rw} onClick={() => void lk.join()} title={rw ? '화상통화' : '상담 시간대에만 통화할 수 있어요'}>📹 화상통화</button>)
              : (call.inCall
                ? <>
                    <span style={{ fontSize: 12, color: call.status === 'connected' ? 'var(--chip-done)' : call.status === 'reconnecting' ? 'var(--chip-confirmed, #d97706)' : 'var(--muted)' }}>
                      🎧 {call.status === 'connected' ? '통화 중' : call.status === 'reconnecting' ? '재연결 중…' : '연결 중…'}
                    </span>
                    {call.status === 'reconnecting' && <button className="btn sm" onClick={() => void call.reconnect()}>🔄 재연결</button>}
                    <button className="btn ghost sm" onClick={call.toggleMute}>{call.muted ? '🔇 음소거' : '🎙 켜짐'}</button>
                    <button className="btn danger sm" onClick={call.hangup}>통화 종료</button>
                  </>
                : <button className="btn ghost sm" disabled={!rw} onClick={call.start} title={rw ? '음성통화' : '상담 시간대에만 통화할 수 있어요'}>📞 음성통화</button>))}
            <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
          </div>
        </div>
        {status === 'off' ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>화이트보드는 프리미엄 상품에서 제공됩니다.</p>
        ) : (
          <>
            {!rw && (
              <div style={{ padding: '8px 14px', background: phase === 'closed' ? 'var(--line-soft,#eef2f7)' : 'var(--teal-50,#E8F0F9)', color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span>{phase === 'closed' ? '🔒' : '⏳'}</span><span>{notice} 필기는 예약 시간대에만 가능하고, 지금은 열람만 됩니다.</span>
              </div>
            )}
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
              <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={onAttach} />
              <button className="btn ghost sm" disabled={!rw} onClick={() => fileRef.current?.click()}>🖼 이미지·PDF</button>
              <button className="btn ghost sm" disabled={!rw} onClick={openCamera}>📷 촬영</button>
              <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
              {/* 줌: 배경+필기 함께 확대/축소 (두 손가락 핀치·Ctrl+휠도 가능) */}
              <button className="btn ghost sm" title="축소" onClick={() => zoomAt(W / 2, H / 2, 1 / 1.25)}>🔍−</button>
              <button className="btn ghost sm" title="원본 크기" onClick={resetZoom} style={{ minWidth: 52, fontVariantNumeric: 'tabular-nums' }}>{zoomPct}%</button>
              <button className="btn ghost sm" title="확대" onClick={() => zoomAt(W / 2, H / 2, 1.25)}>🔍＋</button>
              {pdf && pdf.pageCount > 1 && (
                <>
                  <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
                  <button className="btn ghost sm" title="이전 페이지" disabled={!pdf.pdfId || pdf.page <= 1} onClick={() => gotoPage(pdf.page - 1)}>◀</button>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', minWidth: 42, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{pdf.page}/{pdf.pageCount}</span>
                  <button className="btn ghost sm" title="다음 페이지" disabled={!pdf.pdfId || pdf.page >= pdf.pageCount} onClick={() => gotoPage(pdf.page + 1)}>▶</button>
                </>
              )}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '자동 저장됨 ✓' : saveState === 'dirty' ? '변경됨' : ''}</span>
              <button className="btn ghost sm" disabled={!rw} onClick={clear}>전체 지우기</button>
              <button className="btn sm" disabled={!rw} onClick={save}>저장</button>
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
        {/* 화상 PIP(미디어킷) — 보드 위 우상단 오버레이. 상대 화상은 크게, 내 화상은 그 아래 썸네일. */}
        {LK_ON && lk.status !== 'idle' && (
          <div style={{ position: 'absolute', top: 60, right: 14, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
            <video ref={lk.remoteVideoRef} autoPlay playsInline style={{ width: 168, aspectRatio: '4 / 3', borderRadius: 10, background: '#111', objectFit: 'cover', boxShadow: '0 2px 10px rgba(0,0,0,.28)', display: lk.remoteCamOn ? 'block' : 'none' }} />
            {!lk.remoteCamOn && <div style={{ width: 168, aspectRatio: '4 / 3', borderRadius: 10, background: '#1b2430', color: '#9fb0c2', display: 'grid', placeItems: 'center', fontSize: 12 }}>상대 화상 꺼짐</div>}
            <video ref={lk.localVideoRef} autoPlay playsInline muted style={{ width: 108, aspectRatio: '4 / 3', borderRadius: 8, background: '#111', objectFit: 'cover', alignSelf: 'flex-end', boxShadow: '0 1px 6px rgba(0,0,0,.28)', display: lk.camOn ? 'block' : 'none' }} />
          </div>
        )}
      </div>
    </div>
  );
}
