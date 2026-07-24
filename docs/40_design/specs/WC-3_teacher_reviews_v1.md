# WC-3 · 선생님 후기 스펙 시트

> **[draft] 토큰·정본 확정 시 개정.** 원본 목업: `40_workbench/janus_teacher_reviews_v1.dc.html`.
> §2-D 후기. 라우트: `/teachers/:id/reviews` (App.tsx 1:1 대조 예정).

## 개념
누적 후기·별점 분포·풀별 만족도. 데이터로 신뢰 형성. 후기 → 예약/지정질문 연결.

## 데이터·배지 (§1)
- 별점 `rating` 1~5 분포 차트. 근거 배지 `source: rules` · 신뢰도 `relTier`(표본 수 명시).
- 검증된 후기 표식(실수강 여부).

## CTA 위계 (골드 1개)
- 골드 채움 = "예약하기" `data-janus-cta="reviews_book"`.
- 블루 = 프로필로. 회색 = 후기 필터.

## 반응형
데스크톱 분포+목록 2열, 모바일 1열. 본문 ≥15px.

## self-check 7종
① 375px 가독 ✅ · ② AI 라벨 N/A ✅ · ③ 배지 3종 ✅ · ④ CTA id ✅ · ⑤ "잇올" grep 0 ✅ · ⑥ 영문 파일명 ✅ · ⑦ 다크모드 ✅

## 썸네일
`thumb/WC-3.png` (비식별)
