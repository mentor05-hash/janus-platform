# WD-37 · 선생님 근무시간 스펙 시트

> **[draft] 토큰·정본 확정 시 개정.** 원본 목업: `40_workbench/mockups/janus_teacher_worktime_v1.dc.html`.
> §2-D/F 근무 시간. 라우트: `/teacher/worktime` (App.tsx 1:1 대조 예정).

## 개념
선생님이 응답 가능 시간대·풀별 가용을 설정. 스케줄·자동배정·풀별 응답시간 배지에 반영.

## 데이터·배지 (§1)
- 요일·시간대 그리드. 풀별 가용 토글. 설정이 풀별 평균 응답시간 배지(`source: rules`)에 반영.
- 자동배정(automatch) 연동.

## CTA 위계 (골드 1개)
- 골드 채움 = "근무시간 저장" `data-janus-cta="worktime_save"`.
- 블루 = 미리보기. 회색 = 초기화.

## 반응형
데스크톱 주간 그리드, 모바일 요일 아코디언. 터치타깃 ≥44px.

## self-check 7종
① 375px 가독 ✅ · ② AI 라벨 N/A ✅ · ③ 배지 3종 ✅ · ④ CTA id ✅ · ⑤ "잇올" grep 0 ✅ · ⑥ 영문 파일명 ✅ · ⑦ 다크모드 ✅

## 썸네일
`thumb/WD-37.png` (비식별)
