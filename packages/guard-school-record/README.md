# @mentoring/guard-school-record — 생기부 가드

학교생활기록부(생기부) 업로드를 **감지·차단**하는 공용 모듈. 업로드 파이프라인(API·웹) 어디서든 동일 규칙으로 호출한다.

## 핵심 원칙 — 무취급(무영속)

- 판정 함수는 **바이트(`Uint8Array`/`Buffer`)를 받아 `boolean + 사유` 만 반환**한다.
- 원본·추출 텍스트를 **파일·DB·로그 등 어떤 경로에도 영속화하지 않는다.** 모듈 내부에 `fs` 쓰기·DB insert·내용 로깅이 **0건**이다(`src/guard.ts` 상단 불변식 주석 참고).
- 바이트/텍스트는 함수 지역 스코프에서만 훑고 즉시 폐기된다.

## 3단 판정 파이프라인 (short-circuit)

| 단계 | 근거 | 사유 코드 |
|---|---|---|
| 1. 파일명 패턴 | `filename`이 정책 패턴에 일치 | `SR_FILENAME` |
| 2. 서식 키워드 임계 | 생기부 고유 표제어가 `keywordThreshold` 이상 검출 | `SR_KEYWORD` |
| 3. 비전 분류 훅 | 이미지/PDF를 주입된 분류기가 생기부로 확신 판정(`yes`) | `SR_VISION` |
| 3. 비전 분류 훅 | 분류기가 판단 유보(`unsure`) → **무취급 기본값에 따라 차단** + 이의 안내(§4-b) | `SR_UNSURE` |

> 비전 분류기(§5 3단)는 `yes/no/unsure` 라벨만 반환한다: `yes`→차단(SR_VISION), `no`→통과, `unsure`→**차단**(SR_UNSURE, 보수 원칙). 판단이 애매하면 받지 않는다(§1-1).

## 정책 스키마 (`guard.schoolRecord.*`)

```ts
{
  enabled: boolean,          // 가드 on/off (기본 true)
  filenamePatterns: string[],// 정규식 소스 문자열 (기본: 학교생활기록부/생활기록부/생기부/학생부 …)
  keywordThreshold: number,  // 차단에 필요한 '서로 다른' 키워드 최소 개수 (기본 2)
  llmCheck: boolean,         // 이미지/스캔 문서 비전 단계 허용 (기본 false)
}
```

## 사용

```ts
import { inspectForSchoolRecord } from '@mentoring/guard-school-record';

const verdict = await inspectForSchoolRecord(
  { filename, mimeType, bytes },      // 입력(메모리 상에서만 스캔)
  serverPolicy.guard.schoolRecord,     // 부분 정책 → 기본값 위에 병합
  { classifyImage: llmVisionAdapter }, // 비전 분류기(LlmProvider 어댑터) 주입 — 선택
);

if (verdict.blocked) {
  // verdict.reason: 'SR_FILENAME' | 'SR_KEYWORD' | 'SR_VISION' | 'SR_UNSURE'
  // 업로드 거부. 원본은 저장하지 않는다. (SR_UNSURE는 §4-b 이의 경로를 강조 노출)
}
```

동기 컨텍스트에서는 비전 단계를 뺀 `inspectForSchoolRecordSync(input, policy)` 사용.

## 빌드 (Node 런타임 소비용)

apps/api 등 **컴파일 후 실행(`node dist/main.js`)** 하는 소비자는 이 모듈의 JS 산출물이 필요하다. `main`→`dist/index.js`(CommonJS)·`types`→`dist/index.d.ts`.

```bash
npm run build --workspace @mentoring/guard-school-record   # tsc → dist (커밋 제외; .gitignore)
```

로컬 `npm install` 후 소비 전 1회 빌드, Docker 는 apps/api 빌드 이전 단계에서 선(先)빌드한다(설치시 자동 빌드 훅 없음 — 매니페스트만 복사되는 `npm ci` 단계 실패 방지). 소스(`src`)는 vitest 가 직접 읽으므로 테스트는 빌드와 무관.

## 테스트

```bash
npm test --workspace packages/guard-school-record
```

모든 테스트 데이터는 **모의 서식 문자열**이다 — 실제 생기부 파일·실 PII는 테스트에도 사용하지 않는다.
