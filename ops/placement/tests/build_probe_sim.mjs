#!/usr/bin/env node
/**
 * A4 배포 감지 프로브 + 오류 링버퍼 시뮬 테스트 — 브라우저 없이 동작을 재현한다.
 *
 *   node ops/placement/tests/build_probe_sim.mjs
 *
 * 하는 일:
 *  1) 픽스처로 무료판을 빌드하고 [야누스 A4] 스니펫만 뽑아 가짜 DOM 위에서 실행.
 *  2) 사이드카 매니페스트가 **같은** build-id → 배너 없음 / **다른** build-id → "새 버전이 있습니다" 배너.
 *  3) 오류 링버퍼가 최근 30건만 유지하고, 오래된 것부터 버리는지.
 *  4) 전송 훅이 기본 스텁(null·미전송)이고, 함수를 물리면 그때부터 넘어오는지.
 *  5) auto_reload_sec=0 이면 자동 리로드가 없는지(입력 유실 방지).
 *
 * 하나라도 실패하면 비-0 종료(CI 게이트용).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const FIXTURE = join(REPO, 'ops', 'placement', 'fixtures', 'master_sample.html');

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const flush = () => new Promise((r) => setImmediate(r));

/** 무료판을 빌드해 [야누스 A4] 스니펫 본문과 build-id 를 돌려준다. */
function buildAndExtract() {
  const out = mkdtempSync(join(tmpdir(), 'janus-probe-sim-'));
  try {
    execFileSync(
      'python3',
      [join(REPO, 'ops', 'placement', 'tier_build.py'), '--src', FIXTURE, '--tier', 'free', '--out', out],
      { env: { ...process.env, JANUS_ALLOWED_HOSTS: '', JANUS_CANONICAL_ORIGIN: '' }, stdio: 'pipe' },
    );
    const html = readFileSync(join(out, 'free', 'master_sample.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(out, 'free', 'janus-build.json'), 'utf8'));
    const start = html.indexOf('<script>\n/*[야누스 A4]');
    if (start < 0) throw new Error('산출물에 [야누스 A4] 스니펫이 없음');
    const end = html.indexOf('</script>', start);
    const metaHit = html.includes(`<meta name="janus-build-id" content="${manifest.buildId}">`);
    return { snippet: html.slice(html.indexOf('>', start) + 1, end), manifest, metaHit };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** 스니펫을 가짜 DOM 위에서 실행하고, 조작 손잡이를 돌려준다. */
function boot(snippet, serverBuildId) {
  const log = { reloads: 0, warns: [], nodes: [] };
  const listeners = { window: {}, document: {} };
  const mkNode = () => ({
    style: { cssText: '' }, attrs: {}, children: [], textContent: '', innerHTML: '',
    onclick: null,
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); log.nodes.push(c); },
  });
  const body = mkNode();
  const ctx = {
    Math, Date, Promise, JSON, String, Number, Boolean, Array, Error, setImmediate,
    console: { warn: (m) => log.warns.push(String(m)), log: () => {} },
    location: { reload: () => { log.reloads++; } },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ buildId: serverBuildId, tier: 'free' }) }),
    setInterval: (fn) => { listeners.interval = fn; return 1; },
    setTimeout: (fn) => { listeners.timeouts = (listeners.timeouts || []).concat(fn); return 1; },
    document: {
      hidden: false,
      body,
      documentElement: mkNode(),
      createElement: mkNode,
      addEventListener: (t, fn) => { listeners.document[t] = fn; },
    },
  };
  ctx.window = ctx;
  ctx.window.addEventListener = (t, fn) => { (listeners.window[t] = listeners.window[t] || []).push(fn); };
  runInContext(snippet, createContext(ctx));
  return { ctx, log, body, listeners,
    fire: (type, ev) => (listeners.window[type] || []).forEach((fn) => fn(ev)),
    probe: () => listeners.interval && listeners.interval() };
}

const { snippet, manifest, metaHit } = buildAndExtract();

console.log('A4 배포 감지 프로브 + 오류 링버퍼 시뮬 테스트');
console.log(`  빌드 build-id: ${manifest.buildId} · 사이드카: janus-build.json`);
console.log('');

console.log('[build-id 주입]');
check('meta[name=janus-build-id] 가 사이드카와 같은 값', metaHit, manifest.buildId);

console.log('\n[배포 감지]');
{
  const a = boot(snippet, manifest.buildId); // 서버도 같은 배포
  a.probe();
  await flush(); await flush();
  const banner = a.log.nodes.find((n) => n.attrs['data-janus-update']);
  check('같은 build-id → 배너 없음', !banner && a.log.warns.length === 0);
}
let bannerNode;
{
  const b = boot(snippet, 'newbuild9999'); // 새 배포가 올라감
  b.probe();
  await flush(); await flush();
  bannerNode = b.log.nodes.find((n) => n.attrs['data-janus-update']);
  check('다른 build-id → 배너 생성', !!bannerNode);
  const text = bannerNode ? bannerNode.children.map((c) => c.innerHTML || c.textContent).join(' ') : '';
  check('배너 문구에 "새 버전이 있습니다"', text.includes('새 버전이 있습니다'));
  check('새로고침 버튼 존재', bannerNode ? bannerNode.children.some((c) => c.textContent === '새로고침') : false);
  check('콘솔에 감지 로그', b.log.warns.some((w) => w.includes('새 배포 감지')), b.log.warns[0]);

  const btn = bannerNode && bannerNode.children.find((c) => c.textContent === '새로고침');
  check('auto_reload_sec=0 → 자동 리로드 없음(버튼으로만)', b.log.reloads === 0);
  if (btn) { btn.onclick(); check('새로고침 버튼 클릭 → location.reload()', b.log.reloads === 1); }

  b.probe(); await flush(); await flush();
  const count = b.log.nodes.filter((n) => n.attrs['data-janus-update']).length;
  check('배너는 한 번만(중복 생성 없음)', count === 1, `${count}개`);
}

console.log('\n[오류 링버퍼]');
{
  const c = boot(snippet, manifest.buildId);
  check('전송 훅 기본값은 스텁(null · 미전송)', c.ctx.window.__JANUS_ERR_SINK === null);

  const got = [];
  c.ctx.window.__JANUS_ERR_SINK = (e) => got.push(e);

  c.fire('error', { message: '동기 오류', filename: 'a.js', lineno: 3, colno: 1, error: { stack: 'stack A' } });
  c.fire('unhandledrejection', { reason: { message: '프로미스 거부', stack: 'stack B' } });
  c.fire('error', { target: { src: 'https://cdn.example/none.js' } });
  for (let i = 0; i < 35; i++) c.fire('error', { message: `flood ${i}` });

  const buf = c.ctx.window.__janusErrors();
  check('링버퍼 상한 30 유지', buf.length === 30, `${buf.length}건(38건 투입)`);
  // 38건 투입 → 앞 8건(동기오류·거부·자산실패·flood 0~4) 폐기 → 남은 가장 오래된 것은 flood 5
  check('오래된 것부터 폐기(가장 오래된 = flood 5)', buf[0].msg === 'flood 5', buf[0].msg);
  check('가장 최근 = flood 34', buf[buf.length - 1].msg === 'flood 34', buf[buf.length - 1].msg);
  check('전송 훅에는 38건 모두 전달(버퍼와 별개)', got.length === 38, `${got.length}건`);
  const types = new Set(got.map((e) => e.type));
  check('세 종류 모두 수집(error·rejection·resource)',
    types.has('error') && types.has('rejection') && types.has('resource'), [...types].join(','));
  check('자산 로드 실패는 src 기록', got.some((e) => e.type === 'resource' && e.src === 'https://cdn.example/none.js'));
  check('스택은 500자로 절단', got.every((e) => !e.stack || e.stack.length <= 500));
  check('__janusErrors() 는 복사본 반환(외부 변조 불가)',
    (() => { const s = c.ctx.window.__janusErrors(); s.push({}); return c.ctx.window.__janusErrors().length === 30; })());
}

console.log(`\n결과: ${failures === 0 ? '✅ 전체 통과' : `❌ 실패 ${failures}건`}`);
process.exit(failures === 0 ? 0 : 1);
