# @mentoring/exam-calendar — 입시 캘린더 정적 모듈 (A7)

> 근거: `docs/30_features/야누스_벤치마크노트_엑셀코스피_2026-08-07.md` §1 **A7**(시장 캘린더 정적 내장).
> "연 1~2회 갱신이면 충분한 데이터라 정적 내장이 정답" — 모평·수능·원서 일정을 상수로 내장해
> 서버 왕복 없이 시즌 앵커·D-day·플래너 시즌 뷰가 같은 값을 쓴다.

## 구성

| 파일 | 역할 |
|---|---|
| `src/events.json` | **단일 소스**. 티어 빌드 파이프라인(`ops/placement/tier_build.py`)이 이 파일을 직접 읽어 무료판 HTML 에 D-day 를 주입한다. |
| `src/events.generated.ts` | JSON 에서 생성된 TS 상수(직접 수정 금지). |
| `src/index.ts` | 타입 + `nextEvent()` · `dDay()` · `upcoming()` · `formatDday()`. |
| `scripts/gen-events.mjs` | 생성·검증(`--check` 는 CI 용). |

날짜를 두 곳에 적지 않기 위해 JSON 이 원본이고 TS 는 생성물이다
(`branding.generated.ts` · `api-types.ts` 와 같은 규약).

## 사용

```ts
import { nextEvent, formatDday, upcoming } from '@mentoring/exam-calendar';

const ev = nextEvent();          // 진행 중 우선 → 없으면 가장 가까운 미래
formatDday(ev!);                 // 'D-104' | 'D-DAY' | '진행 중' | 'D+3'
upcoming(3);                     // 다가오는 3건
```

재생성:

```bash
npm run gen:calendar
```

동기화 검사(CI):

```bash
npm run gen:calendar -- --check
```

## ⚠ 날짜 신뢰도 — `status`

- `confirmed` — 평가원·대교협 **공고로 확인된** 날짜. `source` 에 공고 근거를 남긴다.
- `provisional` — **관례 기반 잠정**(예: "수능 = 11월 셋째 주 목요일"). 공고 미확인.

**현재 2027학년도 9건은 전부 `provisional` 이다.** 화면에는 잠정 표기가 함께 나가고
(무료판 D-day 칩의 `잠정` 배지), 공개 배포 전 공고와 대조해 `confirmed` 로 올린 뒤
`verified_against` / `verified_at` 을 채우는 것이 릴리스 조건이다.

## 날짜 규약

모든 일정은 **KST 달력 날짜**(`YYYY-MM-DD`, 시각 없음)다. D-day 는 KST 자정 기준으로
계산한다 — 시간대·서머타임에 흔들리지 않도록 두 달력 날짜의 UTC 자정 차이로 구한다.
