#!/usr/bin/env node
/**
 * events.json → events.generated.ts 동기화 (branding.generated.ts·api-types.ts 와 같은 생성물 규약).
 *
 *   node packages/exam-calendar/scripts/gen-events.mjs           # 생성
 *   node packages/exam-calendar/scripts/gen-events.mjs --check   # 최신인지만 확인(CI용, 다르면 exit 1)
 *
 * JSON 이 단일 소스인 이유: 티어 빌드 파이프라인(python)이 같은 파일을 읽는다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src', 'events.json');
const OUT = join(HERE, '..', 'src', 'events.generated.ts');

const KINDS = new Set(['edu_mock', 'kice_mock', 'suneung', 'apply', 'result']);
const STATUSES = new Set(['confirmed', 'provisional']);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function fail(msg) {
  console.error('!! events.json 검증 실패:', msg);
  process.exit(2);
}

function validate(cal) {
  if (cal.schema !== 1) fail(`알 수 없는 schema: ${cal.schema}`);
  if (!Array.isArray(cal.events) || cal.events.length === 0) fail('events 비어 있음');
  const ids = new Set();
  let prev = '';
  for (const ev of cal.events) {
    if (!ev.id || ids.has(ev.id)) fail(`id 누락/중복: ${ev.id}`);
    ids.add(ev.id);
    if (!KINDS.has(ev.kind)) fail(`${ev.id}: 알 수 없는 kind ${ev.kind}`);
    if (!STATUSES.has(ev.status)) fail(`${ev.id}: 알 수 없는 status ${ev.status}`);
    if (!YMD.test(ev.start)) fail(`${ev.id}: start 형식 오류 ${ev.start}`);
    if (ev.end !== null && !YMD.test(ev.end)) fail(`${ev.id}: end 형식 오류 ${ev.end}`);
    if (ev.end !== null && ev.end < ev.start) fail(`${ev.id}: end < start`);
    if (Number.isNaN(Date.parse(ev.start))) fail(`${ev.id}: 존재하지 않는 날짜 ${ev.start}`);
    if (ev.start < prev) fail(`${ev.id}: events 는 start 오름차순이어야 함`);
    prev = ev.start;
  }
}

const raw = readFileSync(SRC, 'utf8');
const cal = JSON.parse(raw);
validate(cal);

const provisional = cal.events.filter((e) => e.status === 'provisional').length;
const body = `/* 자동 생성물 — 직접 수정 금지. 원본: src/events.json
 * 재생성: npm run gen:calendar   (검사: npm run gen:calendar -- --check)
 */
import type { ExamCalendar } from './index';

export const CALENDAR: ExamCalendar = ${JSON.stringify(
  {
    schema: cal.schema,
    cycle: cal.cycle,
    timezone: cal.timezone,
    verified_against: cal.verified_against ?? null,
    verified_at: cal.verified_at ?? null,
    events: cal.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      short: e.short,
      start: e.start,
      end: e.end ?? null,
      status: e.status,
      source: e.source,
    })),
  },
  null,
  2,
)};
`;

if (process.argv.includes('--check')) {
  let cur = '';
  try {
    cur = readFileSync(OUT, 'utf8');
  } catch {
    /* 없으면 아래에서 불일치로 처리 */
  }
  if (cur !== body) {
    console.error('!! events.generated.ts 가 events.json 과 불일치 — `npm run gen:calendar` 실행 필요');
    process.exit(1);
  }
  console.log(`✅ events.generated.ts 최신 (${cal.events.length}건 · 잠정 ${provisional}건)`);
  process.exit(0);
}

writeFileSync(OUT, body, 'utf8');
console.log(`생성: ${OUT} (${cal.events.length}건 · 잠정 ${provisional}건)`);
if (provisional > 0) {
  console.log(`   ⚠ 잠정 ${provisional}건 — 공개 배포 전 평가원·대교협 공고와 대조할 것(status: confirmed).`);
}
