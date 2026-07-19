// ⚠ 쌍둥이 구현 4파일: WhiteboardPanel.tsx(웹 예약) + mobile WhiteboardScreen/RoomWhiteboardScreen 과
//   캔버스 합성·입력 로직이 병행 유지된다(Session*Panel 이 VITE_REALTIME_ROOMS 로 택1).
//   지우개(합성 상태 초기화)·정렬·IME(isComposing)·통화 UI 등 공통 수정은 **반드시 4파일 전수 반영**할 것.
//   (전례 2회: 정렬·IME 수정, 지우개 destination-out 누수 수정(b9ce125)이 룸 쪽에만 들어가 예약 경로에서 재발 — O79/O81 회귀.
//    근본 해소는 공용 컴포넌트 추출 백로그)
import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { paintStroke, paintGuide as renderGuide, paintLasers as renderLasers, addLaser as pushLaser, SHAPE_TOOLS, type Pt, type Stroke, type GridMode } from '@mentoring/board-core';
import { useRoomVoiceCall } from '../utils/roomVoiceCall';
import { useSessionPhase, canInteract, sessionNotice, type SessionInfo } from '../utils/session';
import type { RoomSession } from './RoomChatPanel';
import { LectureAudioBar } from './LectureAudioBar';

const COLORS = ['#1E3550', '#2F6FB3', '#E5484D', '#2A8A5F', '#CF9A3A'];
const W = 900, H = 620;

/** 룸 서비스 기반 공유 화이트보드(이관 경로). 이미지 배경 + 필기 + 음성. PDF 배경은 이음새로 보류. */
export function RoomWhiteboardPanel({ title, onClose, session: rs, media, mediaPublish }: { bookingId: string; title?: string; onClose: () => void; session: RoomSession; media?: { provider: string; url: string | null; token: string | null; note?: string } | null; mediaPublish?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement | null>(null); // 잉크 전용 오프스크린(지우개가 배경을 안 뚫게)
  const sockRef = useRef<Socket | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const liveRef = useRef<Map<string, Stroke>>(new Map());
  // 레이저 궤적(비영구) — 참가자별 최근 점(월드 좌표 + 타임스탬프). 오래된 점은 페이드 후 제거.
  const laserRef = useRef<Map<string, { pts: Array<{ x: number; y: number; t: number }>; color: string }>>(new Map());
  const laserFlushRef = useRef(0);
  const laserPendingRef = useRef<Pt[]>([]); // 전송 대기 레이저 점(50ms 배치)
  const sidRef = useRef('');
  const pendingRef = useRef<Pt[]>([]);
  const lastFlushRef = useRef(0);
  const cacheRef = useRef<HTMLCanvasElement | null>(null); // 확정 스트로크 캐시(핫패스 O(1) 복원)
  const rafRef = useRef(0); // rAF 코얼레싱 핸들
  const cacheDirtyRef = useRef(true); // 확정 집합/뷰 변경 시 캐시 재빌드 필요
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const pointersRef = useRef(new Map<number, { cx: number; cy: number }>());
  const pinchRef = useRef<{ dist: number; midCx: number; midCy: number; view: { scale: number; tx: number; ty: number } } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgUrlRef = useRef<string | null>(null); // 현재 배경 fileUrl(룸 서비스)
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'highlighter' | 'laser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text'>('pen');
  const [canUndo, setCanUndo] = useState(false); // 되돌리기 가능(확정 스트로크 존재) — 버튼 활성화용
  const [canRedo, setCanRedo] = useState(false);
  const redoRef = useRef<Stroke[]>([]); // 되돌린 획(다시 실행용) — 새 획 확정 시 비움
  const [grid, setGrid] = useState<GridMode>('none'); // 배경 안내선(모눈/줄) — 상대와 동기화
  const gridRef = useRef<GridMode>('none');
  const [wide, setWide] = useState(false); // 전체화면(넓게 보기)
  const [pop, setPop] = useState<'pen' | 'shape' | 'clear' | 'bg' | null>(null); // 툴바 팝오버(W-U1 — 1줄화)
  const [archState, setArchState] = useState<'idle' | 'busy' | 'done'>('idle'); // 보드→채팅 기록 상태
  const [textBox, setTextBox] = useState<{ x: number; y: number; value: string } | null>(null); // 텍스트 입력 오버레이(논리좌표)
  // 강의(1:다) 모드: 서버가 wb:join 으로 role·mode·roster 를 알려준다. viewer=학생(열람 전용).
  const [mode, setMode] = useState<'session' | 'lecture'>('session');
  const [role, setRole] = useState<string>('viewer');
  const [roster, setRoster] = useState<Array<{ participantId: string; name?: string; role?: string }>>([]);
  const [raised, setRaised] = useState<Map<string, string | undefined>>(new Map()); // 손든 참가자(host 화면)
  const [handUp, setHandUp] = useState(false); // 내 손들기 상태(학생)
  const isViewer = mode === 'lecture' && role !== 'host' && role !== 'presenter';
  const isHost = mode === 'lecture' && role === 'host';
  // 내 룸 참가자 id(토큰에서 디코드) — lecture:role 이 나를 가리키는지 판단.
  const myPid = useMemo(() => { try { return JSON.parse(atob(rs.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).participantId as string; } catch { return ''; } }, [rs.token]);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'off'>('connecting');
  const [connErr, setConnErr] = useState<string | null>(null); // 소켓 연결/인증 실패 사유(무한 "연결 중" 방지)
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [live, setLive] = useState<SessionInfo>(rs.session);
  const [camOn, setCamOn] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penSeenRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const call = useRoomVoiceCall(() => sockRef.current);
  const phase = useSessionPhase(live);
  const rw = canInteract(phase);
  const notice = sessionNotice(phase, live);
  useEffect(() => { if (!rw && call.inCall) call.hangup(); }, [rw, call.inCall]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // 단축키: ⌘/Ctrl+Z 되돌리기 · ⌘/Ctrl+Shift+Z 다시 실행 (입력 필드 포커스 중엔 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (textBox) { setTextBox(null); return; } if (wide) { setWide(false); return; } } // 입력·넓게보기 탈출
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });


  // 안내선·템플릿 — 렌더는 board-core 단일 소스.
  function paintGuide(ctx: CanvasRenderingContext2D) { renderGuide(ctx, gridRef.current, W, H); }

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
    // 안내선·템플릿(모눈/줄/오답노트/4분면) — 배경 이미지가 없을 때만, 필기 아래에 렌더.
    if (!bgImgRef.current) paintGuide(ctx);
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
    //    다음 프레임의 drawImage(cache) 를 오염시켜 "전체 획 사라짐→재등장" 버그를 유발한다.
    //    캐시 복사 전에 합성 상태를 반드시 기본값으로 되돌린다.
    ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.globalCompositeOperation = 'source-over'; ictx.globalAlpha = 1; ictx.clearRect(0, 0, ink.width, ink.height);
    if (cacheRef.current) ictx.drawImage(cacheRef.current, 0, 0);
    ictx.setTransform(v.scale, 0, 0, v.scale, v.tx, v.ty);
    ictx.lineCap = 'round'; ictx.lineJoin = 'round';
    for (const s of [...liveRef.current.values(), ...(drawingRef.current ? [drawingRef.current] : [])]) paintStroke(ictx, s);
    ictx.globalCompositeOperation = 'source-over'; ictx.globalAlpha = 1; // 잔여 상태 초기화
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(ink, 0, 0);
    // 레이저 궤적 — 잉크 위에 얹어 그리고, 남아있으면 다음 프레임을 스스로 예약(페이드 애니메이션).
    const laserAlive = paintLasers(ctx, v);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (laserAlive) rafRef.current = requestAnimationFrame(drawFrame);
  }

  // 레이저 — 렌더는 board-core 단일 소스.
  function paintLasers(ctx: CanvasRenderingContext2D, v: { scale: number; tx: number; ty: number }): boolean { return renderLasers(ctx, laserRef.current, v); }
  function addLaser(key: string, x: number, y: number) { pushLaser(laserRef.current, key, x, y); }
  function flushLaser() {
    if (laserPendingRef.current.length === 0) return;
    sockRef.current?.emit('wb:laser', { sid: sidRef.current, points: laserPendingRef.current.map((p) => ({ x: p.x, y: p.y })) });
    laserPendingRef.current = [];
  }

  // rAF 코얼레싱: 프레임당 최대 1회 합성.
  function requestPaint() { if (!rafRef.current) rafRef.current = requestAnimationFrame(drawFrame); }
  // 확정 집합/뷰 변경 → 캐시 재빌드 표시 후 재합성.
  function redraw() { cacheDirtyRef.current = true; requestPaint(); }

  /** 룸 배경 로드 — fileUrl(룸 서비스)을 토큰과 함께 blob 으로 가져와 표시(캔버스 오염 방지). */
  function loadBg(fileUrl: string | null) {
    bgUrlRef.current = fileUrl;
    if (!fileUrl) { bgImgRef.current = null; requestPaint(); return; }
    const abs = `${rs.url}${fileUrl}${fileUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(rs.token)}`;
    fetch(abs).then((r) => r.blob()).then((b) => { const img = new Image(); img.onload = () => { bgImgRef.current = img; requestPaint(); }; img.src = URL.createObjectURL(b); }).catch(() => {});
  }
  function scheduleAutosave() { setSaveState('dirty'); if (saveTimerRef.current) clearTimeout(saveTimerRef.current); saveTimerRef.current = setTimeout(() => save(), 1500); }

  useEffect(() => {
    const s = io(rs.url, { path: '/api/rt/v1/socket.io', auth: { token: rs.token }, transports: ['websocket'] });
    sockRef.current = s;
    // 연결/인증 실패를 눈에 보이게 — 안 그러면 "연결 중"에서 무한 대기(원인: 룸 서버 미접속·토큰 오류).
    s.on('connect_error', (e) => { setConnErr(`룸 서버(${rs.url}) 연결 실패: ${e?.message ?? '알 수 없음'}`); });
    s.on('error', (e: { message?: string } | string) => setConnErr(typeof e === 'string' ? e : (e?.message ?? '룸 오류')));
    s.on('connect', () => { setConnErr(null); s.emit('wb:join', {}, (r: { ok: boolean; error?: string; strokes?: Stroke[]; backgroundUrl?: string | null; session?: SessionInfo; mode?: 'session' | 'lecture'; role?: string; roster?: Array<{ participantId: string; name?: string; role?: string }> }) => {
      if (!r?.ok) { setStatus('off'); setConnErr(r?.error ?? '화이트보드에 입장할 수 없습니다.'); return; }
      strokesRef.current = Array.isArray(r.strokes) ? r.strokes : []; if (r.session) setLive(r.session); setStatus('ready'); redraw(); setCanUndo(strokesRef.current.length > 0);
      if (r.mode) setMode(r.mode); if (r.role) setRole(r.role); if (Array.isArray(r.roster)) setRoster(r.roster);
      if (r.backgroundUrl) loadBg(r.backgroundUrl);
    }); });
    s.on('wb:stroke:partial', ({ sid, meta, points }: { sid: string; meta: Partial<Stroke>; points: Pt[] }) => {
      let st = liveRef.current.get(sid);
      if (!st) { st = { color: meta.color ?? '#1E3550', width: meta.width ?? 3, erase: meta.erase, highlight: meta.highlight, points: [] }; liveRef.current.set(sid, st); }
      st.points.push(...points); requestPaint();
    });
    s.on('wb:stroke', ({ stroke, sid }: { stroke: Stroke; sid?: string }) => { if (sid) liveRef.current.delete(sid); strokesRef.current.push(stroke); redraw(); setCanUndo(true); });
    s.on('wb:clear', () => { strokesRef.current = []; liveRef.current.clear(); redoRef.current = []; setCanRedo(false); redraw(); setCanUndo(false); });
    // 상대가 되돌리기·필기지우기 등 벌크 변경 → 전체 스트로크 교체.
    s.on('wb:sync', ({ strokes }: { strokes: Stroke[] }) => { strokesRef.current = Array.isArray(strokes) ? strokes : []; liveRef.current.clear(); redraw(); setCanUndo(strokesRef.current.length > 0); });
    // 상대 레이저 궤적 — 참가자·제스처별로 모아 페이드 렌더(비영구).
    s.on('wb:laser', ({ sid, points }: { participantId?: string; sid?: string; points: Array<{ x: number; y: number }> }) => { if (!Array.isArray(points)) return; const key = `peer:${sid ?? ''}`; for (const p of points) addLaser(key, p.x, p.y); requestPaint(); });
    // 안내선(모눈/줄) 동기화 — 세션 한정(스냅샷 저장 안 함).
    s.on('wb:grid', ({ grid: g }: { grid: GridMode }) => { gridRef.current = g; setGrid(g); requestPaint(); });
    s.on('roster:join', (p: { participantId: string; name?: string; role?: string }) => setRoster((prev) => prev.some((x) => x.participantId === p.participantId) ? prev : [...prev, p]));
    s.on('roster:leave', ({ participantId }: { participantId: string }) => { setRoster((prev) => prev.filter((x) => x.participantId !== participantId)); setRaised((prev) => { const m = new Map(prev); m.delete(participantId); return m; }); });
    // 발표권 변경: roster 역할 갱신 + 내가 대상이면 역할 반영하고 서버 ctx 재동기화(그래야 판서 허용).
    s.on('lecture:role', ({ participantId, role: nr }: { participantId: string; role: string }) => {
      setRoster((prev) => prev.map((x) => x.participantId === participantId ? { ...x, role: nr } : x));
      setRaised((prev) => { const m = new Map(prev); m.delete(participantId); return m; });
      if (participantId === myPid) { setRole(nr); s.emit('lecture:sync'); }
    });
    // 손들기: host 화면에 손든 학생 표시.
    s.on('hand:raise', ({ participantId, name, raised: up }: { participantId: string; name?: string; raised?: boolean }) => {
      setRaised((prev) => { const m = new Map(prev); if (up) m.set(participantId, name); else m.delete(participantId); return m; });
    });
    s.on('wb:image', ({ fileUrl }: { fileUrl: string | null }) => loadBg(fileUrl));
    s.on('session:closed', (e: { closesAt?: string }) => setLive((v) => ({ ...v, state: 'closed', closesAt: e.closesAt ?? v.closesAt })));
    s.on('session:revoked', () => setStatus('off'));
    return () => { s.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rs.url, rs.token]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); const r = cv.getBoundingClientRect();
      const cx = ((e.clientX - r.left) / r.width) * W, cy = ((e.clientY - r.top) / r.height) * H;
      if (e.ctrlKey || e.metaKey) zoomAt(cx, cy, e.deltaY < 0 ? 1.1 : 1 / 1.1);
      else { const v = viewRef.current; v.tx -= e.deltaX; v.ty -= e.deltaY; clampView(); redraw(); }
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => { if (phase === 'closed' && status === 'ready') { finalizeStroke(); save(); } /* eslint-disable-line react-hooks/exhaustive-deps */ }, [phase]);

  function canvasSpace(e: { clientX: number; clientY: number }) { const cv = canvasRef.current!; const r = cv.getBoundingClientRect(); return { cx: ((e.clientX - r.left) / r.width) * W, cy: ((e.clientY - r.top) / r.height) * H }; }
  function pt(e: { clientX: number; clientY: number; pointerType: string; pressure: number }): Pt { const { cx, cy } = canvasSpace(e); const v = viewRef.current; const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : e.pressure > 0 ? e.pressure : 0.5; return { x: (cx - v.tx) / v.scale, y: (cy - v.ty) / v.scale, p }; }
  function clampView() { const v = viewRef.current; v.scale = Math.min(8, Math.max(1, v.scale)); v.tx = Math.min(0, Math.max(W - W * v.scale, v.tx)); v.ty = Math.min(0, Math.max(H - H * v.scale, v.ty)); }
  function zoomAt(cx: number, cy: number, factor: number) { const v = viewRef.current; const ns = Math.min(8, Math.max(1, v.scale * factor)); const k = ns / v.scale; v.tx = cx - (cx - v.tx) * k; v.ty = cy - (cy - v.ty) * k; v.scale = ns; clampView(); setZoomPct(Math.round(v.scale * 100)); redraw(); }
  function resetZoom() { viewRef.current = { scale: 1, tx: 0, ty: 0 }; setZoomPct(100); redraw(); }
  function finalizeStroke() {
    const st = drawingRef.current; drawingRef.current = null;
    if (!st || st.points.length === 0) { pendingRef.current = []; return; }
    strokesRef.current.push(st); redraw(); setCanUndo(true);
    redoRef.current = []; setCanRedo(false); // 새 획 확정 → 다시 실행 스택 무효
    sockRef.current?.emit('wb:stroke', { stroke: st, sid: sidRef.current }); pendingRef.current = []; scheduleAutosave();
  }
  function rejected(e: React.PointerEvent) { if (e.pointerType === 'pen') penSeenRef.current = true; return penSeenRef.current && e.pointerType === 'touch'; }
  function flushPartial() { const st = drawingRef.current; if (!st || pendingRef.current.length === 0) return; sockRef.current?.emit('wb:stroke:partial', { sid: sidRef.current, meta: { color: st.color, width: st.width, erase: st.erase, highlight: st.highlight }, points: pendingRef.current }); pendingRef.current = []; }
  function beginPinch() { const p = [...pointersRef.current.values()]; if (p.length < 2) return; const [a, b] = p; pinchRef.current = { dist: Math.hypot(a.cx - b.cx, a.cy - b.cy) || 1, midCx: (a.cx + b.cx) / 2, midCy: (a.cy + b.cy) / 2, view: { ...viewRef.current } }; }
  function down(e: React.PointerEvent) {
    if (status !== 'ready') return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, canvasSpace(e));
    if (pointersRef.current.size >= 2) { finalizeStroke(); beginPinch(); return; }
    if (!rw) return; // 세션 창 밖 → 필기 불가(보기 전용)
    if (isViewer) return; // 강의 모드 학생 → 열람 전용(줌/팬은 위 2손가락 분기에서 허용)
    if (rejected(e)) return;
    const p0 = pt(e);
    sidRef.current = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    if (tool === 'laser') { // 레이저는 확정 스트로크가 아님 — 궤적만 그리고 방송(저장·되돌리기 대상 아님).
      laserPendingRef.current = []; laserFlushRef.current = 0; addLaser('me', p0.x, p0.y); laserPendingRef.current.push(p0); flushLaser(); requestPaint(); return;
    }
    if (tool === 'text') { // 텍스트 — 클릭 지점에 입력 오버레이
      setTextBox({ x: p0.x, y: p0.y, value: '' });
      return;
    }
    if ((SHAPE_TOOLS as readonly string[]).includes(tool)) { // 도형: 드래그로 시작→끝 두 점 확정(라이브 스트리밍 없음 — 최종 획만 중계)
      drawingRef.current = { points: [p0, p0], color, width, shape: tool as Stroke['shape'] };
      pendingRef.current = []; lastFlushRef.current = 0; requestPaint(); return;
    }
    drawingRef.current = tool === 'eraser' ? { points: [p0], color: '#000', width: Math.max(16, width * 4), erase: true }
      : tool === 'highlighter' ? { points: [p0], color, width: Math.max(14, width * 4), highlight: true }
        : { points: [p0], color, width };
    pendingRef.current = [p0]; lastFlushRef.current = 0; requestPaint();
  }
  function move(e: React.PointerEvent) {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, canvasSpace(e));
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]; const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy) || 1;
      const midCx = (a.cx + b.cx) / 2, midCy = (a.cy + b.cy) / 2, pin = pinchRef.current, v = viewRef.current;
      const k = Math.min(8, Math.max(1, (pin.view.scale * dist) / pin.dist)) / pin.view.scale;
      v.scale = pin.view.scale * k; v.tx = midCx - (pin.midCx - pin.view.tx) * k; v.ty = midCy - (pin.midCy - pin.view.ty) * k;
      clampView(); setZoomPct(Math.round(v.scale * 100)); redraw(); return;
    }
    if (tool === 'laser') {
      if (!sidRef.current || pointersRef.current.size >= 2 || status !== 'ready' || !rw || isViewer) return;
      const p = pt(e); addLaser('me', p.x, p.y); laserPendingRef.current.push(p); requestPaint();
      const nowL = Date.now(); if (nowL - laserFlushRef.current >= 50) { laserFlushRef.current = nowL; flushLaser(); }
      return;
    }
    if (drawingRef.current?.shape) { // 도형 미리보기 — 끝점만 갱신
      drawingRef.current.points = [drawingRef.current.points[0], pt(e)];
      requestPaint(); return;
    }
    if (!drawingRef.current || rejected(e)) return;
    const ne = e.nativeEvent;
    const coalesced = typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [];
    const evs = coalesced.length ? coalesced : [ne];
    for (const ev of evs) { const p = pt(ev); drawingRef.current.points.push(p); pendingRef.current.push(p); }
    requestPaint();
    const now = Date.now(); if (now - lastFlushRef.current >= 50) { lastFlushRef.current = now; flushPartial(); }
  }
  function up(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId); if (pointersRef.current.size < 2) pinchRef.current = null;
    if (tool === 'laser') { flushLaser(); sidRef.current = ''; return; }
    finalizeStroke();
  }
  // 텍스트 확정 — 일반 획과 동일하게 저장·중계(undo/redo 대상).
  function commitText() {
    const tb = textBox; setTextBox(null);
    if (!tb || !tb.value.trim()) return;
    const st: Stroke = { points: [{ x: tb.x, y: tb.y }], color, width, shape: 'text', text: tb.value.replace(/\s+$/, '') };
    strokesRef.current.push(st); redraw(); setCanUndo(true);
    redoRef.current = []; setCanRedo(false);
    sockRef.current?.emit('wb:stroke', { stroke: st, sid: '' }); scheduleAutosave();
  }
  // 되돌리기 — 마지막 확정 스트로크 제거 후 전체 집합 재동기화(순서 무관, 상대와 일치 보장).
  function undo() {
    if (!rw || strokesRef.current.length === 0) return;
    redoRef.current.push(strokesRef.current[strokesRef.current.length - 1]); setCanRedo(true);
    strokesRef.current = strokesRef.current.slice(0, -1); liveRef.current.clear(); redraw(); setCanUndo(strokesRef.current.length > 0);
    sockRef.current?.emit('wb:sync', { strokes: strokesRef.current }); scheduleAutosave();
  }
  // 다시 실행 — 되돌린 획을 복원(새 획이 확정되면 스택 무효).
  function redo() {
    if (!rw) return;
    const st = redoRef.current.pop();
    setCanRedo(redoRef.current.length > 0);
    if (!st) return;
    strokesRef.current.push(st); redraw(); setCanUndo(true);
    sockRef.current?.emit('wb:sync', { strokes: strokesRef.current }); scheduleAutosave();
  }
  // 안내선·템플릿 선택 — 상대와 동기화.
  function setGuide(next: GridMode) {
    setPop(null);
    gridRef.current = next; setGrid(next); cacheDirtyRef.current = true; requestPaint();
    sockRef.current?.emit('wb:grid', { grid: next });
  }
  // 보드 전체(줌 무관, 원본 좌표 2배율)를 PNG 로 렌더 — 내보내기·기록 공용.
  function renderBoardPng(): Promise<Blob | null> {
    const S = 2;
    const out = document.createElement('canvas'); out.width = W * S; out.height = H * S;
    const octx = out.getContext('2d'); if (!octx) return Promise.resolve(null);
    // 잉크는 별도 레이어에 — 지우개(destination-out)가 흰 바탕을 뚫지 않게.
    const ink = document.createElement('canvas'); ink.width = out.width; ink.height = out.height;
    const ictx = ink.getContext('2d')!;
    ictx.setTransform(S, 0, 0, S, 0, 0); ictx.lineCap = 'round'; ictx.lineJoin = 'round';
    for (const s of strokesRef.current) paintStroke(ictx, s);
    octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height);
    octx.setTransform(S, 0, 0, S, 0, 0);
    if (!bgImgRef.current) paintGuide(octx);
    if (bgImgRef.current) {
      const img = bgImgRef.current; const ir = img.width / img.height, cr = W / H;
      let dw = W, dh = H, dx = 0, dy = 0;
      if (ir > cr) { dh = W / ir; dy = (H - dh) / 2; } else { dw = H * ir; dx = (W - dw) / 2; }
      octx.drawImage(img, dx, dy, dw, dh);
    }
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.drawImage(ink, 0, 0);
    return new Promise((res) => out.toBlob(res, 'image/png'));
  }
  // 보드 PNG 내보내기(다운로드) — 전체 보드 기준.
  async function exportPng() {
    const b = await renderBoardPng(); if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  // 보드를 룸 채팅 기록에 이미지 메시지로 남긴다.
  async function archiveToChat() {
    if (archState !== 'idle' || (strokesRef.current.length === 0 && !bgImgRef.current)) return;
    setArchState('busy');
    try {
      const png = await renderBoardPng(); if (!png) throw new Error('render');
      const form = new FormData();
      form.append('file', png, `board-${new Date().toISOString().slice(0, 10)}.png`);
      const r = await fetch(`${rs.url}/api/rt/v1/files`, { method: 'POST', headers: { authorization: `Bearer ${rs.token}` }, body: form });
      if (!r.ok) throw new Error('upload');
      const { fileUrl } = await r.json() as { fileUrl: string };
      sockRef.current?.emit('chat:send', { fileUrl, kind: 'image', body: '📋 화이트보드 기록' });
      setArchState('done');
      setTimeout(() => setArchState('idle'), 2500);
    } catch {
      setArchState('idle');
      alert('기록 남기기에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }
  }
  // 필기만 지우기 — 배경 이미지는 유지.
  function clearInk() { strokesRef.current = []; liveRef.current.clear(); redoRef.current = []; setCanRedo(false); redraw(); setCanUndo(false); sockRef.current?.emit('wb:clear'); scheduleAutosave(); }
  // 배경까지 모두 지우기 — 필기 + 배경 이미지 제거.
  function clearAll() { strokesRef.current = []; liveRef.current.clear(); redoRef.current = []; setCanRedo(false); loadBg(null); redraw(); setCanUndo(false); sockRef.current?.emit('wb:clear'); sockRef.current?.emit('wb:image', { fileUrl: null }); scheduleAutosave(); }
  function save() { if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; } setSaveState('saving'); sockRef.current?.emit('wb:save', { strokes: strokesRef.current, backgroundUrl: bgUrlRef.current }, () => setSaveState('saved')); }

  /** 이미지 → 룸 서비스 업로드 → fileUrl 배경. */
  async function useAsBackground(blob: Blob, name: string) {
    const form = new FormData(); form.append('file', blob, name);
    const r = await fetch(`${rs.url}/api/rt/v1/files`, { method: 'POST', headers: { authorization: `Bearer ${rs.token}` }, body: form });
    if (!r.ok) return; const { fileUrl } = await r.json() as { fileUrl: string };
    loadBg(fileUrl); sockRef.current?.emit('wb:image', { fileUrl }); scheduleAutosave();
  }
  async function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) { alert('PDF 배경은 준비 중입니다. 지금은 이미지 배경을 사용할 수 있어요.'); return; } // 이음새(N22): 사업확장 후 룸 서비스 PDF 렌더 추가하면 이 분기만 활성화. 결정사항 Decision-Register C-7 참조.
    if (f.type.startsWith('image/')) { try { await useAsBackground(f, f.name); } catch { alert('배경 불러오기에 실패했어요.'); } }
  }
  async function openCamera() { try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); camStreamRef.current = stream; setCamOn(true); setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } }, 30); } catch { alert('카메라를 사용할 수 없어요.'); } }
  function closeCamera() { camStreamRef.current?.getTracks().forEach((t) => t.stop()); camStreamRef.current = null; setCamOn(false); }
  async function capture() { const v = videoRef.current; if (!v) return; const cw = v.videoWidth || 1280, ch = v.videoHeight || 720; const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d')!.drawImage(v, 0, 0, cw, ch); const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85)); closeCamera(); await useAsBackground(blob, 'shot.jpg'); }
  useEffect(() => () => closeCamera(), []);

  // 지우개 커서 — 지울 범위를 원으로 표시(캔버스 표시 배율·줌 반영).
  const eraserCursor = (() => {
    if (tool !== 'eraser') return 'crosshair';
    const rect = canvasRef.current?.getBoundingClientRect();
    const k = ((rect?.width ?? 900) / W) * (zoomPct / 100);
    const d = Math.max(10, Math.min(128, Math.round(Math.max(16, width * 4) * k)));
    const r = d / 2;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d}' height='${d}'><circle cx='${r}' cy='${r}' r='${r - 1}' fill='rgba(200,210,220,0.28)' stroke='%23607080' stroke-width='1'/></svg>`;
    return `url("data:image/svg+xml,${svg}") ${r} ${r}, crosshair`;
  })();

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title ?? '공유 화이트보드'} onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: wide ? `min(96vw, calc((100vh - 170px) * ${W / H}))` : 960, maxHeight: 'calc(100vh - 16px)', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>🖊 {title ?? '공유 화이트보드'}</b>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {media
              ? <LectureAudioBar media={media} publish={!!mediaPublish} />
              : (status !== 'off' && (call.inCall
                ? <>
                    <span style={{ fontSize: 12, color: call.status === 'connected' ? 'var(--chip-done)' : call.status === 'reconnecting' ? 'var(--chip-confirmed, #d97706)' : 'var(--muted)' }}>
                      🎧 {call.status === 'connected' ? '통화 중' : call.status === 'reconnecting' ? '재연결 중…' : '연결 중…'}
                    </span>
                    {call.status === 'reconnecting' && <button className="btn sm" onClick={() => void call.reconnect()}>🔄 재연결</button>}
                    <button className="btn ghost sm" onClick={call.toggleMute}>{call.muted ? '🔇 음소거' : '🎙 켜짐'}</button>
                    <button className="btn danger sm" onClick={call.hangup}>통화 종료</button>
                  </>
                : <button className="btn ghost sm" disabled={!rw} onClick={call.start}>📞 음성통화</button>))}
            <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
          </div>
        </div>
        {status === 'off' ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>{connErr ?? '화이트보드 세션이 종료되었어요.'}</p>
        ) : status === 'connecting' && connErr ? (
          <p style={{ color: '#a64b37', fontSize: 13, textAlign: 'center', padding: 40, lineHeight: 1.6 }}>⚠ {connErr}<br /><span style={{ color: 'var(--muted)', fontSize: 12 }}>같은 기기의 localhost:8080 접속인지, realtime-rooms 컨테이너 상태를 확인하세요.</span></p>
        ) : (
          <>
            {!rw && <div style={{ padding: '8px 14px', background: phase === 'closed' ? 'var(--line-soft,#eef2f7)' : 'var(--teal-50,#E8F0F9)', color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', borderBottom: '1px solid var(--line)' }}>{phase === 'closed' ? '🔒 ' : '⏳ '}{notice} 필기는 예약 시간대에만 가능하고, 지금은 열람만 됩니다.</div>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
              {/* 팝오버 열림 중 바깥 클릭 → 닫기(캔버스 오입력 방지 겸용) */}
              {pop && <div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setPop(null)} />}
              {mode === 'lecture' && (
                <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: isViewer ? '#fbeae7' : '#e9f5ee', color: isViewer ? '#a64b37' : '#2a8a5f', border: `1px solid ${isViewer ? '#f0cfc9' : '#cfe6d8'}` }}>
                  {isViewer ? '🔴 강의 열람 중' : `🟢 강의 중 · 참석 ${roster.length}명`}
                </span>
              )}
              {!isViewer && (<>
                {/* 색상·굵기 팝오버(W-U1) — 스와치가 현재 색·굵기를 보여준다 */}
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <button onClick={() => setPop((p) => (p === 'pen' ? null : 'pen'))} title="색상·굵기" aria-expanded={pop === 'pen'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: pop === 'pen' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)' }}>
                    <span style={{ width: 16, height: 16, borderRadius: '50%', background: color, display: 'inline-block', border: '1px solid var(--line)' }} />
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{width}</span>
                    <span style={{ fontSize: 9, color: 'var(--muted)' }}>▾</span>
                  </button>
                  {pop === 'pen' && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 10, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {COLORS.map((c) => (
                          <button key={c} onClick={() => { setColor(c); setTool((t) => (t === 'pen' || t === 'highlighter' ? t : 'pen')); }} title={c} aria-label={`색상 ${c}`} aria-pressed={color === c}
                            style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '3px solid var(--teal)' : '2px solid var(--line)' }} />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[2, 3, 6, 10].map((w) => (<button key={w} onClick={() => setWidth(w)} style={{ width: 28, height: 26, borderRadius: 6, cursor: 'pointer', border: width === w ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontWeight: 700, fontSize: 12 }}>{w}</button>))}
                      </div>
                    </div>
                  )}
                </span>
                <button onClick={() => setTool('pen')} aria-pressed={tool === 'pen'} title="펜" style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: tool === 'pen' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}>✏️</button>
                <button onClick={() => setTool('highlighter')} aria-pressed={tool === 'highlighter'} title="형광펜" style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: tool === 'highlighter' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}>🖍</button>
                <button onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} title="지우개(영역만큼 지움)" style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: tool === 'eraser' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}>🧽</button>
                <button onClick={() => setTool('laser')} aria-pressed={tool === 'laser'} title="레이저 포인터(잠시 후 사라짐)" style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: tool === 'laser' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}>🔦</button>
                <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
                {/* 도형 팝오버(W-U1) — 현재 도형 도구가 켜져 있으면 그 아이콘 표시 */}
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <button onClick={() => setPop((p) => (p === 'shape' ? null : 'shape'))} title="도형(직선·화살표·사각형·타원)" aria-expanded={pop === 'shape'}
                    aria-pressed={(SHAPE_TOOLS as readonly string[]).includes(tool)}
                    style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: (SHAPE_TOOLS as readonly string[]).includes(tool) || pop === 'shape' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13 }}>
                    {tool === 'line' ? '╱' : tool === 'arrow' ? '↗' : tool === 'ellipse' ? '◯' : '▭'}<span style={{ fontSize: 9, color: 'var(--muted)' }}> ▾</span>
                  </button>
                  {pop === 'shape' && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 10, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,.15)', display: 'flex', gap: 8 }}>
                      {([['line', '╱', '직선'], ['arrow', '↗', '화살표'], ['rect', '▭', '사각형'], ['ellipse', '◯', '타원']] as const).map(([t, icon, name]) => (
                        <button key={t} onClick={() => { setTool(t); setPop(null); }} aria-pressed={tool === t} title={name} style={{ padding: '5px 10px', borderRadius: 6, cursor: 'pointer', border: tool === t ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 14 }}>{icon}</button>
                      ))}
                    </div>
                  )}
                </span>
                <button onClick={() => setTool('text')} aria-pressed={tool === 'text'} title="텍스트(클릭한 곳에 입력)" style={{ padding: '5px 9px', borderRadius: 6, cursor: 'pointer', border: tool === 'text' ? '2px solid var(--teal)' : '1px solid var(--line)', background: 'var(--surface)', fontSize: 13, fontWeight: 800 }}>T</button>
                <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
                <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={onAttach} />
                <button className="btn ghost sm" disabled={!rw} onClick={() => fileRef.current?.click()} title="이미지 배경 올리기">🖼</button>
                <button className="btn ghost sm" disabled={!rw} onClick={openCamera} title="카메라로 문제 촬영">📷</button>
                <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
              </>)}
              {/* 줌·보기 묶음 — 줄바꿈 시에도 함께 이동(그룹 분리 방지) */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'nowrap' }}>
                <button className="btn ghost sm" title="축소" onClick={() => zoomAt(W / 2, H / 2, 1 / 1.25)}>🔍−</button>
                <button className="btn ghost sm" title="원본 크기" onClick={resetZoom} style={{ minWidth: 52, fontVariantNumeric: 'tabular-nums' }}>{zoomPct}%</button>
                <button className="btn ghost sm" title="확대" onClick={() => zoomAt(W / 2, H / 2, 1.25)}>🔍＋</button>
                {!isViewer && (
                  /* 안내선·템플릿 팝오버(오답노트·4분면 포함) */
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <button className="btn ghost sm" title="안내선·템플릿" onClick={() => setPop((p) => (p === 'bg' ? null : 'bg'))} aria-expanded={pop === 'bg'} aria-pressed={grid !== 'none'} style={grid !== 'none' ? { borderColor: 'var(--teal)' } : undefined}>
                      {grid === 'lines' ? '▤' : grid === 'wrongnote' ? '📋' : grid === 'quad' ? '➕' : '⊞'} <span style={{ fontSize: 9, color: 'var(--muted)' }}>▾</span>
                    </button>
                    {pop === 'bg' && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 10, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
                        {([['none', '⬜ 없음'], ['grid', '⊞ 모눈'], ['lines', '▤ 줄노트'], ['wrongnote', '📋 오답노트'], ['quad', '➕ 4분면 좌표']] as const).map(([g, label]) => (
                          <button key={g} className="btn ghost sm" onClick={() => setGuide(g)} aria-pressed={grid === g} style={grid === g ? { borderColor: 'var(--teal)', fontWeight: 700 } : undefined}>{label}</button>
                        ))}
                      </div>
                    )}
                  </span>
                )}
                <button className="btn ghost sm" title={wide ? '기본 크기로' : '넓게 보기'} onClick={() => setWide((w) => !w)}>{wide ? '🗗' : '⛶'}</button>
              </div>
              <div style={{ flex: 1 }} />
              {isViewer ? (<>
                <button className="btn ghost sm" onClick={() => { const nv = !handUp; setHandUp(nv); sockRef.current?.emit('hand:raise', { raised: nv }); }} style={handUp ? { borderColor: 'var(--gold, #e8a63d)', color: 'var(--gold-d, #a97d24)' } : undefined}>{handUp ? '✋ 손 내리기' : '✋ 손들기'}</button>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>👁 선생님 판서를 실시간으로 봅니다</span>
              </>) : (<>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '자동 저장됨 ✓' : saveState === 'dirty' ? '변경됨' : ''}</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'nowrap' }}>
                  <button className="btn ghost sm" disabled={!rw || !canUndo} onClick={undo} title="되돌리기 (⌘Z)">↶</button>
                  <button className="btn ghost sm" disabled={!rw || !canRedo} onClick={redo} title="다시 실행 (⌘⇧Z)">↷</button>
                  {/* 지우기 팝오버(W-U1) — 파괴적 동작 2종을 한 버튼으로 */}
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <button className="btn ghost sm" disabled={!rw} onClick={() => setPop((p) => (p === 'clear' ? null : 'clear'))} aria-expanded={pop === 'clear'}>지우기 ▾</button>
                    {pop === 'clear' && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 10, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 170 }}>
                        <button className="btn ghost sm" onClick={() => { clearInk(); setPop(null); }} title="배경 이미지는 유지">필기만 지우기</button>
                        <button className="btn ghost sm" onClick={() => { clearAll(); setPop(null); }} title="필기+배경 모두 삭제">배경까지 모두 지우기</button>
                      </div>
                    )}
                  </span>
                  <button className="btn ghost sm" onClick={() => void exportPng()} title="보드를 PNG 이미지로 저장">⬇ PNG</button>
                  <button className="btn ghost sm" disabled={!rw || archState === 'busy'} onClick={() => void archiveToChat()} title="보드를 채팅 기록에 이미지로 남기기">
                    {archState === 'done' ? '기록됨 ✓' : archState === 'busy' ? '기록 중…' : '📎 기록'}
                  </button>
                  <button className="btn sm" disabled={!rw} onClick={save}>저장</button>
                </div>
              </>)}
            </div>
            {isHost && (raised.size > 0 || roster.some((r) => r.role === 'presenter')) && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 14px', flexWrap: 'wrap', borderBottom: '1px solid var(--line)', background: '#fffaf0' }}>
                {raised.size > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-d, #a97d24)' }}>✋ 손든 학생</span>}
                {[...raised].map(([pid, nm]) => (
                  <button key={pid} className="btn ghost sm" onClick={() => sockRef.current?.emit('lecture:grant', { participantId: pid })}>{nm ?? '학생'} · 발표권 주기</button>
                ))}
                {roster.filter((r) => r.role === 'presenter').map((r) => (
                  <button key={r.participantId} className="btn ghost sm" onClick={() => sockRef.current?.emit('lecture:revoke', { participantId: r.participantId })}>{r.name ?? '학생'} · 발표권 회수</button>
                ))}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <canvas ref={canvasRef} width={W} height={H} role="img" aria-label="공유 필기 캔버스" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} style={{ width: '100%', aspectRatio: `${W} / ${H}`, background: '#fff', touchAction: 'none', cursor: isViewer ? 'default' : eraserCursor, display: 'block' }} />
              {textBox && (
                <div style={{ position: 'absolute', left: `${((textBox.x * viewRef.current.scale + viewRef.current.tx) / W) * 100}%`, top: `${((textBox.y * viewRef.current.scale + viewRef.current.ty) / H) * 100}%`, zIndex: 25, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea autoFocus value={textBox.value}
                    onChange={(e) => setTextBox({ ...textBox, value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); commitText(); } }}
                    placeholder="내용 입력 (Enter 확정 · Shift+Enter 줄바꿈)"
                    style={{ width: 220, minHeight: 52, resize: 'both', border: '1px solid var(--line)', borderRadius: 6, padding: 6, fontSize: 13, color, fontWeight: 600 }} />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn ghost sm" onClick={() => setTextBox(null)}>취소</button>
                    <button className="btn sm" onClick={commitText}>확정</button>
                  </div>
                </div>
              )}
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
