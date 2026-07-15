#!/usr/bin/env node
/**
 * 마이그레이션 순번 정합 검사(DB 불필요) — apply-migrations 는 파일명 사전순 적용이라
 * 순번 갭·중복·형식 오류가 조용히 순서를 깨뜨릴 수 있다. CI·프리커밋에서 빠르게 게이트.
 * 규칙: 파일은 NNNN_이름.sql, 4자리 0패딩, 0001부터 1씩 연속, 번호 중복 금지.
 * 통과 → exit 0, 위반 → 목록 출력 후 exit 1.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const errors = [];
const seen = new Map(); // num → filename

for (const f of files) {
  const m = /^(\d{4})_[^/]+\.sql$/.exec(f);
  if (!m) { errors.push(`형식 오류(NNNN_이름.sql 아님): ${f}`); continue; }
  const n = Number(m[1]);
  if (seen.has(n)) errors.push(`번호 중복 ${m[1]}: ${seen.get(n)} ↔ ${f}`);
  else seen.set(n, f);
}

const nums = [...seen.keys()].sort((a, b) => a - b);
if (nums.length) {
  if (nums[0] !== 1) errors.push(`시작 번호가 0001 이 아님: ${String(nums[0]).padStart(4, '0')}`);
  for (let i = 1; i < nums.length; i++) {
    const gap = nums[i] - nums[i - 1];
    if (gap > 1) {
      const miss = [];
      for (let k = nums[i - 1] + 1; k < nums[i]; k++) miss.push(String(k).padStart(4, '0'));
      errors.push(`갭: ${String(nums[i - 1]).padStart(4, '0')} → ${String(nums[i]).padStart(4, '0')} (누락 ${miss.join(', ')})`);
    }
  }
}

if (errors.length) {
  console.error('✗ 마이그레이션 순번 검사 실패:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ 마이그레이션 순번 정합: ${files.length}개(0001~${String(nums[nums.length - 1]).padStart(4, '0')}) 갭·중복 없음`);
