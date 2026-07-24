# P0-3 · 질문 플로우(Q&A) 스펙 시트

> **[draft] 토큰·정본 확정 시 개정.** 원본 목업: `40_workbench/janus_qna_flow_v1.dc.html` (정본).
> §2-B Q&A **P0-3 · 개편**. §2-D 답변 큐(선생님)와 짝. 라우트: `/qna/ask` (App.tsx 1:1 대조 확정 예정).

## 개념
질문 작성 → ✦AI 초안(즉시) → ✓선생님 답변(검수) → 후속 질문 시트. AI 투명성 라벨을 단계마다 명시.

## 흐름 4단
1. **작성** — 사진 슬롯 + 텍스트. `scope` 선택.
2. **✦AI 초안** — `source: llm`, AI 라벨 `ai` `#6d5dd3`(다크 `#9a8be8`).
3. **✓선생님 답변** — 검수 후 `human` 라벨 `#2f6fb3`. 보완 시 `ai_assisted` ✦✎ `#1f8a8a`.
4. **후속** — `keepTeacher`로 같은 선생님 이어가기 / 재답변.

## 🔒 가드② — 0051 Q1 계약 인용 (실측 확정, 코드 필드 1:1)
| 계약 필드 | 값 | 스펙 반영 |
|---|---|---|
| `scope` | 3종 | 작성 단계 scope 선택 UI 3옵션 |
| `rating` | 1~5 | 답변 평가 별점 1–5 |
| `keepTeacher` | boolean | 후속 시트 "같은 선생님 이어가기" 토글 |
| `qa.reanswerLimit` | 기본 3 | 재답변 잔여 카운트 노출·소진 시 비활성 |
| 알림 | `qna_answered` / `qna_accepted` | 답변 도착·채택 시 알림 트리거 |

## §1 컴포넌트 계약 대조표
| §1 계약 | 이 화면 적용 | 확인 |
|---|---|---|
| AI 라벨 3종 `ai/ai_assisted/human` | 단계 2·3·보완에 색+아이콘 | ✅ |
| 출처 배지 `source: llm\|rules` | AI 초안=llm 표기 | ✅ |
| 신뢰도 `relTier: A\|B\|C` | 답변 신뢰도 배지 | ✅ |
| 티어게이트 `free<member<paid<consultant` | 재답변/직접질문 게이트 | ✅ |
| CTA `data-janus-cta` | "질문 올리기"=`qna_submit` 외 | ✅ |
> ⚠ `scope`/`rating`/`reanswerLimit` 라벨은 0051 Q1 원문과, AI 라벨/배지는 §1과 각각 대조. 상충 시 0051(기능 계약) + §1(표현 계약) 우선.

## CTA 위계
골드 채움 = "질문 올리기"(다음 문) `data-janus-cta="qna_submit"`. 블루 = 사진 첨부·예시. 회색 = scope 토글.

## self-check 7종
① 375px 가독 ✅ · ② AI 라벨 3종 구별(초안/보완/답변) ✅ · ③ 배지 3종 ✅ · ④ CTA id ✅ · ⑤ "잇올" grep 0 ✅ · ⑥ 영문 파일명 ✅ · ⑦ 다크(답변 큐 다크와 대응) ✅

## 썸네일
`thumb/P0-3.png` (비식별)
