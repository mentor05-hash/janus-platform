/**
 * 보드 렌더 코어(O83) — 화이트보드 쌍둥이 4파일(웹 예약/룸 + 모바일 예약/룸)이 공용 소비하는
 * 순수 렌더 로직의 단일 소스. 여기 수정하면 4곳에 동시 반영된다(전수 반영 사고 구조적 차단).
 *  - 획·도형·텍스트 렌더(paintStroke): 지우개 destination-out·형광펜 알파·필압 굵기 포함.
 *  - 안내선·템플릿(paintGuide): 모눈/줄노트/오답노트/4분면 — 논리좌표(W,H)를 인자로 받는다.
 *  - 레이저(paintLasers/addLaser): 비영구 페이드 궤적. 소켓 전송은 소비자 몫.
 * ⚠ paintStroke 는 ctx 에 합성 상태(destination-out/알파)를 남긴다 — 호출측은 프레임 경계에서
 *    반드시 source-over/alpha=1 로 초기화할 것(b9ce125 지우개 누수 버그의 원인).
 */

export type Pt = { x: number; y: number; p?: number }; // p=필압(0~1)
/** shape 있으면 points[0]→points[끝] 두 점 도형. 'text' 는 points[0] 기준 + text 필드. */
export type Stroke = { points: Pt[]; color: string; width: number; erase?: boolean; highlight?: boolean; shape?: 'line' | 'arrow' | 'rect' | 'ellipse' | 'text'; text?: string };
export type GridMode = 'none' | 'grid' | 'lines' | 'wrongnote' | 'quad';
export const SHAPE_TOOLS = ['line', 'arrow', 'rect', 'ellipse'] as const;

export const LASER_TTL = 900;        // 레이저 점 유지 시간(ms) — 이후 연해지며 사라짐
export const LASER_COLOR = '#F5333F';
export type LaserStore = Map<string, { pts: Array<{ x: number; y: number; t: number }>; color: string }>;
export type ViewTransform = { scale: number; tx: number; ty: number };

/** 한 획을 컨텍스트에 렌더(변환은 호출측 적용). 지우개(destination-out)·형광펜(반투명)·필압·도형·텍스트. */
export function paintStroke(ictx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length < 1) return;
  ictx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
  ictx.globalAlpha = s.highlight ? 0.42 : 1;
  ictx.strokeStyle = s.color;
  if (s.shape === 'text') { // 텍스트 상자 — points[0] 기준, 폰트 크기는 굵기에 비례
    const a = s.points[0];
    const fs = Math.max(14, s.width * 7);
    ictx.fillStyle = s.color;
    ictx.font = `600 ${fs}px sans-serif`;
    (s.text ?? '').split('\n').forEach((ln, i) => ictx.fillText(ln, a.x, a.y + fs * (i + 0.9)));
    return;
  }
  if (s.shape) { // 도형: 시작점→끝점 두 점으로 정의(스냅샷·중계 포맷은 기존 Stroke 그대로)
    const a = s.points[0], b = s.points[s.points.length - 1] ?? a;
    ictx.lineWidth = s.width;
    ictx.beginPath();
    if (s.shape === 'rect') ictx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    else if (s.shape === 'ellipse') ictx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(0.1, Math.abs(b.x - a.x) / 2), Math.max(0.1, Math.abs(b.y - a.y) / 2), 0, 0, Math.PI * 2);
    else { ictx.moveTo(a.x, a.y); ictx.lineTo(b.x, b.y); }
    ictx.stroke();
    if (s.shape === 'arrow') {
      const ang = Math.atan2(b.y - a.y, b.x - a.x), hl = Math.max(10, s.width * 3);
      ictx.beginPath();
      ictx.moveTo(b.x, b.y); ictx.lineTo(b.x - hl * Math.cos(ang - 0.45), b.y - hl * Math.sin(ang - 0.45));
      ictx.moveTo(b.x, b.y); ictx.lineTo(b.x - hl * Math.cos(ang + 0.45), b.y - hl * Math.sin(ang + 0.45));
      ictx.stroke();
    }
    return;
  }
  if (s.erase || s.highlight || s.points.length === 1 || s.points.every((q) => q.p == null)) {
    ictx.lineWidth = s.width;
    ictx.beginPath(); ictx.moveTo(s.points[0].x, s.points[0].y);
    for (const p of s.points.slice(1)) ictx.lineTo(p.x, p.y);
    if (s.points.length === 1) ictx.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1);
    ictx.stroke();
  } else {
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1], b = s.points[i];
      ictx.lineWidth = s.width * (0.35 + (b.p ?? 0.5) * 1.3);
      ictx.beginPath(); ictx.moveTo(a.x, a.y); ictx.lineTo(b.x, b.y); ictx.stroke();
    }
  }
}

/** 안내선·템플릿 렌더(논리좌표) — 배경 이미지가 없을 때만 호출할 것. */
export function paintGuide(ctx: CanvasRenderingContext2D, g: GridMode, W: number, H: number) {
  if (g === 'none') return;
  const step = 40;
  ctx.strokeStyle = '#dbe4ee'; ctx.fillStyle = '#8fa3b8'; ctx.lineWidth = 1;
  if (g === 'grid' || g === 'lines') {
    ctx.beginPath();
    if (g === 'grid') for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  } else if (g === 'wrongnote') { // 오답노트 4분할(문제/풀이/틀린 이유/다시 풀기)
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.font = '700 14px sans-serif';
    ctx.fillText('① 문제', 12, 22); ctx.fillText('② 풀이 과정', W / 2 + 12, 22);
    ctx.fillText('③ 틀린 이유', 12, H / 2 + 22); ctx.fillText('④ 다시 풀기', W / 2 + 12, H / 2 + 22);
  } else if (g === 'quad') { // 4분면 좌표축(수학 그래프)
    ctx.strokeStyle = '#b9c6d6';
    ctx.beginPath();
    ctx.moveTo(W / 2, 8); ctx.lineTo(W / 2, H - 8); ctx.moveTo(8, H / 2); ctx.lineTo(W - 8, H / 2);
    ctx.moveTo(W / 2, 8); ctx.lineTo(W / 2 - 5, 18); ctx.moveTo(W / 2, 8); ctx.lineTo(W / 2 + 5, 18);
    ctx.moveTo(W - 8, H / 2); ctx.lineTo(W - 18, H / 2 - 5); ctx.moveTo(W - 8, H / 2); ctx.lineTo(W - 18, H / 2 + 5);
    ctx.stroke();
    ctx.strokeStyle = '#dbe4ee'; ctx.beginPath();
    for (let x = (W / 2) % step; x < W; x += step) { ctx.moveTo(x, H / 2 - 4); ctx.lineTo(x, H / 2 + 4); }
    for (let y = (H / 2) % step; y < H; y += step) { ctx.moveTo(W / 2 - 4, y); ctx.lineTo(W / 2 + 4, y); }
    ctx.stroke();
  }
}

/** 레이저 점 추가(스토어 조작만 — 전송은 소비자 몫). */
export function addLaser(store: LaserStore, key: string, x: number, y: number) {
  let tr = store.get(key);
  if (!tr) { tr = { pts: [], color: LASER_COLOR }; store.set(key, tr); }
  tr.pts.push({ x, y, t: Date.now() });
}

/** 레이저 궤적 페이드 렌더 + 만료 점 제거. 살아있는 궤적이 있으면 true(호출측이 다음 프레임 예약). */
export function paintLasers(ctx: CanvasRenderingContext2D, store: LaserStore, v: ViewTransform): boolean {
  if (store.size === 0) return false;
  const now = Date.now();
  let alive = false;
  ctx.setTransform(v.scale, 0, 0, v.scale, v.tx, v.ty);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [id, tr] of store) {
    tr.pts = tr.pts.filter((q) => now - q.t < LASER_TTL);
    if (tr.pts.length === 0) { store.delete(id); continue; }
    alive = true;
    for (let i = 1; i < tr.pts.length; i++) {
      const a = tr.pts[i - 1], b = tr.pts[i];
      const k = Math.max(0, 1 - (now - b.t) / LASER_TTL);
      ctx.globalAlpha = 0.12 + 0.78 * k; ctx.strokeStyle = tr.color; ctx.lineWidth = 3 + 5 * k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    const head = tr.pts[tr.pts.length - 1], hk = Math.max(0, 1 - (now - head.t) / LASER_TTL);
    if (hk > 0) { ctx.globalAlpha = 0.9 * hk; ctx.fillStyle = tr.color; ctx.beginPath(); ctx.arc(head.x, head.y, 4 + 4 * hk, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  return alive;
}
