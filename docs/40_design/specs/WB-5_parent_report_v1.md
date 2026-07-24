# WB-5 · 학부모 리포트 스펙 시트

> **[draft] 토큰·정본 확정 시 개정.** 원본 목업: `40_workbench/janus_parent_report_v1.dc.html`.
> §2-C 학부모 대상. GatewayCard 공용 3곳 중 하나. 라우트: `/report/parent` (App.tsx 1:1 대조 예정).

## 개념
결제 결정권자(학부모) 대상. 전문용어 풀어쓰기, 고대비, 본문 17px+. 자녀 현재 위치→격차→처방을 불안 조장 없이.

## §1 GatewayCard 필드표 (공용 3곳 중 하나)
| 필드 | 예시 |
|---|---|
| `title` | "자녀 격차, 이렇게 좁혀요" |
| `description` | "전문용어 없이 — 지금 필요한 한 걸음" |
| `service` | `prescription` |
| `href` | `/teachers` 또는 `/booking` |
| `ctaLabel` | "상담 예약" |

## 데이터·배지 (§1)
- 근거 배지 `source`·신뢰도 `relTier` 필수(학부모 신뢰 핵심).
- 신호등 4구간 차분한 채도, 빨강 남발 금지.
- 통념 교정 카피(데이터 근거) 톤.

## CTA 위계 (골드 1개)
- 골드 채움 = "상담 예약" `data-janus-cta="parent_book"`.
- 블루 = 자세히 보기·결제 보조.

## 접근성
본문 ≥17px(데스크톱)/15px(모바일), 고대비(제목 `#1e3550`), 용어 툴팁.

## self-check 7종
① 375px 가독 ✅ · ② AI 라벨(사람 확인 표기) ✅ · ③ 배지 3종 ✅ · ④ CTA id ✅ · ⑤ "잇올" grep 0 ✅ · ⑥ 영문 파일명 ✅ · ⑦ 다크모드 ✅

## 썸네일
`thumb/WB-5.png` (비식별 — 자녀 실명 마스킹)
