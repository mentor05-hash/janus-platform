# 야누스 Decision-Register

> 생성 2026-07-07 · 잇올 Decision-Register(O1~O37 확정 / N1~N22 미결, `docs/90_archive` 및 구 작업폴더 참조)의 **번호 체계 승계** — 야누스는 **O38 / N23부터**.
> 규칙: 결정 발생 즉시 기록(세션 리추얼 ④). 미결(N)은 주간 리뷰에서 강제 처리 — "미결정 적체"가 1인 체제 최대 리스크(실행계획서 §6).

## 확정 (O)

| 번호 | 일자 | 결정 | 근거·비고 |
|---|---|---|---|
| O38 | 2026-07-07 | **저장소 3분리**: janus-platform(private, 모노레포)·janus-data(로컬 전용, remote 금지)·janus-public(public, Pages) | 실행계획서 §1-1. 저작권 데이터는 private repo도 불가 |
| O39 | 2026-07-07 | **10_platform 편입 = clone 방식**: 잇올 모노레포를 이력 보존 clone → `janus/10_platform/janus-platform`. 원본 폴더는 이름변경 보관(터널·경로 변경 허용) | 사용자 확정(7/7). 데모 스택 볼륨 재사용은 `COMPOSE_PROJECT_NAME=itall-mentoring` |
| O40 | 2026-07-07 | **문서 canonical = repo `docs/`**: `janus/00_docs`는 symlink. 살아있는 문서 1개 원칙 | 00_INDEX §2-3 |
| O41 | 2026-07-07 | **디자인 통합 절충 원칙 4 채택**: ①로직 기존·비주얼 신규 ②번들 직접 이식 금지 ③패리티 전 구버전 삭제 금지 ④신규 기능 백로그 | 디자인통합 지시서 §B |
| O42 | 2026-07-07 | **SSO 토큰 스키마·registry 확정**: rooms TokenService(HS256+epoch) 승격, sub/role/tier/aud/scope/epoch 클레임, `sso_service` 테이블 등록제, 정적 페이지는 `GET /sso/verify` 위임 | `docs/SSO_토큰_일반화_설계_v1_2026-07-07.md` (W1 D3) |
| O43 | 2026-07-07 | **janus_score 규약 = v22 키 동결**(변경 금지, 하위호환 확장만): `{gye, nb\|kor/mat/tam1/tam2, eng, han}` + period·mode·근거배지 추가 필드. 플랫폼이 규약에 맞춰 export | `docs/janus_score_변환스펙_v1_2026-07-07.md` (W1 D3). gye 실값·3모드 명칭은 c항 감사 후 v1.1 |
| O44 | 2026-07-13 | **디자인 토큰 단일 소스 = `packages/brand`**(tokens.json+tokens.css): 웹=@import·레거시 `--teal` 별칭 유지, 모바일=apply-branding.mjs가 TOKENS 주입. 값은 업로드 시안 번들 `janus_design_system_v1` 추출본 고정 | 스텝 1 실행(본 세션). `docs/design-integration/01_토큰_추출_2026-07-13.md` |
| O45 | 2026-07-13 | **관문 히어로 = 딥 네이비 포탈 채택**(N26 해소): 신규 랜딩(/)을 janus_home_v2 기준 구현, 구 잇올 랜딩은 `/legacy` 병행 유지 | 시안 home_v2가 "적용판"으로 명시 — 가정값과 동일 |
| O46 | 2026-07-13 | **UI 로고 마크 = 시안 스트로크 아치**(블루/골드 분할), 아카이브 채움형은 브랜드 정본으로 `packages/brand/logo/` 병존 | 비주얼 신규 우선(O41-①) |
| O47 | 2026-07-13 | **네이티브 식별자(bundleId/scheme/slug)는 야누스 전환에서 제외** — 기존 `com.example.mentoring` 유지, 스토어 재등록 시점에 별도 결정 | 설치본 호환·빌드 파이프 보호 |
| O48 | 2026-07-13 | **/services = 야누스 7종 카탈로그로 재정의**: 진단(배치표·수준진단)·커리큘럼 처방·Q&A·상담·과외·클리닉(준비 중)·강의 VOD(준비 중). 구 잇올 slug 7종은 근접 서비스로 301성 리다이렉트, 구 iframe은 `/legacy/services` 병행 | 감사 매트릭스 "rebuild — 데이터만 야누스로" 실행 |
| O49 | 2026-07-13 | **관문 LLM 훅 아키텍처 확정**: `POST /api/v1/gateway/interpret`(공개·IP 분당 20회) → 마스킹(전화·이메일·주민번호) → 일 상한(`GATEWAY_LLM_DAILY_LIMIT`, 기본 200, KST 일자 키) → LlmProvider(Claude) → 실패·미구성·상한 시 규칙 분류 폴백(막다른 화면 금지 불변식). 웹은 API 자체 실패 시 로컬 규칙 폴백 2중화 | W2 D5. 실모델 활성화 = `LLM_PROVIDER=claude`+`ANTHROPIC_API_KEY`(운영 키 분리, W2 인프라 표) |

## 미결 (N) — 결정 대기

| 번호 | 기한 | 안건 | 상태 |
|---|---|---|---|
| N23 | W1 D6 초안 → W3 확정 | **유료 티어 가격** | 미착수 |
| N24 | W1 D6 초안 → W3 확정 | **무료 노출 수**(구간별 대표 N개) | 미착수 |
| N25 | W1 D6 초안 → W3 확정 | **게이트 방식**(권장: 자체 RedemptionCode/SSO 시작, 컨설턴트만 CF Access) | 미착수 |
| N26 | ~~스텝 3 착수 전~~ | ~~관문 히어로 방향 택1~~ → **O45로 확정(딥 포탈)** | 해소(7/13) |
| N27 | W8 | 리그 수치(승급 기준·2부 질문가·보상률·지정 가산) | 기획서 확정 후 운영 보정 |
| N28 | W8과 함께 | 포트폴리오(가·나·다 조합) 개발 여부 — 유료 티어 킬러 후보 | 백로그(스텝 4) |

## 승계 참조 (잇올 시절 주요 미결 중 야누스에 이어지는 것)

- N22 화이트보드 PDF 배경(룸 서비스) — 사업확장 후.
- O2/PG: 토스페이먼츠로 W9~10 실연동 예정(실행계획서).
