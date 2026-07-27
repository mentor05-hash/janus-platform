# @mentoring/janus-planner — 플래너 순수 도메인 v1

여정·가용시간·계획을 **일 단위 원장(todo)** 으로 펼치고, 미완수를 재배치하며, 실측 실행률로 계획을 재추정하는 순수 도메인. 정본 사양: `docs/30_features/야누스_플래너_도메인스펙_v1_2026-07-22.md`.

## 핵심 원칙

- **의존성 0** — 런타임 의존성이 없다(devDependencies 는 tsc·vitest 뿐). DB·API·UI 없음, 타입과 함수만.
- **순수 함수** — 같은 입력이면 항상 같은 출력. 시각 조회(`Date.now()`)·저장·네트워크 호출이 0건이다. "오늘"은 항상 인자로 받는다.
- **원장은 하나** — 주·월·시즌 뷰는 `todo` 집계 함수로만 산출한다. 별도 저장 금지(이중 장부 금지).
- **날짜는 `'YYYY-MM-DD'` 문자열(KST 달력일)만** 다룬다. UTC↔KST 변환은 호출측(API 계층, `apps/api/src/common/time/kst.ts`) 책임.

## 금지 사항 — 스키마 레벨에서 강제

주석이 아니라 컴파일러로 막는다. `src/schema.ts` 의 `Sealed<T>` 가 아래 키들을 `?: never` 로 봉인하므로, 객체 리터럴은 물론 **변수 경유 주입도 타입 오류**가 된다.

| 금지 | 근거 |
|---|---|
| 성적·등급·배치표 결과(`score`·`grade`·`percentile`·`누백` …) | D-006 — cohort·빌보드 어디에도 두지 않는다 |
| 크레딧·보상액(`credit`·`point`·`reward_amount` …) | D-004 경제 동결 — 보상은 배지 코드 문자열까지만 |
| 실명·연락처(`name`·`phone`·`email` …) | 도메인 밖(계정 모듈 소관). cohort 멤버는 `anon_id`+`nickname` 만 |

## 스키마 6종

`journey`(여정 온보딩) · `availability`(가용 시간·환경) · `plan`(계획) · `todo`(일 단위 원장 = 유일한 사실원) · `ghost_track`(고스트 파트너 — v1은 스키마만) · `cohort`(플래너 반).

## 엔진 4종

```ts
import { distribute, carryOver, execRate, weeklyBoard, assignCohort } from '@mentoring/janus-planner';
```

| 함수 | 역할 |
|---|---|
| `distribute(item, availability, period)` | 학습일 패턴 4종(daily·alt·no_weekend·custom)+예외 반영 → 일 단위 배정. `per_day`(하루 n개) / `d_day`(역산) 2모드. 환경별 배정(`transit`엔 인강만) |
| `carryOver(todos, mode, { today })` | 미완수 재배치 2택 — `keep_deadline`(잔여일 가중 재분배, 일일 상한 1.5배 초과 시 **욱여넣지 않고** `extend` 제안) / `keep_pace`(실측 평균으로 완료일 재계산) |
| `execRate(todos, opts)` | 실행능력 계수 — `rate = Σ완료/Σ계획`, `needed_weeks = ceil(remaining / (perWeek × rate))`. 표본 7일 미만 `insufficient`, 전량 미완 `stalled` |
| `weeklyBoard` · `assignCohort` | 월~일 창 4부문(completed·streak·recovery·self_best) top3 + 본인 상위 % 구간만. 휴면 제외. 편성은 band+season·정원 25 |

`distribute` 는 학습일이 0이면 `PlannerError('EMPTY_PLAN')` 을 던진다 — 빈 계획은 만들지 않는다.

## 테스트

```bash
npm test --workspace packages/janus-planner
```

```bash
npm run typecheck --workspace packages/janus-planner
```

스펙 §3의 완료 기준 10종을 모두 덮는다. **두 명령이 모두 통과해야 한다** — vitest 는 esbuild 트랜스파일이라 타입을 검사하지 않으므로, "성적 필드 주입 시 타입 오류"(§3-8)는 `typecheck`(`@ts-expect-error` 검증)로만 확인된다.
