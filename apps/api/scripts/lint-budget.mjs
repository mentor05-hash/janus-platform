#!/usr/bin/env node
/**
 * 린트 예산(ratchet) 게이트 — 남은 오류가 **늘지 않는지**만 본다.
 *
 * 왜 이렇게 하는가: 이 저장소의 린트 스텝은 오랫동안 `continue-on-error: true` 였다.
 * 실패해도 CI 가 초록이라 아무도 보지 않았고, 그 사이 오류가 3,391건까지 쌓였다.
 * 게이트가 아니라 장식이었다.
 *
 * 전부 고친 뒤에 켜자는 접근은 실패한다 — 남은 오류는 대부분 `no-unsafe-*` 계열이라
 * 타입을 제대로 붙여야 사라지고, 그건 한 번에 할 수 있는 작업이 아니다. 그렇다고 규칙을
 * warn 으로 낮추면 **새 코드에도 규칙이 사라진다** — 장식이 이름만 바꿔 돌아온다.
 *
 * 그래서 총량 상한(BUDGET)을 두고 **넘으면 실패**시킨다. 부채는 그대로 보이되
 * 늘어나지는 못한다. 줄이면 예산도 함께 낮춘다(줄었는데 안 낮추면 그만큼 다시 늘 수 있다).
 *
 * 포맷(prettier)은 이 예산과 별개로 `format:check` 가 **0 을 강제**한다 —
 * 포맷은 기계가 전부 고칠 수 있으므로 부채로 남길 이유가 없다.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * 허용 오류 수. **줄었으면 이 값을 낮춰서 커밋할 것** — 스크립트가 새 값을 알려 준다.
 * 2026-07-27 기준 187 (prettier 3,129건 정리 후 남은 타입 안전성 부채).
 */
const BUDGET = 187;

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');

let raw;
try {
  raw = execFileSync(
    'npx',
    ['eslint', 'src/**/*.ts', '-f', 'json'],
    { cwd: apiDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
} catch (e) {
  // eslint 는 오류가 있으면 exit 1 이다 — 출력은 stdout 에 그대로 있다.
  raw = e.stdout;
  if (!raw) {
    console.error('✗ eslint 실행 실패:', e.message);
    process.exit(2);
  }
}

const results = JSON.parse(raw);
let errors = 0;
let warnings = 0;
const byRule = new Map();
const byFile = new Map();

for (const f of results) {
  for (const m of f.messages) {
    if (m.severity === 2) {
      errors++;
      const rule = m.ruleId ?? '(파서)';
      byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
      const rel = f.filePath.replace(`${apiDir}/`, '');
      byFile.set(rel, (byFile.get(rel) ?? 0) + 1);
    } else {
      warnings++;
    }
  }
}

const top = (map, n) =>
  [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

if (errors > BUDGET) {
  console.error(`✗ 린트 오류 ${errors}건 — 예산 ${BUDGET} 초과 (+${errors - BUDGET})`);
  console.error('\n  규칙별 상위:');
  for (const [rule, n] of top(byRule, 5)) console.error(`    ${String(n).padStart(4)} ${rule}`);
  console.error('\n  파일별 상위:');
  for (const [file, n] of top(byFile, 5)) console.error(`    ${String(n).padStart(4)} ${file}`);
  console.error('\n  새로 만든 오류를 고치세요. 기존 부채를 건드릴 필요는 없습니다.');
  process.exit(1);
}

if (errors < BUDGET) {
  console.log(`✓ 린트 오류 ${errors}건 (예산 ${BUDGET}) · 경고 ${warnings}건`);
  console.log(`  부채가 ${BUDGET - errors}건 줄었습니다 — scripts/lint-budget.mjs 의 BUDGET 을 ${errors} 로 낮춰 주세요.`);
  process.exit(0);
}

console.log(`✓ 린트 오류 ${errors}건 = 예산 ${BUDGET} · 경고 ${warnings}건`);
