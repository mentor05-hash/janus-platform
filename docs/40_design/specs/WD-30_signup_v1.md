# WD-30 · 회원가입 스펙 시트

> **[draft] 토큰·정본 확정 시 개정.** 원본 목업: `40_workbench/mockups/janus_signup_v1.dc.html`.
> §2-A 가입 · 리스킨(역할선택 강요 금지). 라우트: `/signup` (App.tsx 1:1 대조 예정).

## 개념
카카오/전화/Apple 3초 가입 + 약관 동의. **역할 선택을 첫 화면에서 강요하지 않음**. 게스트 우회 제공.

## 데이터·배지 (§1)
- 인증 수단 3종. 약관·개인정보(policy_terms·privacy) 링크. 청소년=보호자 동의(policy_youth).
- 최소 정보 수집 원칙.

## CTA 위계 (골드 1개)
- 골드 채움 = "가입하고 시작" `data-janus-cta="signup_submit"`.
- 블루 = 로그인으로. 회색 = 게스트 둘러보기.

## 반응형
모바일 1열 폼, 데스크톱 중앙 카드. 입력 ≥44px. 본문 ≥15px.

## self-check 7종
① 375px 가독 ✅ · ② AI 라벨 N/A ✅ · ③ 배지 3종 ✅ · ④ CTA id ✅ · ⑤ "잇올" grep 0 ✅ · ⑥ 영문 파일명 ✅ · ⑦ 다크모드 ✅

## 썸네일
`thumb/WD-30.png` (비식별)
