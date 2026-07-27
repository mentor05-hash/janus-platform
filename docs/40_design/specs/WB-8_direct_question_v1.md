# WB-8 · 지정 질문 스펙 시트

> **[draft] 토큰·정본 확정 시 개정.** 원본 목업: `40_workbench/janus_direct_question_v1.dc.html`.
> §2-B Q&A(선생님 지정). 라우트: `/qna/direct` (App.tsx 1:1 대조 예정).

## 개념
특정 선생님을 지목해 질문. scope="특정 선생님 지정". "응답이 느릴 수 있어요" 고지 칩. 티어게이트 상위.

## 계약 (0051 Q1 · §1)
- `scope` 3종 중 "특정 선생님 지정" 경로. 고지 칩 필수.
- `keepTeacher`와 연계(단골 이어가기).
- 티어게이트 `free<member<paid<consultant` — 지정 질문은 상위 티어.
- AI 라벨: 초안 없이 바로 ✓선생님 답변 대기이면 그 상태 표기.

## CTA 위계 (골드 1개)
- 골드 채움 = "이 선생님께 질문" `data-janus-cta="direct_ask"`.
- 블루 = 프로필 보기·공개 질문 전환 보조.

## 반응형
모바일 풀시트, 데스크톱 모달 520px. 선생님 카드 + 작성 폼. 본문 ≥15px.

## self-check 7종
① 375px 가독 ✅ · ② AI 라벨(대기 상태) ✅ · ③ 배지(티어·source) ✅ · ④ CTA id ✅ · ⑤ "잇올" grep 0 ✅ · ⑥ 영문 파일명 ✅ · ⑦ 다크모드 ✅

## 썸네일
`thumb/WB-8.png` (비식별)
