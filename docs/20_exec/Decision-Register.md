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
| O50 | 2026-07-13 | **배치표 허브 아키텍처**: 원본 HTML 은 `JANUS_DATA_DIR/placement-hub/`+manifest 허용목록에서 **런타임 서빙만**(repo 무반입, §4). 웹 `/placement/hub` = 시안 janus_report_hub_v1 액자(탭+iframe 프리로드, `?season=0` 카이로스 숨김). **C2 게이트**: free 만 공개, 회원급은 로그인→일회성 티켓(2분)→iframe. C3 계측 앵커 `consult-reserve` 배치 | 핸드오프(2026-07-14) C1~C6 준수. `ops/placement/README.md` |
| O51 | 2026-07-13 | **랜딩(/) = 최신 홈 janus_web2d_v1 포털형으로 교체**: 히어로 3-슬라이드(관문 딥 포탈=1번 슬라이드로 흡수·이벤트·Q&A) + 빠른 타일 4 + 강좌·인기 학과·공지(예시) + 신뢰 밴드 + 3컬럼 푸터. O45 는 슬라이드 1로 승계 | 사용자 업로드 최신 시안(7/13). 강좌·공지·지표는 '예시' 라벨 유지 — 실연동 백로그 |
| O52 | 2026-07-13 | **전환 계측 = 자체 `funnel_event` 테이블**(외부 애널리틱스 도입 전 유일 소스): 공개 `POST /funnel/event`(익명 세션 id·PII 없음) + 관리자 요약(세션 기준 전환율). C3 고정 id(page `baechi`·cta `consult-reserve`) 준수 | W3 항목 선완료. janus_score v1.1 확정(gye=이과/문과·nb=전국누백)도 동일 세션 — 스펙 문서 §8 |
| O53 | 2026-07-13 | **SSO 티어 판정 잠정 규칙**: 로그인 = `member` · admin/hr = `consultant` · `paid` 승격은 가격 확정(N23~N25) 후 멤버십 연동. 시크릿 `SSO_JWT_SECRET`(rooms 와 분리) | O42 구현과 함께. 확정 시 본 행 갱신 |
| O54 | 2026-07-14 | **티어 빌드 파이프라인 = 마스킹+FLAGS+검증기(무료판 먼저)**: `ops/placement/tier_build.py`(센티넬 영역 마스킹 + strip_assignments 페이로드 제거 + `window.__JANUS_FLAGS` 주입 + 워터마크·면책 + 무료판 접속로그 비콘) → `dist-tier/{tier}`. `tier_verify.py`가 forbidden(원천 파일명·컷 수치) 검출 시 비-0 종료로 배포 차단. 저작권 마스터는 repo 밖(`--src` 로컬), 코드만 repo(C6). dist-tier 전체 gitignore(무료판은 janus-public `/baechi/`, C4) | 실행계획서 W2 D1. 합성 픽스처로 E2E 실증(무료판 통과·회원판 데이터보유로 실패=공개불가) |
| O55 | 2026-07-14 | **격차 리포트 v1 = janus_report 규약 첫 구현(C5)**: 순수 도메인 `scores/domain/gap-report.ts`(nb + 목표컷 → 밴드 안정/적정/소신/상향·shortfall·근거·처방). `POST /scores/gap-report`(student·guardian). evidence[] 전건 relTier 필수(measured/multiyear/estimated). 컷 근접 구간만 합격률 힌트(≈37%). 업셀 윤리로 무료 액션 우선 + 상담 CTA `consult-reserve`(C3). 웹 `/placement/gap` + 관문 홈 '격차 리포트' 카드 연결. 저작권 컷은 입력으로 받음(C6) | 실행계획서 W4. 도메인 14케이스 실측 통과. 목표컷 소스(파일 서빙 vs 엔진직결)는 N29 |
| O56 | 2026-07-14 | **회원 티어 게이트 = 티켓 발급 시 사용자 티어 검증(C2)**: `sso/domain/tierForRole`(role→tier 단일 소스, O53) + `tierAtLeast`. `placement-hub.issueTicket(user,slug)`가 `tierAtLeast(userTier, 표 요구티어)` 아니면 `HUB_TIER_LOCKED`(requiredTier·yourTier). 서버가 진짜 게이트, 웹은 뷰어 티어로 탭 잠금·분기 UX. paid 는 현재 잠금(가격 N23 후 멤버십 연동) | 실행계획서 W3 [CC] 몫. 게이트 방식 확정(N25)은 별개(RedemptionCode vs CF Access). 로직 11케이스 실측 |
| O57 | 2026-07-14 | **학부모 주간 통합 리포트 v1**: 신규 `guardian-report` 모듈(자체 prisma 집계) — 성적(janus_score)·세션 출석률(booking done/noshow)·상담기록 요약(민감 원문 제외)·Q&A 수. `GET /guardian/children`·`GET /guardian/report?studentId=&days=`(guardian, 링크 검증). 순수 도메인 `parent-report.ts`(조립·요약). 웹 `/guardian/report` + guardian roleHome 지정(기존 리다이렉트 루프 해소). 심리·민감 기록 제외 고지 | 실행계획서 W8 선완료. 도메인 10케이스 실측 |
| O58 | 2026-07-14 | **Q&A Q1(SLA·관계 루프)**: mig 0051 — qna_post 타임스탬프 4점(claimed_at·first_reply_at·resolved_at + rating·continue_pref) + `qna_relation_block`(소프트 블록). claim/answer/accept 시점 기록. 소프트 블록: 차단 선생님 화면·배정 큐에서 질문 미노출(claim은 NotFound 위장·사유 비노출). 해결 피드백 `POST /qna/posts/:id/feedback`(별점+계속여부, 계속=아니오→채택 선생님 블록). `POST·GET /qna/blocks`(설정/해제·목록) · `GET /qna/sla`(admin, 풀별 집계). 순수 `qna-sla.ts`(풀별 지연·해결률) | 실행계획서 W5·Q&A 감사 우선순위 1. SLA 6·도메인 실측. 잔여: 강제배정 정식화(우선순위 2)·상담승격/재답변(3) |

## 미결 (N) — 결정 대기

| 번호 | 기한 | 안건 | 상태 |
|---|---|---|---|
| N23 | W1 D6 초안 → W3 확정 | **유료 티어 가격** | 미착수 |
| N24 | W1 D6 초안 → W3 확정 | **무료 노출 수**(구간별 대표 N개) | 미착수 |
| N25 | W1 D6 초안 → W3 확정 | **게이트 방식**(권장: 자체 RedemptionCode/SSO 시작, 컨설턴트만 CF Access) | 미착수 |
| N26 | ~~스텝 3 착수 전~~ | ~~관문 히어로 방향 택1~~ → **O45로 확정(딥 포탈)** | 해소(7/13) |
| N27 | W8 | 리그 수치(승급 기준·2부 질문가·보상률·지정 가산) | 기획서 확정 후 운영 보정 |
| N28 | W8과 함께 | 포트폴리오(가·나·다 조합) 개발 여부 — 유료 티어 킬러 후보 | 백로그(스텝 4) |
| N29 | 주간 리뷰 | **허브 격차 탭 실엔진 연결 방식** — 현행 파일 서빙(격차 v2 HTML) 유지 vs 플랫폼 엔진 직결(janus_score→격차 계산 내재화) | 핸드오프 §4-4. 백로그 문서 §3 |
| N30 | 주간 리뷰 | **모바일 하단 탭 개편**(현행 7탭 → 시안 5탭 홈/질문/진단/일정/내정보) — 진단 모바일 뷰 필요 | 백로그 §2. 기능 보존 원칙으로 보류 중 |

## 승계 참조 (잇올 시절 주요 미결 중 야누스에 이어지는 것)

- N22 화이트보드 PDF 배경(룸 서비스) — 사업확장 후.
- O2/PG: 토스페이먼츠로 W9~10 실연동 예정(실행계획서).
