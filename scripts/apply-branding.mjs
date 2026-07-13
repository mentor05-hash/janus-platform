#!/usr/bin/env node
/**
 * 화이트라벨 브랜딩 적용기 — branding.config.json 을 읽어:
 *  1) apps/web/src/branding.generated.ts, apps/mobile/src/branding.generated.ts 생성(앱 코드가 import)
 *  2) 아이콘·스플래시·알림아이콘·피처그래픽 자동 생성(headless Chrome 렌더)
 * app.config.js(모바일)·theme(웹/모바일)·legal(env)은 이 생성물/설정을 참조.
 * 기능·동작 불변 — 브랜드 값만 주입.
 *
 * 사용: node scripts/apply-branding.mjs [--no-assets]
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'branding.config.json'), 'utf8'));
const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/brand/tokens.json'), 'utf8'));
const noAssets = process.argv.includes('--no-assets');

// ── 1) 앱별 생성 파일 ─────────────────────────────────────────────
const genTs = (appLabel) => `/* 자동 생성 — branding.config.json + packages/brand/tokens.json 기반. 직접 수정 금지(재생성됨).
 * 재생성: node scripts/apply-branding.mjs  (${appLabel}) */
export const branding = ${JSON.stringify(cfg, null, 2)} as const;
export const APP_NAME = ${JSON.stringify(cfg.appName)};
export const LOGO_MARK = ${JSON.stringify(cfg.logoMark)};
export const COLORS = ${JSON.stringify(cfg.colors)} as const;
/* 야누스 디자인 토큰(라이트/다크) — packages/brand/tokens.json 동기 사본 */
export const TOKENS = ${JSON.stringify({ light: tokens.light, dark: tokens.dark, font: tokens.font }, null, 2)} as const;
`;
for (const p of ['apps/web/src/branding.generated.ts', 'apps/mobile/src/branding.generated.ts']) {
  fs.writeFileSync(path.join(ROOT, p), genTs(p));
  console.log('생성:', p);
}

if (noAssets) { console.log('에셋 생략(--no-assets).'); process.exit(0); }

// ── 2) 에셋 렌더(headless Chrome) ────────────────────────────────
const C = cfg.colors;
// 야누스 아치문 마크(스트로크) — packages/brand/logo/janus-arch-stroke.svg 와 동일 지오메트리
const archSvg = (size, stroke) => `<svg width="${size}" height="${size}" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="10" stroke="${stroke}">
<path d="M18 74V43C18 27.5 30.2 15 48 15C65.8 15 78 27.5 78 43V52"/><path d="M14 79H82"/></g></svg>`;
const iconHtml = `<!doctype html><meta charset=utf-8><style>html,body{margin:0}
.i{width:1024px;height:1024px;position:relative;overflow:hidden;background:radial-gradient(120% 120% at 30% 20%,${C.primary500},${C.primary} 55%,${C.primaryDark} 100%)}
.m{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.d{position:absolute;width:90px;height:90px;border-radius:50%;background:${C.accent};bottom:230px;right:230px}</style>
<div class=i><div class=m>${archSvg(620, '#fff')}</div><div class=d></div></div>`;
const logoHtml = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:transparent}
.l{width:512px;height:512px;display:flex;align-items:center;justify-content:center}</style>
<div class=l>${archSvg(430, '#fff')}</div>`;
const featHtml = `<!doctype html><meta charset=utf-8><style>html,body{margin:0}
.f{width:1024px;height:500px;display:flex;align-items:center;gap:52px;padding:0 72px;box-sizing:border-box;background:radial-gradient(130% 130% at 15% 10%,${C.primary500},${C.primary} 52%,${C.primaryDark} 100%);font-family:-apple-system,'Noto Sans KR',sans-serif;color:#fff;position:relative;overflow:hidden}
.b{width:236px;height:236px;flex:0 0 auto;border-radius:52px;position:relative;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${C.primary500},${C.primaryDark});box-shadow:0 24px 60px rgba(0,0,0,.35)}
.b .d{position:absolute;width:34px;height:34px;border-radius:50%;background:${C.accent};right:44px;bottom:48px}
.n{font-size:66px;font-weight:800;letter-spacing:-.02em}.t{font-size:27px;font-weight:600;opacity:.9;margin-top:16px}
.g{position:absolute;width:520px;height:520px;border-radius:50%;background:rgba(207,154,58,.14);right:-160px;top:-160px}</style>
<div class=f><div class=g></div><div class=b>${archSvg(150, '#fff')}<div class=d></div></div>
<div><div class=n>${cfg.appName}</div><div class=t>${cfg.tagline}</div></div></div>`;

const OUTM = path.join(ROOT, 'apps/mobile/assets');
const OUTS = path.join(ROOT, 'apps/mobile/store');
const jobs = [
  { html: iconHtml, file: path.join(OUTM, 'icon.png'), w: 1024, h: 1024, bg: C.primary },
  { html: iconHtml, file: path.join(OUTM, 'adaptive-icon.png'), w: 1024, h: 1024, bg: C.primary },
  { html: logoHtml, file: path.join(OUTM, 'splash-icon.png'), w: 512, h: 512, transparent: true },
  { html: logoHtml, file: path.join(OUTM, 'notification-icon.png'), w: 96, h: 96, transparent: true },
  { html: featHtml, file: path.join(OUTS, 'feature-graphic.png'), w: 1024, h: 500, bg: C.primary },
];

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) { console.error('Chrome 없음 — 에셋 생략. 코드에서 CHROME 경로 수정하거나 --no-assets 사용.'); process.exit(0); }
const WebSocket = require('ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prof = '/tmp/chrome-branding';
fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9250', `--user-data-dir=${prof}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let page = null;
for (let i = 0; i < 30; i++) { await sleep(500); try { const j = await (await fetch('http://localhost:9250/json')).json(); page = j.find((t) => t.type === 'page'); if (page?.webSocketDebuggerUrl) break; } catch { /* wait */ } }
if (!page) { console.error('CDP 연결 실패'); chrome.kill('SIGKILL'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2e8 });
let id = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
await new Promise((r) => ws.on('open', r));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await send('Page.enable');
for (const j of jobs) {
  await send('Emulation.setDeviceMetricsOverride', { width: j.w, height: j.h, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', j.transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : { color: hexRgb(j.bg) });
  await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(j.html) });
  await sleep(650);
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: j.w, height: j.h, scale: 1 } });
  fs.writeFileSync(j.file, Buffer.from(r.result.data, 'base64'));
  console.log('에셋:', path.relative(ROOT, j.file), `${j.w}x${j.h}`);
}
ws.close(); chrome.kill('SIGKILL'); await sleep(200);
console.log('완료. (모바일은 app.config.js 가 branding.config.json 을 읽어 이름·색·식별자 반영)');

function hexRgb(hex) { const h = hex.replace('#', ''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }; }
