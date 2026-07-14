# 배치표 허브 운영 가이드

> 원칙(CLAUDE.md §4): 배치표·격차 리포트 HTML 은 **어디가 등 저작권 데이터가 포함**되므로
> 이 repo 에 절대 커밋하지 않는다. 파일은 로컬 데이터 디렉토리에 두고 **런타임 서빙**만 한다.

## 1. 배치 방법

1. 서버(.env)에 `JANUS_DATA_DIR=/path/to/janus-data` 설정 (경로 하드코딩 금지 — ENV 로만).
2. `JANUS_DATA_DIR/placement-hub/` 폴더를 만들고 배치표 HTML(영문 파일명)을 넣는다.
3. `manifest.example.json` 을 `JANUS_DATA_DIR/placement-hub/manifest.json` 으로 복사해 목록을 맞춘다.
   - manifest 는 **허용목록**이다 — 목록에 없는 파일은 어떤 경로로도 서빙되지 않는다.
4. 확인: `GET /api/v1/placement-hub/list` → 웹 `/placement/hub` 에 탭으로 나타난다.

## 2. 파일 생성(야누스판)

- 마스터 → 배포판 생성은 `build_janus_edition_v2.py` (원 작업 위치: 배치표 작업폴더 — 마스터·로고 SVG 와 같은 폴더에서 실행).
- 기능 수정은 항상 **마스터**에만 하고 이 스크립트로 재생성한다(배포판 직접 수정 금지).
- 산출물 파일명은 영문으로 바꿔 `placement-hub/` 에 배치(예: `jeongsi-2027-v25.html`).

## 2-1. 티어 빌드 파이프라인 (C4 — dist-tier 4종, 무료판만 공개)

마스터 1개 → 무료/회원/유료/컨설턴트 4종 산출. **저작권 데이터는 repo 밖**(마스터도 `JANUS_DATA_DIR` 로컬), 파이프라인 **코드만** repo 에 있다(C6).

- **빌드**: `python3 ops/placement/tier_build.py --src <마스터.html> --all --out dist-tier`
  - `--tier free` 로 무료판만도 가능. 산출은 `dist-tier/{tier}/` (전부 gitignore — 무료판은 janus-public `/baechi/` 로 배포, repo 커밋 금지).
- **무료판 검증(배포 전 필수)**: `python3 ops/placement/tier_verify.py dist-tier/free`
  - `tiers.config.json`의 `verify.forbidden`(원천 파일명·컷 스키마/수치) 검출 시 **비-0 종료** → 배포 차단. 워터마크·티어 플래그 존재도 확인. **실행계획서 W2 D1 ✅기준(원본 컷·표본 데이터 물리적 부재 grep 증빙) 자동화.**
- **파이프라인이 하는 일**: ①티어 게이트 영역 마스킹(마스터가 `<!--JANUS-TIER:member-->…<!--/JANUS-TIER-->` 로 감싼 상위-티어 데이터를 하위 판에서 물리 제거) ②지정 페이로드 제거(`tiers.config.json`의 `strip_assignments` — 센티넬 없는 기존 마스터용 폴백) ③FLAGS 주입(`window.__JANUS_FLAGS` — 마스터 JS 가 전체표·필터·고급·수치노출 게이팅) ④워터마크+면책 배너 전 화면 ⑤무료판 접속 로그 비콘(page `baechi`, C3).
- **마스터 준비(권장)**: 상위-티어 전용 데이터/UI 를 `<!--JANUS-TIER:LEVEL-->…<!--/JANUS-TIER-->`(LEVEL=member|paid|consultant)로 감싸 두면 티어 분리가 깔끔하다. 대형 데이터 배열은 `const __JANUS_CUTS__=…`처럼 이름을 `strip_assignments`에 등록하면 무료판에서 값이 `[]`/`{}`로 비워진다.
- **합성 테스트**: `ops/placement/fixtures/master_sample.html`(가짜 데이터·저작권 없음)로 빌드→검증 E2E 가 통과한다(무료판 통과·회원판은 데이터 보유로 검증 실패=공개 불가 확인). 실제 마스터는 이 픽스처 자리에 로컬 경로만 바꿔 물린다.

## 2-2. 격차 리포트 목표컷 실연동 (N29)

웹 `/placement/gap`(격차 리포트)이 목표 학과의 지원가능선(70%컷)을 **수동 입력 대신 검색**으로 채우게 하려면:

1. `targets.example.json` 을 `JANUS_DATA_DIR/placement-hub/targets.json` 으로 복사.
2. `targets[].cutNb`(전국누백 %)를 배치표 지원가능선으로 채운다(저작권 데이터 → repo 무반입, 로컬만).
3. 확인: 회원+ 로그인 상태에서 `GET /api/v1/placement-hub/targets?q=서울대` → 격차 페이지 검색창에 후보가 뜬다. 선택 시 대학·학과·컷이 자동 입력된다.

파일이 없으면(개발·CI) 격차 페이지는 **수동 입력 폴백**으로 동작한다. 컷 수치는 회원 티어 게이트 뒤에서만 검색된다(비로그인·free 는 빈 결과).

## 3. 티어 게이트 (접합계약 C2 — 토큰 없으면 무료판만)

- `tier: free`(또는 미지정)만 비로그인 공개. `member|paid|consultant` 는 로그인 사용자가
  `POST /placement-hub/ticket {slug}` 로 일회성 티켓(2분 TTL)을 받아 `file/:slug?t=티켓` 으로만 열람된다
  (iframe 은 Authorization 헤더를 못 실으므로 티켓 방식).
- 웹 허브(`/placement/hub`)는 비로그인 상태에서 회원급 탭에 잠금 패널을 띄운다. `?season=0` → 카이로스 탭 숨김.
- W3 SSO(`janus:sso`, 서비스 id `baechipyo`) 결합 시 티켓 발급을 티어별 권한으로 확장한다.
- 공개 배포 전 점검표(실행계획서 W2 D6): 무료판 외 파일은 공개 환경에 배치하지 않는다.
- 접합계약 전문·재통합 게이트: `docs/30_features/야누스_배치표_핸드오프_2026-07-14.md` (C1~C6 — 위반 금지).

## 4. 관련 문서

- 이론서(컨설턴트 교육용): `docs/30_features/야누스_정시배치표_이론서_컨설턴트교육용_2026-07-13.html`
- 예측선 방법론(대외 설명 논리): `docs/30_features/아우구르_예측선_방법론선언_2026-07-14.md`
