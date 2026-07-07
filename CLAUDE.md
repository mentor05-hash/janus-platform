# CLAUDE.md — janus-platform (야누스 모노레포)

> 새 세션은 **`docs/00_INDEX.md`부터 읽는다** — 폴더 지도·저장 규칙·문서 서열의 단일 진입점.
> 최종 갱신: 2026-07-07 (잇올 → 야누스 전환, W1 D1)

## 1. 프로젝트

**야누스(Janus)** — "미래를 여는 문". 진단(배치표·수준진단) → 처방(커리큘럼) → 실행(Q&A·상담·과외·클리닉·강의) → 통과의 전환 관문 플랫폼. 이 repo는 구 잇올(1:1 멘토링 플랫폼) 모노레포를 승계한 **janus-platform**(private)이다 — 코드베이스(NestJS API·React web·RN mobile·realtime-rooms·packages)는 그대로, 브랜드·문서 체계만 야누스로 전환 중.

## 2. 문서 체계 (서열 순 — 충돌 시 상위가 이기고 하위를 고친다)

| 서열 | 문서 | 위치 |
|---|---|---|
| 1 | 통합 사업종합기획서 v2 | `docs/10_master/` |
| 2 | 확장청사진(버티컬·글로벌) | `docs/10_master/` |
| 3 | **12주 실행계획서 v2 (활성 — 매일 체크)** | `docs/20_exec/` |
| 4 | 기능 기획서(QnA·커뮤니티·리그 등) | `docs/30_features/` |
| 5 | 디자인 브리프 (⚠영문 파일명만) | `docs/40_design/` |
| — | Decision-Register (결정 기록, O/N 번호) | `docs/20_exec/` |
| — | 구버전·이관 원본(수정 금지) | `docs/90_archive/` |

구 잇올 기술 문서(기능정의서·접속주소·화이트라벨 가이드 등)는 `docs/` 루트에 유지 — 코드 참조용으로 유효.

## 3. 세션 리추얼 (매 세션 고정)

- **시작:** `docs/00_INDEX.md` + 실행계획서의 "오늘" 항목 로드 → 오늘 태스크 1~3개 선언.
- **종료:** ① 커밋(+원격 연결 후 push) ② `git status`로 미추적 민감파일 확인 ③ 실행계획서 체크박스 갱신 ④ 결정 발생 시 Decision-Register 기록.
- "완료"의 정의 = **실측**(E2E·캡처·테스트 로그). 증빙 없으면 미완료.

## 4. 데이터·시크릿 (실행계획서 §1-2 — 위반 시 사업 리스크 직결)

- **저작권 데이터(어디가·esteacher·고속 JSON 등)는 이 repo에 절대 넣지 않는다** — private repo도 불가. `janus-data`(로컬 전용, remote 금지)에만 둔다.
- 코드에서 데이터 경로는 **`JANUS_DATA_DIR` ENV로만 참조** — 경로 하드코딩 금지.
- 티어 빌드 산출물 중 회원 이상(`dist-tier/{member,paid,consultant}/`)은 커밋·배포 금지 — 무료판만 공개.
- `.env*`·API 키·JWT/HMAC 시크릿·PII(생기부 업로드 등)·DB 덤프 커밋 금지. `.gitignore`에 등록돼 있음.

## 5. 한글 파일 패치 규칙

한글 포함 `.cjs`/HTML 수정은 **python 문자열 replace 또는 heredoc만** 사용(정규식 치환 금지 — 인코딩 깨짐 방지). 디자인 툴 산출물은 영문 파일명.

## 6. 디자인 통합 (진행 중 — W2·W3에 흡수)

지시서: `docs/20_exec/야누스_클로드코드_디자인통합_지시서_2026-07-07.md`. **스텝 0(감사) 완료 전 스텝 1~3 착수 금지.** 절충 원칙 4: ①로직·데이터 파이프는 기존 우선, 비주얼은 신규 우선 ②번들 HTML 직접 이식 금지(토큰 추출용) ③패리티 통과 전 구버전 삭제 금지(v23 병행) ④시안의 신규 기능은 백로그로(이번 범위 = 리스킨+티어 UI).
감사 산출물: `docs/design-integration/00_감사_중복매트릭스.md`.

## 7. 기술 스택·실행 (잇올 승계 — 변경 없음)

- 백엔드 NestJS(TypeScript·DDD) · DB PostgreSQL(+Redis) · 웹 React(Vite) · 모바일 React Native(Expo) · 실시간 룸 별도 서비스(:3100).
- API prefix `/api/v1` · JWT(access/refresh) · 응답 `{data,meta}`/`{error:{code,message}}` · 금액 정수(원) · UTC 저장/KST 표시.
- 외부 의존은 어댑터 뒤로: `PgProvider`·`NotificationProvider`·`StorageProvider`·`LlmProvider`·`ZoomProvider`·`MediaProvider(LiveKit)`.
- 로컬 실행: `docker compose -f docker-compose.full.yml up -d` → web :8080 · mobile :8090 · api :3000 · rooms :3100. 데모 계정·주소는 `docs/접속_주소_정리.md`.
- ⚠ compose 프로젝트명: 기존 볼륨(pgdata 등)은 `itall-mentoring_*` 이름 — 이 경로에서 compose 실행 시 `COMPOSE_PROJECT_NAME=itall-mentoring` 지정해야 기존 데이터 재사용.

## 8. 폴더 컨텍스트 (repo 밖)

```
janus/
├── 00_docs → 10_platform/janus-platform/docs (symlink — repo가 canonical)
├── 10_platform/janus-platform/   ← 이 repo
├── 20_data/    저작권·민감 데이터 (git remote 금지, 필요한 세션만 --add-dir)
├── 30_public/  janus-public (마케팅·무료 배치표 → Cloudflare Pages)
└── 40_workbench/  시안·임시물 (git X, 일요일 정리)
```
