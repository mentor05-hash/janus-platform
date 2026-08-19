# janus_score ↔ scores 변환 스펙 v1 (W1 D3 ②)

> 2026-07-07 · 구현은 W1 D4(브리지: export API + URL 파라미터 생성기 + ingest 스니펫). 야누스 미결 #4(성적 자동연동) 해소의 스펙.

## 1. 양쪽 모델

**플랫폼(scores 모듈, prisma):**
- `score_report { student_id, period, exam_type, source(manual|excel|ocr), placement Json?, items[] }` — `@@unique(student_id, period)`
- `score_item { subject, score, max_score(기본100), grade }`

**배치표(v22 규약, 클라이언트):**
- `localStorage.janus_score` 또는 URL 파라미터 = `{ gye, nb | kor/mat/tam1/tam2, eng, han }`
  - `gye`: 계열(`ga`=자연/`na`=인문 — c항 감사 후 실값 확정)
  - 3모드: 표점(std) / 백분위(nb) / 등급 — v22 입력 3모드에 대응
  - `eng`·`han`: 절대평가 등급(1~9 / 1~5)

## 2. 필드 매핑

| janus_score | score_item.subject | 값 | 비고 |
|---|---|---|---|
| `kor` | `국어` | 표점 또는 백분위 | mode 필드로 구분(아래 §3) |
| `mat` | `수학` | 〃 | 선택과목은 `exam_type`/note에 |
| `tam1`·`tam2` | `탐구1`·`탐구2` | 〃 | 과목명은 note 보존 |
| `eng` | `영어` | grade(1~9) | score_item.grade 사용 |
| `han` | `한국사` | grade(1~9) | 〃 |
| `gye` | — | report 레벨 | `score_report.exam_type` 병기 or placement.gye |
| `nb` | — | 모드 플래그 | 백분위 모드 표식(v22 규약 유지) |

- **period 규약:** `YYYY-MM_시험명` (예: `2026-06_모평`). 최신 report = `ORDER BY period DESC LIMIT 1`.
- **모드 판정:** export 시 `score_item`에 백분위·표점이 둘 다 있으면 백분위 우선(`nb` 세트) — 배치표 3모드 중 자동 선택은 클라이언트 토글로 변경 가능해야 함(v22 동작 보존).

## 3. Export API (W1 D4 구현)

```
GET /api/v1/scores/janus-score            (본인=student, guardian은 연결 자녀 ?studentId=)
→ 200 { data: {
    gye: 'ga', mode: 'nb',                    // 'std'|'nb'|'grade'
    kor: 96, mat: 92, tam1: 88, tam2: 90,     // mode 기준 수치
    eng: 2, han: 3,
    period: '2026-06_모평', source: 'ocr',    // 근거 표기(신뢰 배지용)
  } }
→ 404 { error: { code:'NO_SCORE' } }          // 성적 없음 → 배치표는 수동 입력 폴백
```

**URL 파라미터 생성기(웹 클라이언트 유틸):** `buildJanusScoreParams(data)` → `?gye=ga&nb=1&kor=96&…` — v22가 이미 읽는 규약 그대로(키 이름 변경 금지). 토큰과 결합 시 `?sso=<token>&gye=…`.

## 4. Ingest 스니펫 (배치표·입결·수시 HTML 공용)

```js
// janus-ingest.js — ① URL 파라미터 → ② localStorage.janus_score → 없으면 수동 입력
// v22 기존 로직(자동 입력·applyPredict)과 동일 우선순위. 새 규칙: 파라미터 수신 시
// localStorage에 저장(다음 방문 자동), source·period 있으면 화면에 "6월 모평 · OCR" 근거 배지.
```
- 주입 방식: 생성기(gen_jeongmil.cjs) 템플릿부에 인라인 — **한글 패치 규칙(python replace/heredoc) 준수**.
- 수시 도구·입결에도 동일 스니펫(잇올 미결 #4의 "입결 도구에도 성적 연동" 해소).

## 5. 검증 규칙

| 필드 | 규칙 | 위반 시 |
|---|---|---|
| kor/mat/tam1/tam2 (nb) | 0~100 정수 | 해당 필드 무시+경고 배지 |
| kor/mat/tam1/tam2 (std) | 0~200 정수 | 〃 |
| eng/han | 1~9 정수 | 〃 |
| gye | 허용값 enum | 기본값(사용자 선택 유도) |
| 전체 | 필수 4과목(kor·mat·tam1·tam2) 중 결측 있으면 | 부분 자동입력 + 결측만 수동 |
| XSS | 수치·enum만 통과(문자열 삽입 불가) | 폐기 |

- 서버(export)는 항상 정제된 값만 내보냄 — ingest 쪽 검증은 방어적 이중화.
- **역방향(배치표→플랫폼) 쓰기는 이번 범위 밖**(배치표 결과 placement 저장은 기존 `POST admin/scores/:id/placement`·estimate 경로 유지).

## 6. E2E 완료 기준 (W1 D4 ✅)

OCR로 성적 입력 → `GET /scores/janus-score` 응답 확인 → 배치표 URL 파라미터 생성 → 배치표 자동 입력·applyPredict 발동 → 수시 도구 동일 왕복. 캡처 증빙.

## 7. 결정 기록

- O43(2026-07-07): janus_score 규약은 **v22 키를 정본으로 동결**(키 이름 변경 금지 — 기존 배치표 호환), 플랫폼이 규약에 맞춰 export. period·mode·근거 배지 확장 필드는 추가만 허용(하위호환).
- 미확정: ~~`gye` 실값·3모드 정확 명칭~~ → **v1.1 에서 확정(아래)**.

---

## 8. v1.1 확정 (2026-07-13 — 핸드오프 접합계약 C1 기준)

- **`gye` 실값 = `이과` | `문과`** (배치표 핸드오프 2026-07-14 §C1·v25 커버 스크립트 실측 — `ga`/`na` 아님).
- **모드 확정**: `nb` = **전국 누백 단일값**(과목 백분위 아님). 계약상 택1 = 표점 4종(`kor/mat/tam1/tam2`, 0~200) 또는 `nb`(0<nb<100).
  과목 백분위 모드(subj)는 배치표 자체 입력 UI 에만 존재 — export 규약 밖.
- **구현(W1 D4 완료)**: `GET /api/v1/scores/janus-score`(student 본인·guardian ?studentId=) →
  `apps/api/src/modules/scores/domain/janus-score.ts`(순수 변환+검증, spec 8케이스) · 허브(/placement/hub)가
  `localStorage.janus_score` 저장 + `janus:score` 이벤트 발화(키·이벤트명 동결).
- **모드 판정 구현**: `placement.nb` 있으면 nb 우선, 없으면 표점 4종 완비 시 std, 둘 다 불가 → 404 `NO_SCORE`(수동 입력 폴백).
  ⚠ `score_item.score` 는 정시 규약상 **표점으로 간주** — 원점수 운용 데이터는 `placement.nb` 를 채워 nb 모드로 내보낼 것.
- E2E 실측(2026-07-13): OCR 시딩 리포트 → std 응답 `{gye:이과,kor:131,mat:135,tam1:65,tam2:64,eng:1,han:2}` → placement.nb 갱신 → nb 응답 `{nb:1.53}` → 비로그인 401.

---

## 9. v1.2 확정 (2026-08-19 — 가채점 표시 `est`, O226)

수능 당일(11/19) 배치표는 **가채점 추정치**로 돈다. 실채점 표준점수 분포는 12/11 에야 나온다.
추정치를 실측처럼 보이게 두지 않기 위해 계약에 표시 필드 하나를 **하위호환으로 추가**한다.

```js
{ gye:'이과', mode:'std', kor:141, mat:132, tam1:123, tam2:114, eng:1,
  period:'2027-수능', source:'self',
  est:'gachaejeom' }        // ← 신설. 없으면 실채점·일반(기존 동작 그대로)
```

- **`est?: 'gachaejeom'`** — **부재가 기본값**이다. 이 필드를 모르는 소비자(기존 배치표·입결 도구)는
  영향을 받지 않는다. O43 의 "추가만 허용" 조건을 그대로 지킨다.
- 값은 `'gachaejeom'` 하나만 인정한다. 오타·미래 값은 **조용히 무시**한다(§5 검증 원칙 — 위반 필드는 무시).
- `mode`(std|nb)와 **직교**한다. 표현 방식과 추정 여부는 다른 축이라 nb 모드에서도 `est` 가 붙는다.
- **소비 의무**: `est` 가 있으면 배치표·격차 리포트는 면책 문구를 함께 낸다.
  문구는 환산표의 `disclaimer`("가채점 기반 추정치입니다. 실채점 결과와 차이가 있을 수 있습니다.")를 쓴다.

### 저장 — 마이그레이션 없음

`score_report.placement`(이미 `Json?`)에 얹는다. 새 컬럼을 만들지 않는다.

| 키 | 값 |
|---|---|
| `placement.est` | `'gachaejeom'` |
| `placement.raw` | `{kor:90, mat:80, …}` — **입력 원점수 보존** |
| `placement.disclaimer` | 환산표에서 가져온 면책 문구 |
| `placement.uncorrected` | 난이도 보정이 없는 과목(있을 때만) |

⚠ **원점수를 버리지 않는 것이 핵심이다.** 12/11 실채점 표가 오면 같은 원점수로 다시 환산해야 하는데,
추정 표준점수만 남기면 그때 되돌릴 수 없다.

### 입력 — `POST /scores/me` 의 `mode: 'raw'`

- `raw` = 가채점 원점수. 서버가 `JANUS_GACHAEJEOM_TABLE`(P2 산출 JSON)로 추정 표준점수·등급을 만든다.
- 환산표 미설치 시 **400 `GACHAEJEOM_TABLE_UNAVAILABLE`** — 조용히 무보정 값으로 넘어가지 않는다.
  그렇게 하면 추정치가 실측처럼 저장된다.
- 표는 요청마다 mtime 을 보고 갱신을 반영한다. 당일 19:15 에 보정 계수를 고쳐 재생성하는 일이 있다.
- 기존 `std`·`nb` 경로는 **건드리지 않는다**(회귀 0 — E2E 로 고정).

### 실측 (2026-08-19)

- 도메인 `gachaejeom.spec.ts` 15케이스 · 계약 `janus-score.spec.ts` est 4케이스 + assignSubjects 2케이스
- E2E `gachaejeom-input.e2e-spec.ts` 4케이스 — 원점수 보존 · `est` 방출 · 표 미배치 거절 · std 경로 회귀 0
- api 유닛 **73스위트 435/435**
