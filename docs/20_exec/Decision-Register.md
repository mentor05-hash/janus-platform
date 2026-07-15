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
| O59 | 2026-07-14 | **Q&A 강제배정 정식화 + 상담승격/재답변(감사 우선순위 2·3)**: (강제배정) `releaseStaleClaims`(클레임 30분 무응답→재개방)·`autoAssignOpen`(공개 15분 경과→센터 근무중 전임 중 unfit·블록 제외 최소부하 배정)·@Cron 10분 스윕(cron-lock)·`POST /qna/assign/sweep`(admin). 순수 `pickAssignee`. (불만족 후속) mig 0052 — `reanswer_count`·`reanswer_reason`·`escalated_booking_id`. `POST /qna/posts/:id/reanswer`(한도 REANSWER_LIMIT=3·이전 답변자 claim/answer 제외·SLA 리셋)·`POST /qna/posts/:id/escalate`(답변 선생님과 상담 예약 createAssigned·컨텍스트 이관·크레딧 부족/슬롯 없음 폴백). 웹 StudentQnaPage 재답변·상담승격 버튼 | 강제배정 3케이스 실측. reanswerLimit 정책값화·escalate 슬롯 UX는 후속 |
| O60 | 2026-07-14 | **격차 리포트 수시 확장**: `gap-report` 도메인에 `mode`('jeongsi' 전국누백 / 'susi' 내신등급) — 공통 밴드(둘 다 낮을수록 상위), 단위·근거 모드별(정시=어디가 백테스트 37%·MAE / 수시=대학발표 입결·최저 99.4%). `POST /scores/gap-report` mode+myGrade(수시). 웹 정시/수시 토글. + 데모 스니펫 `seed-demo-student01.sql`(성적 nb2.3·예약 출석 67%·상담 1·Q&A 2 — 리포트 실수치 확인용, 멱등) | 도메인 5케이스(정시·수시) 실측 |
| O61 | 2026-07-14 | **수시 목표컷 targets + Q3 AI 초안**: (targets) `searchTargets(mode)` — targets.json 을 mode별(정시 cutNb / 수시 cutGrade)로 검색, `?mode=` 추가, 웹 격차 모드 전환 시 재검색. (Q3 AI 초안) mig 0053 — `qna_post.ai_draft/ai_draft_at`. `LlmProvider.draftAnswer`(mock·claude). 질문 등록 즉시 비동기·일일상한(QNA_AI_DAILY_LIMIT=200)·실패무해로 AI 1차 초안 생성. 웹 학생/교사 카드에 "✦ AI 초안" 라벨+심리 고지, 교사는 "이 초안으로 시작"(프리필) | Q3 잔여(후속): 3부 공개 게시판·전원답변·리그·일3건·신고·단일채택 |
| O62 | 2026-07-15 | **Q3 커뮤니티 v1(3부 공개 게시판)**: mig 0054 — `qna_post +community/hidden/report_count`, `qna_community_answer`(작성자 임의계정·유사도·ai_similar), `qna_report`(대상별 신고자 1회 UNIQUE). 도메인 `qna-community`(일3건·전원답변 게이트·신고3건 숨김·AI 미표기 경고 유사도0.8+). 서비스/컨트롤러 7엔드포인트(질문 즉시 AI초안·목록 미답변필터·상세·답변 AI유사경고·단일채택 트랜잭션·신고 누적숨김·실적통계). 웹 `CommunityBoardPage`(학생 `/student/community/board`·교사 `/app/community`). 유료 Q&A(교사전용 정산)와 **완전 분리** — 커뮤니티는 무정산 | **E2E 11/11 실측**(맥북 스택): 질문→AI초안→교사·학부모 답변→본인답변403→단일채택 resolved→마감후403→신고3건 숨김→중복409→실적(authored2/accepted2/100%). 도메인 8/8. 리그 승급(3부→2부)은 잔여(N27 수치 확정 후) |
| O63 | 2026-07-15 | **웹 진입 동선 + 메인 IA 개편**: (동선) 로그인 후 사이드바에 '배치표 허브'·'격차 리포트' 진입점, 로고 클릭→랜딩, 랜딩 로그인 시 '내 관문으로'(대시보드 복귀 고리 완성). (IA) 메인 GNB(배치표·질문답변·강좌·1:1상담·서비스)를 라우팅 대신 `?sec=` 소개 탭으로 — 상단 고정+아래만 소개 패널 스왑(급격한 툴 전환 제거, 방문자 정돈). `LandingIntro` 컴포넌트 | 사용자 피드백(로그인 후 허브 접근 불가·랜딩 복귀 막힘) 반영. 소개 문구는 후속 다듬기 |
| O64 | 2026-07-15 | **Q3 리그 v1(3부→2부→1부)**: mig 0055 `qna_league`(tier·실적 스냅샷·promoted_at). 도메인 `qna-league`(evaluateLeague/nextTierNeed 순수·등급 라벨). 임계값 `system_setting['qna_league_policy']`(N27 미정 → admin PUT 조정, 코드 기본값). 서비스: 내 리그·리더보드·정책 get/set + **채택 시 답변자 자동 재평가·승급**. 컨트롤러 4엔드포인트. 웹 커뮤니티 보드에 내 등급·진행도·리더보드 | **E2E 실측**(맥북): 정책설정→답변·채택→3부→2부→1부 자동승급·리더보드. 도메인 7/7. **2부 유료 답변권·보상은 N27 확정 후 후속** |

| O65 | 2026-07-15 | **수능 성적 학생 자가 입력(C1 단일소스)**: mig 0056 `score_item+sub_subject`. `POST/GET /scores/me`(학생) — 표점(std)/전국누백(nb) 모드·계열(gye)·7과목(국·수·영·한국사·탐구1·탐구2·제2외국어)+세부과목. `upsertReport` 재사용 + `placement{gye,nb}`. **janus_score C1 키 동결**(세부과목·제2외국어는 메타, 브리지 무시). 웹 `StudentScoreInputPage`(모드별 안내·저장 시 linkable+배치표/격차 바로가기). **환산(표점→누백→지원선)은 플랫폼이 안 함 — 배치표 엔진에 위임(사용자 택1, C6 데이터경계): 플랫폼은 표점/누백 그대로 전달만** | E2E: 표점·누백 저장→janus_score 산출→격차 연동. API tsc clean·web build clean. 백분위 직접입력은 미지원(C1=표점/누백 택1) |

| O66 | 2026-07-15 | **수준진단(실력진단) v1 + 클리닉**: mig 0057 diagnostic_question/attempt/response + 데모 문항 8. 도메인 채점·유형별 약점(정답률<60)·처방(순수). start(정답은닉)·submit·이력·상세·**clinic(약점 유형만 재출제)**. 웹 실력진단(과목 선택→퀴즈→결과: 점수·유형별 정답률바·약점·처방+**점수 추이 차트**). 실문항(kice)은 후속 로컬 주입 | 도메인 5/5. 데모로 실동작(외부 연동 없음) |
| O67 | 2026-07-15 | **학습 플랜 + 강좌 v1 + 워딩/IA**: (플랜) GET /curriculum/me — 진단 약점+성적 → 우선순위 처방 카드. (강좌) mig 0058 lecture/enrollment + 데모 5강, /lectures·enroll·me, 웹 카탈로그(전체/내 수강·과목필터). (연결) 진단 처방·플랜 → 질문(?subject 프리필)·자료(?subject 필터)·강좌(?subject). (IA) 수준진단→**실력진단**·수능성적입력→**성적진단** 대구, 사이드바 섹션화(진단/배치·성적/학습·상담/내 계정). 배치표 허브·격차를 레이아웃 안(embedded)에서 열어 사이드바 유지 | 사용자 지시(1~8 순차). tsc/build clean |
| O68 | 2026-07-15 | **알림·검색·모바일·상담 UX**: (알림) 커뮤니티 답변/채택/리그 승급 시 notify(템플릿 3종)→기존 outbox+실시간 토스트, 웹 사이드바 미읽음 뱃지(학생·교사). (검색) 커뮤니티 과목·키워드 검색(listCommunity subject·q). (모바일) 학부모 자녀 상세 리포트(주간요약+성적추이+상담기록 드릴다운). (상담) 신청 완료 화면 막다른길 제거·다음단계 안내·역할별 분기 | API tsc clean(기존5)·web/mobile clean. 실측은 사용자 스택 |

| O69 | 2026-07-15 | **강좌 심화 + 리그 페이지**: 교사 강좌 등록/관리(POST /lectures·mine·active), 강좌 상세/진도(mig 0059 video_url·progress, GET/:id·PATCH/:id/progress, 영상 슬롯+진도바), 리그 리더보드 독립 페이지(/student/league) | tsc/build clean |
| O70 | 2026-07-15 | **관리자 통계 + 진단 문항 관리 + 검색**: admin-stats(GET /admin/stats/overview — 진단·강좌·커뮤니티 지표), 진단 문항 관리자 CRUD(/admin/diagnostics/questions), 강좌 검색(catalog q), 자료실 검색(기존) | tsc/build clean |
| O71 | 2026-07-15 | **모바일·UX·품질**: 학부모 모바일 알림 뱃지+최근알림+자녀 컨텍스트, 상담 예약 슬롯 UX(오늘/내일 라벨·미선택 안내), 학생 홈 위젯 집약(진단·플랜·알림 동적), 반응형(<768px 사이드바 가로네비)·접근성(focus-visible·클릭카드 키보드), 학습흐름 통합 E2E | web tsc0·mobile tsc0 |
| O72 | 2026-07-15 | **기능 심화(4~13)**: 커뮤니티 답변·채택 실시간(소켓 community room), 학부모 웹 리포트 상세화(성적추이+상담노트), 진단 결과 공유·PDF(Web Share/인쇄), 전역 통합검색(강좌·자료·커뮤니티·선생님 — 도메인 서비스 재사용), 약점 클리닉 별도 추적·추이(is_clinic·향상도), 상담 후기 reviewed 노출(중복폼 방지), 번들 코드분할(main 1.25MB→74KB), 다크모드 --danger 토큰화, 데모 시드 확장(0062), ops E2E CI 자동화(smoke-e2e 잡) | api tsc0·web tsc0·mobile tsc0·web build |
| O73 | 2026-07-15 | **품질 정비**: 코드리뷰(검색 teacher href 버그 수정), tsc spec 5건 정리(API tsc 0 달성), 도메인 유닛테스트(summarizeClinic·SEARCH_HREFS), 통합검색·클리닉 E2E, 마이그레이션 순번 검사(migrate:check+CI), 모바일 패리티(통합검색·커뮤니티 실시간·클리닉 추이), SessionStart 훅(웹 세션 의존성 자동화) | api tsc0·web tsc0·mobile tsc0·node 실측 |


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
| N30 | 주간 리뷰 | **모바일 하단 탭 개편**(현행 7탭 → 시안 5탭 홈/질문/진단/일정/내정보) — 진단 모바일 뷰 필요 | 백로그 §2. 기능 보존 원칙으로 보류 중. (부분: 클리닉 추이 카드는 ScoresScreen에 편입 O73, 통합검색은 헤더 오버레이로 제공) |

## 승계 참조 (잇올 시절 주요 미결 중 야누스에 이어지는 것)

- N22 화이트보드 PDF 배경(룸 서비스) — 사업확장 후.
- O2/PG: 토스페이먼츠로 W9~10 실연동 예정(실행계획서).
