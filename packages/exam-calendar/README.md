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

**2026-08-19 공고 대조 완료 — 9건 중 7건 `confirmed`, 2건 `provisional`.**
`confirmed` 7건의 근거는 평가원 「2027학년도 수능 시행기본계획」(2026-03-31)과
대교협 「2027학년도 대학입학전형기본사항」이다(`verified_against` 참조).

남은 `provisional` 2건은 **전국연합학력평가**(3월·10월)다 — 시도교육청 소관이라
평가원·대교협 공고에 없고, 시행일은 확인했으나 **교육청 공고 원문을 대조하지 못했다.**
화면에는 잠정 표기가 함께 나간다(무료판 D-day 칩의 `잠정` 배지).
교육청 공고를 확보하면 `confirmed` 로 올리고 `source` 를 공고 근거로 교체한다.

⚠ 대조 시 **9건 중 4건의 날짜가 틀려 있었다**(3월 학평·수시 원서·10월 학평·정시 원서).
특히 정시 원서는 `2026-12-29~31` → `2027-01-04~07` 로 **연도가 달랐다**. 관례 추정은
이 정도로 빗나간다 — 새 사이클을 열 때 공고 대조 없이 `confirmed` 로 올리지 않는다.

## 날짜 규약

모든 일정은 **KST 달력 날짜**(`YYYY-MM-DD`, 시각 없음)다. D-day 는 KST 자정 기준으로
계산한다 — 시간대·서머타임에 흔들리지 않도록 두 달력 날짜의 UTC 자정 차이로 구한다.
