# @janus/brand — 브랜드 토큰·로고 단일 소스

> 출처: 사용자 업로드 시안 번들(2026-07-13) `janus_design_system_v1` 테마 객체 추출.
> 추출 기록: `docs/design-integration/01_토큰_추출_2026-07-13.md`

## 구성

- `tokens.json` — 라이트/다크 컬러 토큰 + 도메인 슬롯 + 타이포 (기계 소비용: 모바일 주입·정적 생성기 인라인)
- `tokens.css` — 동일 값의 CSS 변수(`--j-*`), `:root` + `:root[data-theme='dark']`
- `logo/janus-arch-stroke.svg` — UI 마크(시안 공통, 좌 블루/우 골드 스트로크 아치)
- `logo/janus-arch-fill.svg` — 브랜드 정본(아카이브 부록, 채움형 + 두 흰 점)
- `demo.html` — 토큰 데모(컬러·타이포·버튼·신호등·AI 라벨) — 검증용

## 소비 경로

| 대상 | 방법 |
|---|---|
| apps/web | `src/styles/tokens.css`가 본 패키지 `tokens.css`를 `@import` → 레거시 별칭(`--teal` 등)은 `--j-*` 참조 |
| apps/mobile | `scripts/apply-branding.mjs`가 `tokens.json`을 읽어 `src/branding.generated.ts`의 `TOKENS`로 주입 → `theme.ts` LIGHT/DARK가 참조 |
| 정적 생성기(배치표 v23 예정) | 빌드 시 `tokens.json` 값 인라인 주입 |

## 사용 규정 (브랜드 가이드)

- 로고 여백 = 문턱 바 높이 이상. 비율 왜곡·임의 색·회전·그림자 효과 금지.
- 밝은 배경 = 네이비 워드마크, 어두운 배경 = 흰색 워드마크.
- CTA 위계: **골드 채움 = 화면당 1개(핵심 전환)** · 블루 채움 = 주요 액션 · 회색 아웃라인 = 탐색 보조.
- 신호등 4구간(안정·적정·소신·상향)은 차분한 채도 유지 — 빨강 남발 금지.
- AI 투명성 라벨: ✦ AI 초안(`--j-ai`) · ✦✎ AI 보완(`--j-aug`) · ✓ 선생님 답변(`--j-human`) — 색+아이콘 고정.
- 타이포: 한글 Pretendard Variable(헤드라인 700/본문 500) · 수치 IBM Plex Mono · 학부모 본문 ≥15px(모바일)/17px(데스크톱).
