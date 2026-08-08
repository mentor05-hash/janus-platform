#!/usr/bin/env node
/**
 * A6 미러 감지 스니펫 시뮬 테스트 — 브라우저 없이 호스트별 판정을 재현한다.
 *
 *   node ops/placement/tests/mirror_guard_sim.mjs
 *
 * 하는 일:
 *  1) 픽스처로 무료판을 빌드(JANUS_ALLOWED_HOSTS/JANUS_CANONICAL_ORIGIN 를 테스트값으로 주입).
 *  2) 산출 HTML 에서 [야누스 A6] 스니펫만 뽑아 가짜 DOM/location 위에서 실행.
 *  3) 허용 호스트 → 무반응, 비허용 호스트 → 안내 오버레이 + 원본 리다이렉트 를 단언.
 *  4) 원본 주소 미설정(도메인 미결) 상태에서는 **안내만 하고 리다이렉트하지 않음**을 단언.
 *  5) djb2 해시가 파이썬(빌드)과 JS(런타임)에서 같은 값인지 교차 확인.
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

const ALLOWED = ['janus.example', 'www.janus.example'];
const CANONICAL = 'https://janus.example';

const MIN_CHECKS = 23; // 실측 단언 수. 이 아래면 '공허한 통과'로 보고 실패시킨다(단언이 조용히 건너뛰어진 경우).
let checksRun = 0;
let failures = 0;
function check(label, ok, detail) {
  checksRun++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** 무료판을 빌드해 [야누스 A6] 스니펫 본문만 돌려준다. */
function buildAndExtract(env) {
  const out = mkdtempSync(join(tmpdir(), 'janus-mirror-sim-'));
  try {
    execFileSync(
      'python3',
      [join(REPO, 'ops', 'placement', 'tier_build.py'), '--src', FIXTURE, '--tier', 'free', '--out', out],
      { env: { ...process.env, ...env }, stdio: 'pipe' },
    );
    const html = readFileSync(join(out, 'free', 'master_sample.html'), 'utf8');
    const start = html.indexOf('<script>\n/*[야누스 A6]');
    if (start < 0) throw new Error('산출물에 [야누스 A6] 스니펫이 없음');
    const end = html.indexOf('</script>', start);
    return html.slice(html.indexOf('>', start) + 1, end);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** 가짜 DOM + location 위에서 스니펫을 실행하고 무슨 일이 있었는지 기록한다. */
function run(snippet, hostname) {
  const log = { redirected: null, notice: false, warns: [], countdown: [] };
  const el = () => {
    const node = {
      style: { cssText: '' },
      attrs: {},
      children: [],
      textContent: '',
      innerHTML: '',
      setAttribute(k, v) {
        this.attrs[k] = v;
        if (k === 'data-janus-mirror-notice') log.notice = true;
      },
      appendChild(c) {
        this.children.push(c);
      },
      querySelector(sel) {
        // 오버레이 안의 카운트다운 자리 — innerHTML 문자열에 있으면 스텁을 준다.
        if (this.innerHTML.includes('data-janus-mirror-countdown')) {
          return {
            set textContent(v) {
              log.countdown.push(v);
            },
          };
        }
        return null;
      },
    };
    return node;
  };
  // setTimeout 은 즉시 실행(카운트다운을 동기적으로 소진) — 무한루프 방지 상한을 둔다.
  let ticks = 0;
  const ctx = {
    Math,
    console: { warn: (m) => log.warns.push(String(m)), log: () => {} },
    location: {
      hostname,
      pathname: '/baechi/',
      search: '',
      replace(url) {
        log.redirected = url;
      },
    },
    setTimeout: (fn) => {
      if (++ticks > 50) return 0;
      fn();
      return 0;
    },
    document: { createElement: el, body: el(), documentElement: el() },
  };
  ctx.window = ctx;
  runInContext(snippet, createContext(ctx));
  return log;
}

console.log('A6 미러 감지 시뮬 테스트');
console.log(`  허용 호스트(ENV 주입): ${ALLOWED.join(', ')}`);
console.log(`  원본(ENV 주입): ${CANONICAL}`);
console.log('');

// ── 1) 허용/비허용 판정 ────────────────────────────────────────────────
const snippet = buildAndExtract({
  JANUS_ALLOWED_HOSTS: ALLOWED.join(','),
  JANUS_CANONICAL_ORIGIN: CANONICAL,
});
// 원본 주소(CANONICAL)는 리다이렉트 대상이라 당연히 들어간다. 숨겨야 하는 건 **허용 목록** 자체다.
check('허용 목록이 평문으로 남지 않음(해시만 주입)', !snippet.includes('www.janus.example'));

console.log('\n[허용 호스트]');
for (const host of [...ALLOWED, 'JANUS.EXAMPLE']) {
  const r = run(snippet, host.toLowerCase());
  check(`${host} → 통과`, r.notice === false && r.redirected === null, `안내 ${r.notice} · 이동 ${r.redirected}`);
}

console.log('\n[비허용 호스트 — 미러 시뮬]');
for (const host of ['janus-mirror.example', 'baechi.cheap-clone.io', 'evil.pages.dev', '127.0.0.1']) {
  const r = run(snippet, host);
  const ok = r.notice === true && r.redirected === CANONICAL;
  check(`${host} → 안내 + 원본 이동`, ok, `이동=${r.redirected} · 경고="${r.warns[0] ?? ''}"`);
  if (r.countdown.length) console.log(`       카운트다운: ${r.countdown.join(' / ')}`);
}

console.log('\n[판정 불가 — 통과시켜야 하는 경우]');
check('빈 hostname(file:// 등) → 무반응', (() => {
  const r = run(snippet, '');
  return r.notice === false && r.redirected === null;
})());

// ── 2) 원본 주소 미설정(도메인 미결) ──────────────────────────────────
console.log('\n[원본 주소 미설정 — 도메인 미결 상태]');
const noHome = buildAndExtract({ JANUS_ALLOWED_HOSTS: ALLOWED.join(','), JANUS_CANONICAL_ORIGIN: '' });
check('원본 미설정 빌드엔 평문 호스트가 하나도 없음', !ALLOWED.some((h) => noHome.includes(h)));
{
  const r = run(noHome, 'janus-mirror.example');
  check('비허용 호스트 → 안내만, 리다이렉트 없음', r.notice === true && r.redirected === null,
    `경고="${r.warns[0] ?? ''}"`);
}

// ── 3) 허용 목록 미설정 → 전면 no-op ──────────────────────────────────
console.log('\n[허용 목록 미설정 — 무해 no-op]');
const noList = buildAndExtract({ JANUS_ALLOWED_HOSTS: '', JANUS_CANONICAL_ORIGIN: '' });
{
  const r = run(noList, 'anything.example');
  check('어떤 호스트에서도 무반응', r.notice === false && r.redirected === null && r.warns.length === 0);
}

// ── 4) djb2 파이썬 ↔ JS 교차 확인 ─────────────────────────────────────
console.log('\n[djb2 해시 파이썬 ↔ JS 일치]');
{
  const hosts = ['janus.example', 'www.janus.example', '127.0.0.1', 'localhost', '한글.테스트'];
  const py = JSON.parse(
    execFileSync('python3', [
      '-c',
      'import sys,json;sys.path.insert(0,"ops/placement");' +
        'from tier_build import djb2;print(json.dumps([djb2(h) for h in json.loads(sys.argv[1])]))',
      JSON.stringify(hosts),
    ], { cwd: REPO }).toString(),
  );
  const js = hosts.map((s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
    return h;
  });
  check(`${hosts.length}개 호스트 해시 일치`, JSON.stringify(py) === JSON.stringify(js), `py=${py} js=${js}`);
}

// ── 4-1) 와일드카드 `*.` — Pages 미리보기처럼 앞 라벨이 바뀌는 주소 ──────
console.log('\n[와일드카드 허용 — `*.pv.example`]');
const wild = buildAndExtract({
  JANUS_ALLOWED_HOSTS: 'janus.example,*.pv.example',
  JANUS_CANONICAL_ORIGIN: CANONICAL,
});
check('와일드카드 빌드에도 평문 도메인이 남지 않음', !wild.includes('pv.example'));
for (const host of ['pv.example', 'proj.pv.example', 'abc123.proj.pv.example']) {
  const r = run(wild, host);
  check(`${host} → 통과(기저 도메인·하위 도메인)`, r.notice === false && r.redirected === null);
}
check('정확일치 항목도 그대로 통과', (() => {
  const r = run(wild, 'janus.example');
  return r.notice === false && r.redirected === null;
})());
// 접미사 대조가 라벨 경계를 무시하면 아래가 통과해 버린다 — 그게 바로 위험한 오탐이다.
for (const host of ['pv.example.evil.io', 'notpv.example', 'evil.io']) {
  const r = run(wild, host);
  check(`${host} → 차단(경계 넘는 유사 도메인)`, r.notice === true, `이동=${r.redirected}`);
}

// ── 5) 공허한 통과 방지 ────────────────────────────────────────────────
// 스니펫 추출이 빈 문자열이거나 루프가 0회 돌아도 failures 는 0 이라 '통과'로 보인다.
// 그래서 ①스니펫이 실물인지 ②단언이 실제로 다 돌았는지를 마지막에 못박는다.
console.log('\n[공허한 통과 방지]');
check('추출한 스니펫이 실물(허용 판정 로직 포함)',
  snippet.length > 400 && snippet.includes('Math.imul') && snippet.includes('data-janus-mirror-notice'),
  `${snippet.length}자`);
check(`단언 ${checksRun + 1}건 실행(최소 ${MIN_CHECKS})`, checksRun + 1 >= MIN_CHECKS, `${checksRun + 1}건`);

console.log(`\n결과: ${failures === 0 ? '✅ 전체 통과' : `❌ 실패 ${failures}건`}`);
process.exit(failures === 0 ? 0 : 1);
