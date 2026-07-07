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
- 미확정: `gye` 실값·3모드 정확 명칭 — **배치표_DDD_v2 반입 후 c항 감사에서 확정**(본 문서 v1.1로 갱신).
