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
