#!/usr/bin/env node
/**
 * 검증 게이트 음성 대조(negative control) — **게이트가 실제로 실패할 수 있는지** 증명한다.
 *
 *   node ops/placement/tests/gate_negative_sim.mjs
 *
 * 왜 필요한가: "통과"만 확인하는 테스트는 게이트가 통째로 죽어 있어도 통과한다.
 * 그래서 여기서는 **일부러 망가뜨린 빌드**를 넣고 `tier_verify.py` 가 비-0으로 죽는지,
 * 그리고 누락된 표식을 정확히 지목하는지 본다. 하나라도 '조용히 통과'하면 실패 처리.
 *
 * 검사:
 *  1) 기준선 — 3기능 전부 ON → verify exit 0.
 *  2) A4/A6/A7 를 하나씩 끈 빌드 → verify 가 **비-0** + 해당 표식 누락을 지목.
 *  3) 금지 패턴(저작권 토큰)을 산출물에 심으면 → verify 가 **비-0**(forbidden 검출 살아있음).
 *  4) 빈 디렉토리를 검증시키면 → **비-0**(검사 대상 0건을 통과로 처리하지 않음).
 *
 * 하나라도 실패하면 비-0 종료(CI 게이트용).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const FIXTURE = join(REPO, 'ops', 'placement', 'fixtures', 'master_sample.html');
const BUILD = join(REPO, 'ops', 'placement', 'tier_build.py');
const VERIFY = join(REPO, 'ops', 'placement', 'tier_verify.py');
const CONFIG = join(REPO, 'ops', 'placement', 'tiers.config.json');

const MIN_CHECKS = 8; // 실측 단언 수. 이 아래로 실행되면 '공허한 통과'로 간주하고 실패시킨다.
let checksRun = 0;
let failures = 0;
function check(label, ok, detail) {
  checksRun++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const ENV = { ...process.env, JANUS_ALLOWED_HOSTS: 'janus.example', JANUS_CANONICAL_ORIGIN: 'https://janus.example' };

/** 플래그를 끈 설정으로 무료판을 빌드하고 산출 디렉토리를 돌려준다. */
function buildFree(disableFlag) {
  const dir = mkdtempSync(join(tmpdir(), 'janus-gate-neg-'));
  const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
  if (disableFlag) cfg.tiers.free[disableFlag] = false;
  const cfgPath = join(dir, 'tiers.json');
  writeFileSync(cfgPath, JSON.stringify(cfg), 'utf8');
  execFileSync('python3', [BUILD, '--src', FIXTURE, '--tier', 'free', '--out', dir, '--config', cfgPath],
    { env: ENV, stdio: 'pipe' });
  return dir;
}

function verify(target) {
  const r = spawnSync('python3', [VERIFY, target, '--tier', 'free'], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

console.log('검증 게이트 음성 대조 — 게이트가 실제로 실패하는지 증명');
console.log('');

const dirs = [];
try {
  console.log('[1) 기준선 — 3기능 전부 ON]');
  {
    const d = buildFree(null); dirs.push(d);
    const v = verify(join(d, 'free'));
    check('verify 통과(exit 0)', v.code === 0, `exit=${v.code}`);
    check('A4·A6·A7 표식 3개 모두 확인됨',
      ['[야누스 A4]', '[야누스 A6]', '[야누스 A7]'].every((m) => v.out.includes(`필수 표식 존재: "${m}"`)));
  }

  console.log('\n[2) 기능을 하나씩 끄면 게이트가 잡아내는가]');
  for (const [flag, marker] of [['build_probe', '[야누스 A4]'], ['mirror_guard', '[야누스 A6]'], ['exam_dday', '[야누스 A7]']]) {
    const d = buildFree(flag); dirs.push(d);
    const v = verify(join(d, 'free'));
    const named = v.out.includes(`필수 표식 누락: "${marker}"`);
    check(`${flag}=false → verify 실패(비-0) + ${marker} 누락 지목`,
      v.code !== 0 && named, `exit=${v.code} · 지목=${named}`);
  }

  console.log('\n[3) 금지 패턴 검출이 살아있는가]');
  {
    const d = buildFree(null); dirs.push(d);
    const f = join(d, 'free', 'master_sample.html');
    writeFileSync(f, readFileSync(f, 'utf8').replace('</body>', '<!-- esteacher --></body>'), 'utf8');
    const v = verify(join(d, 'free'));
    check('저작권 토큰을 심으면 verify 실패', v.code !== 0 && v.out.includes('금지 패턴 검출'), `exit=${v.code}`);
  }

  console.log('\n[4) 검사 대상 0건을 통과로 처리하지 않는가]');
  {
    const d = mkdtempSync(join(tmpdir(), 'janus-gate-empty-')); dirs.push(d);
    mkdirSync(join(d, 'free'), { recursive: true });
    const v = verify(join(d, 'free'));
    check('빈 디렉토리 → 비-0(공허한 통과 없음)', v.code !== 0, `exit=${v.code}`);
  }

  console.log('\n[5) 단언이 실제로 실행됐는가]');
  check(`단언 ${checksRun + 1}건 실행(최소 ${MIN_CHECKS})`, checksRun + 1 >= MIN_CHECKS, `${checksRun + 1}건`);
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

console.log(`\n결과: ${failures === 0 ? '✅ 전체 통과 — 게이트 살아있음' : `❌ 실패 ${failures}건`}`);
process.exit(failures === 0 ? 0 : 1);
