# WC-12 · 상담 후기 스펙 시트

> **[draft] 토큰·정본 확정 시 개정.** 원본 목업: `40_workbench/janus_session_review_v1.dc.html`.
> §2-D 세션 후기. 라우트: `/session/review` (App.tsx 1:1 대조 예정).

## 개념
세션 후 별점·후기 작성 + "이 선생님 계속?" 2문항(0051 Q1과 정합). 단골/차단 갈래.

## 계약 (0051 Q1 · §1)
- `rating` 1~5 별점. `keepTeacher` 토글("계속 받을까요?").
- 후기 제출 시 검증 표식. 단골/차단은 학생 전용 UI(공급자 비노출).

## CTA 위계 (골드 1개)
- 골드 채움 = "후기 제출" `data-janus-cta="review_submit"`.
- 블루 = 다음 예약. 회색 = 나중에.

## 반응형
모바일 풀시트, 데스크톱 모달. 별점 터치타깃 ≥44px.

## self-check 7종
① 375px 가독 ✅ · ② AI 라벨 N/A ✅ · ③ 배지 3종 ✅ · ④ CTA id ✅ · ⑤ "잇올" grep 0 ✅ · ⑥ 영문 파일명 ✅ · ⑦ 다크모드 ✅

## 썸네일
`thumb/WC-12.png` (비식별)
