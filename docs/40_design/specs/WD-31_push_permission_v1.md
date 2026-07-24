# WD-31 · 알림 권한 요청 스펙 시트

> **[draft] 토큰·정본 확정 시 개정.** 원본 목업: `40_workbench/mockups/janus_push_permission_v1.dc.html`.
> §2-A/E 알림 허용 시트. 라우트: `/permission` 오버레이 (App.tsx 1:1 대조 예정).

## 개념
푸시 알림 허용 안내 시트. 왜 필요한지(답변·예약·정산 알림) 가치 설명 후 요청. 거부해도 진행(막다른 화면 금지).

## 데이터·배지 (§1)
- 알림 유형 예시(qna_answered·booking·payment). 나중에 설정 변경 가능 고지.

## CTA 위계 (골드 1개)
- 골드 채움 = "알림 받기" `data-janus-cta="push_allow"`.
- 회색 = 나중에.

## 반응형
모바일 하단 시트, 데스크톱 모달. 터치타깃 ≥44px. 본문 ≥15px.

## self-check 7종
① 375px 가독 ✅ · ② AI 라벨 N/A ✅ · ③ 배지 3종 ✅ · ④ CTA id ✅ · ⑤ "잇올" grep 0 ✅ · ⑥ 영문 파일명 ✅ · ⑦ 다크모드 ✅

## 썸네일
`thumb/WD-31.png`
