# WB-4 · 주간 리포트 스펙 시트

> **[draft] 토큰·정본 확정 시 개정.** 원본 목업: `40_workbench/janus_weekly_report_v1.dc.html`.
> §2-B 주간 요약 · §2-C 학부모 홈(W8) 소스. 라우트: `/report/weekly` (App.tsx 1:1 대조 예정).

## 개념
한 주 학습·상담·성취를 한 장으로. 학생/학부모 공용. GatewayCard로 다음 행동(상담·처방) 연결.

## §1 GatewayCard
주간 리포트는 GatewayCard 공용 3곳 중 하나(관문홈·격차리포트·학부모리포트)와 계보 일치 — 요약 카드에서 `{title,description,service,href,ctaLabel}` 필드로 다음 문 렌더.

## 데이터·배지 (§1)
- 지표 근거 배지 `source: rules`. 신뢰도 `relTier`.
- 성취/미달은 신호등 4구간 채도로.

## CTA 위계 (골드 1개)
- 골드 채움 = "이번 주 처방 →" `data-janus-cta="weekly_prescribe"`.
- 블루 = 상세 리포트·과목별 보조.

## 반응형
데스크톱 요약+상세 2열, 모바일 1열. 학부모 데스크톱 본문 17px.

## self-check 7종
① 375px 가독 ✅ · ② AI 라벨 N/A ✅ · ③ 배지 3종 ✅ · ④ CTA id ✅ · ⑤ "잇올" grep 0 ✅ · ⑥ 영문 파일명 ✅ · ⑦ 다크모드 ✅

## 썸네일
`thumb/WB-4.png` (비식별)
