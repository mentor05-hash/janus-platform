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
 *
 * 2026-07-27  187  prettier 3,129건 정리 후 남은 타입 안전성 부채
 * 2026-07-29   70  아래 네 갈래로 정리. 규칙을 끄거나 무시주석을 붙여 줄인 것은 없다.
 *   · `no-base-to-string` 24 → `common/text/to-text.ts` 의 `toText()`.
 *     `String(unknown)` 은 객체가 오면 조용히 `"[object Object]"` 가 된다 — 엑셀 파싱·PG
 *     웹훅·Prisma JSON 처럼 타입을 모르는 값에 쓰이고 있었고, 그 값이 DB·CSV·알림 문구로
 *     나갔다. 규칙이 잡던 건 스타일이 아니라 **잠재 결함**이라 고치는 쪽이 맞았다.
 *   · `require-await` 33 → mock·stub 어댑터의 `async` 제거 + `Promise.resolve` 반환.
 *     인터페이스를 맞추려 async 만 붙어 있던 자리다. 예외를 던지던 하나(`interpretGateway`)는
 *     `Promise.reject` 로 바꿨다 — 동기 throw 로 바뀌면 `.catch()` 폴백을 지나쳐 버린다.
 *   · `no-unsafe-*` 47 → `Record<string, any>`·`getRequest()` 같은 any 원천에 타입을 붙였다
 *     (`material.service.shape` · `metrics.interceptor` · `jwt.verify<T>`).
 *   · 미사용 import 6건 삭제 + `_` 접두사 규칙화(`argsIgnorePattern`) — 인터페이스 구현체는
 *     인자를 지울 수 없으므로 접두사로 의도를 표시하던 관례를 설정에 반영했다.
 *
 * 남은 70건은 대부분 `no-unsafe-*` 이고, 절반 이상이 스펙 파일이다.
 */
const BUDGET = 70;

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
