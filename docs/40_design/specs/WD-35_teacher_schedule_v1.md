# WD-35 · 선생님 스케줄 스펙 시트

> **[draft] 토큰·정본 확정 시 개정.** 원본 목업: `40_workbench/mockups/janus_teacher_schedule_v1.dc.html`.
> §2-D/F 공급자 스케줄. 라우트: `/teacher/schedule` (App.tsx 1:1 대조 예정).

## 개념
선생님의 상담·수업 일정 관리(주/월). 예약 요청 수락·조정. 근무시간(worktime)과 연동.

## 데이터·배지 (§1)
- 일정 유형 도메인 색·아이콘. 예약 상태 배지(요청/확정/완료).
- 조정 규정(48h·월2회·수락) 반영. 정산(earnings) 연동.

## CTA 위계 (골드 1개)
- 골드 채움 = "예약 요청 수락/오늘 입장" `data-janus-cta="sched_action"`.
- 블루 = 일정 추가. 회색 = 주/월 전환.

## 반응형
데스크톱 주간 그리드(밀도), 모바일 아젠다. 터치타깃 ≥44px.

## self-check 7종
① 375px 가독 ✅ · ② AI 라벨 N/A ✅ · ③ 배지 3종 ✅ · ④ CTA id ✅ · ⑤ "잇올" grep 0 ✅ · ⑥ 영문 파일명 ✅ · ⑦ 다크모드 ✅

## 썸네일
`thumb/WD-35.png` (비식별)
