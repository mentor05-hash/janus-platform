# 배치표 허브 운영 가이드

> 원칙(CLAUDE.md §4): 배치표·격차 리포트 HTML 은 **어디가 등 저작권 데이터가 포함**되므로
> 이 repo 에 절대 커밋하지 않는다. 파일은 로컬 데이터 디렉토리에 두고 **런타임 서빙**만 한다.

## 1. 배치 방법

1. `JANUS_DATA_DIR/placement-hub/` 폴더에 배치표 HTML(영문 파일명)을 넣는다.
2. `manifest.example.json` 을 `JANUS_DATA_DIR/placement-hub/manifest.json` 으로 복사해 목록을 맞춘다.
   - manifest 는 **허용목록**이다 — 목록에 없는 파일은 어떤 경로로도 서빙되지 않는다.
3. **docker 실행 시(권장)** — full 스택은 호스트 데이터 폴더를 컨테이너에 읽기전용 마운트한다.
   `JANUS_DATA_DIR_HOST` 에 **placement-hub 를 담은 상위 폴더**(예: `20_data`) 경로를 준다:
   ```
   JANUS_DATA_DIR_HOST=/절대경로/janus/20_data \
     docker compose -f docker-compose.full.yml up -d --build api web
   ```
   컨테이너 안에선 `JANUS_DATA_DIR=/data/janus` 로 고정(compose 에 내장) → `/data/janus/placement-hub/` 를 읽는다.
   미설정 시 `./janus-data`(gitignore) 로 폴백 → 없으면 빈 폴더 → 허브는 '준비 중'(+계산기 탭만).
   **로컬 node 실행 시**는 `.env` 의 `JANUS_DATA_DIR=` 를 실제 경로로 두면 된다.
4. 확인: `GET /api/v1/placement-hub/list` → `available:true` → 웹 `/placement/hub` 에 탭으로 나타난다.

> ⚠ 이전에 `docker-compose.full.yml up` 만 하면 허브가 계속 '준비 중' 이던 이유 = compose 에 데이터 마운트가 없었기 때문(수정됨). 이제 `JANUS_DATA_DIR_HOST` 만 주면 된다. `-f docker-compose.full.yml` 은 `docker-compose.override.yml` 을 자동 병합하지 않으므로 setup-demo-hub.sh 의 override 대신 위 방식을 쓴다.

## 2. 파일 생성(야누스판)

- 마스터 → 배포판 생성은 `build_janus_edition_v2.py` (원 작업 위치: 배치표 작업폴더 — 마스터·로고 SVG 와 같은 폴더에서 실행).
- 기능 수정은 항상 **마스터**에만 하고 이 스크립트로 재생성한다(배포판 직접 수정 금지).
- 산출물 파일명은 영문으로 바꿔 `placement-hub/` 에 배치(예: `jeongsi-2027-v25.html`).

## 2-1. 티어 빌드 파이프라인 (C4 — dist-tier 4종, 무료판만 공개)

마스터 1개 → 무료/회원/유료/컨설턴트 4종 산출. **저작권 데이터는 repo 밖**(마스터도 `JANUS_DATA_DIR` 로컬), 파이프라인 **코드만** repo 에 있다(C6).

- **빌드**: `python3 ops/placement/tier_build.py --src <마스터.html> --all --out dist-tier`
  - `--tier free` 로 무료판만도 가능. 산출은 `dist-tier/{tier}/` (전부 gitignore — 무료판은 janus-public `/baechi/` 로 배포, repo 커밋 금지).
- **티어별 검증**: `python3 ops/placement/tier_verify.py dist-tier/<tier> --tier <tier>`
  - `tiers.config.json`의 `verify.tiers[tier].forbidden` 검출 시 **비-0 종료**. 워터마크·티어 플래그 존재도 확인.
  - **무료판**(`--tier free`): 저작권 원천·컷 + 상위(회원/유료/컨설턴트) 전용 **전부 부재** → 공개 배포 가능(W2 D1 ✅기준 자동화, janus-public `/baechi/`).
  - **회원판**(`--tier member`): 상위(유료/컨설턴트) 전용만 부재 — **회원 데이터는 정상 보유**. 회원판은 **공개 배포 대상이 아님**(무료 기준으로 검증하면 실패=정상). `JANUS_DATA_DIR/placement-hub/` 에 두고 **허브 티켓 게이트(C2·회원 티어)** 뒤에서만 서빙한다.
  - 합성 픽스처 4종 전부 자기 티어 검증 통과 + 회원판을 free 기준으로 보면 실패(공개불가 확인) — E2E 실증됨.
- **파이프라인이 하는 일**: ①티어 게이트 영역 마스킹(마스터가 `<!--JANUS-TIER:member-->…<!--/JANUS-TIER-->` 로 감싼 상위-티어 데이터를 하위 판에서 물리 제거) ②지정 페이로드 제거(`tiers.config.json`의 `strip_assignments` — 센티넬 없는 기존 마스터용 폴백) ③FLAGS 주입(`window.__JANUS_FLAGS` — 마스터 JS 가 전체표·필터·고급·수치노출 게이팅) ④워터마크+면책 배너 전 화면 ⑤무료판 접속 로그 비콘(page `baechi`, C3) **⑥배포 감지 프로브+오류 링버퍼(A4) ⑦미러 감지(A6) ⑧입시 캘린더 D-day(A7)** — ⑥~⑧은 아래 2-1-1.

### 2-1-0. 질량 예산 — 배포를 막는 것은 이름이 아니라 크기다 (2026-08-12)

**왜 바뀌었나.** 이전 파이프라인은 두 게이트가 모두 *이름 목록*이었다 — 빌드는 `<!--JANUS-TIER:…-->`
센티넬과 `strip_assignments` 의 변수명으로 삭감했고, 검증은 `forbidden` 11개 토큰의 부재만 봤다.
그런데 **실마스터에는 그 센티넬도, 그 변수명도, 그 토큰도 전부 0건**이었다. 결과적으로
저작권 데이터 8MB 를 통째로 담은 무료판 산출물이 `(페이로드 제거 0)` 을 찍고 `✅ 통과` 로 나왔다.
금지목록은 목록에 없는 것을 조용히 통과시킨다 — 대응은 토큰 추가가 아니라 판정 근거의 교체다.

**지금의 판정 계층** (하나라도 걸리면 산출물을 **쓰지 않고** 비-0 종료)

| 계층 | 무엇 | 이름 의존 |
|---|---|---|
| 삭감(a) 이름 기반 | `strip_assignments` — 알려진 작은 페이로드 | 있음(보조) |
| 삭감(b) **크기 기반** | `structure.strip_literal_over_bytes`(8KB) 이상 대입 리터럴을 **전부** | **없음** |
| 게이트 파일 질량 | `file.max_bytes`(160KB) · `max_gzip_bytes`(48KB) | 없음 |
| 게이트 세트 질량 | `set.*` — 디렉토리 전체, **확장자 무관·재귀**(사이드카·분할 적재 합산) | 없음 |
| 게이트 잔존률 | 입력 256KB 초과 시 산출/입력 ≤ 5% — **삭감 no-op 을 정면으로 잡는다** | 없음 |
| 게이트 구조 | 삭감 안 된 8KB+ 리터럴, base64 밀수 흔적(다양 알파벳 256자+) | 없음 |
| 게이트 **실효 질량** | base64 덩어리를 디코드·압축해제해 **푼 크기**를 합산 — 사전 압축 밀수 차단 | 없음 |
| 게이트 설정 | `publishable`·`publish` 미선언, 코드 상수 `HARD` 초과 완화 → exit 2 | — |
| 보조 게이트 | `forbidden` 토큰 검출(차단은 하되 **이것만 믿지 않는다**) | 있음 |

⚠ **왜 '실효 질량'이 필요한가** — gzip 바이트를 정보량 프록시로 쓰면 **이미 압축된 데이터**에 속는다.
레드팀 실측(2026-08-12): 269.5KB 페이로드를 lzma+base64 로 압축해 *대입이 아닌* `<script type="text/plain">` 에
넣고 76열로 청킹하면 — 삭감(대입 아님)·opaque_run(청크 ≤76)·gzip 질량(이미 압축돼 더 안 줄어듦)을 전부 피해
**18.3KB 산출물이 통과**했다. 청크를 24자·12자로 줄여도 압축비는 1.31~1.32 로 불변이라 런길이 임계로는 못 막는다.
그래서 구분자를 제거하고 디코드해 **풀어서 잰다**. 압축 해제에 성공한 것만 세므로 정상 산출물은 해제분 0바이트다(실측 4종).

실측 근거(2026-08-12): 실마스터 3종 5.4MB·8.2MB·13.0MB → 삭감 후 **62.0KB·73.9KB·98.6KB**
(이름 지식 0으로 크기삭감 2·2·6건), 잔존률 0.70~0.99%. 상한은 정상 최대치의 약 1.6배.

**임계값 재측정** — 새 마스터가 들어오면 이 한 줄이 유일한 정기 유지 작업이다:

```bash
python3 ops/placement/measure.py --report <마스터.html|퍼블리시 디렉토리>
```

**회귀 테스트** — 위 사고 조건(센티넬 0·변수명 0·토큰 0)을 합성 픽스처로 재현해 실패시킨다.
저작권 데이터를 쓰지 않으며 CI(`tier-build` 잡)에 편입돼 있다:

```bash
python3 ops/placement/tests/test_tier_gate.py
```

⚠ **API 서빙 경로에도 같은 상한이 걸려 있다** — `placement-hub.service.ts` 의 무티켓(무료) 반환은
`FREE_SERVE_MAX_BYTES`/`FREE_SERVE_MAX_GZIP` 를 넘으면 `HUB_FREE_OVERSIZE` 로 거부한다.
`manifest.json` 의 `tier` 를 `paid`→`free` 로 바꾸거나 `tier` 키를 빠뜨려도(그 경우 무료로 판정된다)
마스터가 무인증 공개되지 않는다. 두 상한은 같은 값이며 바꿀 때 함께 바꾼다.

### 2-1-1. 무료판 운영 안전판 A4·A6·A7 (벤치마크 노트 §1)

근거: `docs/30_features/야누스_벤치마크노트_엑셀코스피_2026-08-07.md` §1. 티어별로 `tiers.config.json`
의 `tiers.{t}.{build_probe|mirror_guard|exam_dday}` 플래그로 켠다 — **현재 무료판만 ON**. 세부 설정은
같은 파일의 `runtime` 섹션. 무료판 `verify.required` 에 `[야누스 A4]`·`[야누스 A6]`·`[야누스 A7]`
표식이 들어 있어, 주입이 조용히 빠지면 **`tier_verify.py` 가 배포를 막는다**.

- **A4 — 배포 감지 + 오류 링버퍼**
  `<meta name="janus-build-id">` + 산출 디렉토리의 사이드카 `janus-build.json`. 페이지가 주기적으로
  (기본 300초, 탭 복귀 시에도) 사이드카를 `no-store` 로 읽어 build-id 가 다르면 **"새 버전이 있습니다"**
  배너를 띄운다(새로고침 버튼. `auto_reload_sec=0` 이 기본 — 입력 유실 방지). 사이드카 파일명은 고정이라
  HTML 을 리네임해 배포해도 유지되고, 404 면 조용히 비활성된다.
  build-id 는 `JANUS_BUILD_ID` 가 있으면 그 값, 없으면 **산출 내용+티어+설정+캘린더 해시**(같은 입력이면
  같은 id — 재빌드만으로 배너가 뜨지 않는다).
  클라이언트 오류는 **최근 30건 링버퍼**(`window.__janusErrors()`)로 잡는다 — JS 오류·미처리 프로미스
  거부·자산 로드 실패. **전송은 스텁**(`window.__JANUS_ERR_SINK = null`), 여기에 함수를 물리는 순간부터
  전송된다. 시즌 트래픽(W9~10) 중 배포 사고의 완충 장치.
  ⚠ **배포 시 HTML 과 `janus-build.json` 을 함께 올려야 한다** — 사이드카만 남으면 계속 배너가 뜬다.

- **A6 — 미러(무단 복제본) 감지**
  허용 호스트 밖에서 열리면 전면 안내 + 원본 리다이렉트. **허용 목록·원본 주소는 repo 에 없고 빌드 시
  ENV 로만 주입한다**(도메인 미결 — 하드코딩 금지). 산출물엔 호스트가 평문이 아니라 djb2 해시로만 들어간다.
  - `JANUS_ALLOWED_HOSTS` 미설정 → 스니펫은 들어가되 **런타임 no-op**(오검출 0).
  - `JANUS_CANONICAL_ORIGIN` 미설정 → **안내만 하고 리다이렉트하지 않음**(오배송 방지).
  - 판정 불가(`file://` 등 빈 hostname) → 통과.
  완벽 방어는 아니지만(스크립트 제거 가능) 캐주얼 미러를 원본 트래픽으로 회수한다 — 워터마크와 함께
  데이터 권리 대응 패키지의 보조 장치.

- **A7 — 입시 캘린더 D-day 1곳**
  우하단 칩에 다음 일정(`다음 일정 9월 모평 D-26`)을 띄운다. 날짜 단일 소스는
  `packages/exam-calendar/src/events.json` — 파이썬 빌드와 TS(`@mentoring/exam-calendar`)가 **같은 파일**을
  읽는다(TS 상수는 `npm run gen:calendar` 생성물, CI 가 `--check` 로 동기화 확인).
  ⚠ 현재 2027학년도 9건은 전부 `status: provisional`(관례 기반 잠정) — 칩에 **`잠정` 배지**가 함께 나간다.
  평가원·대교협 공고와 대조해 `confirmed` 로 올리는 것이 공개 배포 조건.

**빌드 ENV(전부 선택 — 미설정이면 위 안전 기본값)**

허용 호스트는 두 형태를 받는다. `example.com` 은 **정확히 그 호스트만**, `*.example.com` 은
**그 도메인과 모든 하위 도메인**이다. 와일드카드는 Cloudflare Pages 미리보기처럼
`<해시>.<프로젝트>.pages.dev` 로 **앞 라벨이 매번 바뀌는 주소**를 위한 것이다 — 정확 일치만 쓰면
미리보기 배포가 미러로 판정돼 튕긴다(하필 배포를 검증하는 순간에 걸린다).
대조는 문자열 끝일치가 아니라 **라벨 경계**로 한다: `*.pv.example` 은 `a.b.pv.example` 을 허용하지만
`pv.example.evil.io` 는 허용하지 않는다.

**무료 배치표 확정값(2026-08-08 도메인 확보 — O210 의 ENV 자리를 채운 값)**

```bash
JANUS_ALLOWED_HOSTS="ianuspath.com,www.ianuspath.com,*.ianuspath.pages.dev" \
JANUS_CANONICAL_ORIGIN="https://ianuspath.com" \
  python3 ops/placement/tier_build.py --src <마스터.html> --tier free
```

- **원본은 apex**(`ianuspath.com`) — 고정주소 배포계획 §52 의 "데모는 `demo.<도메인>`, apex 는
  마케팅/랜딩" 갈래를 따른다. `demo.ianuspath.com` 은 **Cloudflare Access 뒤의 앱**이라 여기 쓰지 않는다
  (무료 배치표는 janus-public → Pages 로 나가는 별개 배포다).
- **Pages 프로젝트 = `ianuspath`**(2026-08-08 확정) → 기본 주소 `ianuspath.pages.dev`, 미리보기
  `<해시>.ianuspath.pages.dev`. 원천은 **janus-public 저장소 `main`** 브랜치, 커스텀 도메인은
  `ianuspath.com`·`www.ianuspath.com`(W2 D4).
- 값은 **repo 에 커밋하지 않는다**. 산출물에도 djb2 해시만 들어간다(평문 호스트 없음 — 시뮬 테스트가 검사).

| ENV | 없을 때 |
|---|---|
| `JANUS_ALLOWED_HOSTS` | 미러 감지 런타임 no-op |
| `JANUS_CANONICAL_ORIGIN` | 안내만, 리다이렉트 없음 |
| `JANUS_BUILD_ID` | 내용 해시로 자동 결정 |
| `JANUS_BUILD_PROBE_SEC` | `runtime.build_probe.interval_sec`(300초) |

**시뮬 테스트**(브라우저 없이, CI `tier-build` 잡에서 자동 실행):

```bash
node ops/placement/tests/mirror_guard_sim.mjs   # A6 — 허용/비허용 호스트 판정·원본 이동
node ops/placement/tests/build_probe_sim.mjs    # A4 — 배너 조건·링버퍼 30건·전송 훅 스텁
node ops/placement/tests/gate_negative_sim.mjs  # 게이트 음성 대조 — 일부러 망가뜨린 빌드로 verify 가 죽는지
```

**거짓 통과 방지 장치**(세 스크립트 공통) — "통과"만 세는 검사는 검사기가 죽어 있어도 통과한다.
그래서 다음을 강제한다:

1. **음성 대조** — `gate_negative_sim.mjs` 가 A4/A6/A7 를 하나씩 끈 빌드를 만들어 `tier_verify.py` 가
   **비-0으로 죽고 누락 표식을 지목하는지** 확인한다. 금지 패턴 검출·빈 디렉토리(검사 대상 0건)도 함께.
2. **단언 실행 수 하한** — 각 스크립트가 `MIN_CHECKS` 미만으로 끝나면 실패시킨다. 루프가 0회 돌거나
   단언이 조용히 건너뛰어지면 "0건 통과"가 나오는데, 그걸 통과로 인정하지 않는다.
3. **스니펫 실물 확인** — 추출한 코드가 빈 문자열이면 "배너 없음"류 단언이 전부 통과해버리므로,
   길이와 핵심 토큰(`Math.imul`·`__janusErrors` 등) 포함 여부를 못박는다.

돌연변이로 실증(2026-08-07): 링버퍼 상한 30→5 · 미러 허용 판정 무력화 · A7 주입 제거 — **세 경우 모두
해당 테스트가 비-0으로 실패**했다. 테스트를 고칠 때 이 성질이 깨지지 않았는지 같은 방식으로 확인할 것.

증빙(합성 픽스처): `docs/screenshots/manual/baechi-free-a{4,6,7}-*.png` · `baechi-free-a4a6a7-test.md`.
브라우저 확인은 무료판을 그대로 서빙해서 한다 — `.claude/launch.json` 의 `baechi-free-preview`
(`dist-tier/free` 를 :8791 로). `localhost`=허용 호스트, `127.0.0.1`=비허용 호스트로 잡으면
**같은 서버로 미러 감지까지 실측**된다.
- **마스터 준비(권장)**: 상위-티어 전용 데이터/UI 를 `<!--JANUS-TIER:LEVEL-->…<!--/JANUS-TIER-->`(LEVEL=member|paid|consultant)로 감싸 두면 티어 분리가 깔끔하다. 대형 데이터 배열은 `const __JANUS_CUTS__=…`처럼 이름을 `strip_assignments`에 등록하면 무료판에서 값이 `[]`/`{}`로 비워진다.
- **합성 테스트**: `ops/placement/fixtures/master_sample.html`(가짜 데이터·저작권 없음)로 빌드→검증 E2E 가 통과한다(무료판 통과·회원판은 데이터 보유로 검증 실패=공개 불가 확인). 실제 마스터는 이 픽스처 자리에 로컬 경로만 바꿔 물린다.

### 2-1-2. 수능 당일 파이프라인 (N4 — 가채점) `pipeline_run.sh`

수능 종료 17:40 → 업체 가채점 19:00 → **우리 창은 19:30~20:00, 30분**이다. 그 30분에
사람이 판단할 일을 남기지 않는 것이 이 스크립트의 목적이다.

```bash
# 리허설(합성 8MB 마스터를 그 자리에서 만들어 전 과정을 태운다)
ops/placement/pipeline_run.sh --mode dry-run

# 당일
JANUS_ALLOWED_HOSTS="ianuspath.com,www.ianuspath.com,*.ianuspath.pages.dev" \
JANUS_CANONICAL_ORIGIN="https://ianuspath.com" \
ops/placement/pipeline_run.sh --mode gachaejeom \
  --data-dir "$JANUS_DATA_DIR" --master <마스터.html> \
  --base <전년도_환산표.json> --difficulty <당해년_등급컷.json> --target-year 2027
```

단계: 0 선검사 · 1 환산표(P2) · 2 마스터(데이터트랙) · 3 티어빌드 · 4 티어검증 ·
5 청정검증 · 6 배포 · 7 사이드카 · 8 실측 · 9 결산(단계별 소요시간).

⚠ **0단계가 이 스크립트의 존재 이유다.** 드라이런은 통과하는데 당일에 죽는 경로가 실재한다 —
픽스처에는 `JANUS-TIER` 센티넬이 있고 **실마스터에는 0건**이기 때문이다(2026-08-08 실측).
그래서 빌드 전에 센티넬부터 세고, 0 이면 즉시 죽는다. 4단계까지 갔다가 죽으면 남은 시간이 없다.

0단계가 막는 것:

| 검사 | 놓치면 |
|---|---|
| 센티넬 0건 | 4단계 `tier_verify` 에서 죽는다 — 19:55 에 알게 된다 |
| **마스터가 환산표보다 오래됨** | 오늘 만든 환산표가 반영되지 않은 배치표가 나간다(가장 흔한 실수) |
| 환산표 JSON 무효 | 3단계에서 죽는다 |
| `JANUS_ALLOWED_HOSTS` 미설정 | A6 미러 감지가 런타임 no-op — 경고만(배포는 진행) |

**이 스크립트는 마스터를 만들지 않는다.** 마스터 생성(`gen_jeongmil.cjs`·`build_janus_edition_v2.py`)은
배치표 독립 트랙 몫이고, 후자는 CLI 도 없이 cwd 상대경로로 동작한다. 파이프라인은
`--master-cmd` 로 그 명령을 위임받거나, 이미 만들어진 마스터를 **검사하고 배포한다**.

### 2-1-3. 가채점 환산 `gachaejeom_convert.py` (N4-P2)

수능 당일 19:00 에 손에 있는 것은 **업체 추정 등급컷**뿐이다. 실채점 표준점수 분포는
12/11 에야 나온다. 그래서 없는 분포를 지어내지 않고 있는 것 둘을 잇는다:

1. 전년도 실측 환산표(원점수 → 표준점수·백분위) — 기저
2. 당해년 추정 등급컷(원점수) — 보정

같은 등급의 컷은 **같은 실력 지점**이다. 두 원점수를 짝지어 구간선형 사상을 만들면
"올해 원점수 R 은 작년 척도로 몇 점인가"가 나오고, 거기서 기저의 표준점수·백분위를 읽는다.
등급컷 사이는 선형 보간이다 — 가진 정보가 그 이상을 허락하지 않으므로 그 이상을 주장하지 않는다.

```bash
python3 ops/placement/gachaejeom_convert.py \
  --base <전년도_환산표.json> --difficulty <당해년_등급컷.json> \
  --target-year 2027 --out <가채점_환산표.json>
```

- 보정 미제공 시 **보정하지 않는다**(항등) + 산출에 `caveat` 를 남긴다. 없는 것을 지어내지 않는다.
- 영어·한국사는 `type: absolute` — 등급컷만 쓴다.
- 산출의 `disclaimer`("가채점 기반 추정치입니다…")는 **선택 필드가 아니다.** 배치표·리포트에 그대로 실린다.
- 뒤집힌 환산표·어긋난 등급컷·범위 밖 값은 **예외로 죽는다.** 19:30 에 "이상하지만 통과"는 가장 비싼 실패다.
- 기저·보정 파일은 `JANUS_DATA_DIR` 로컬 전용 — repo 반입 금지(C6). 테스트는 합성 픽스처만 쓴다.

**플랫폼 접합(O226)**: 산출 JSON 의 경로를 API 에 `JANUS_GACHAEJEOM_TABLE` 로 물리면
`POST /scores/me` 의 `mode: 'raw'`(가채점 원점수)가 열린다. 서버가 이 표로 추정 표준점수를 만들고
`janus_score.est='gachaejeom'` 을 실어 배치표가 면책을 낼 수 있게 한다. 표의 **과목 키는 janus_score
키**(`kor`·`mat`·`tam1`·`tam2`·`eng`·`han`)를 쓴다 — 이름을 두 벌로 유지하면 매핑이 어긋나는 날이 온다.
표가 없으면 API 는 400 으로 거절한다(조용한 폴백 금지). 계약 상세는
`docs/janus_score_변환스펙_v1_2026-07-07.md` §9.

**회귀**(CI `tier-build` 잡 편입):

```bash
python3 ops/placement/tests/test_gachaejeom_convert.py   # 역검증·난이도 방향·조용한 실패 금지
python3 ops/placement/tests/test_pipeline_gate.py        # 센티넬 음성 대조(빌드 전에 죽는가)
```

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
- **유료 배치표 상품(O74)**: `tier: paid` 표는 tierForRole≥paid(admin/hr) **또는** 상품 권한(`service_entitlement`)이 덮으면 티켓 발급.
  전체 배치표(`baechipyo-full`)=모든 kind, 정시 정밀배치표(`baechipyo-jeongsi`)=`kind: jeongsi`만. 그래서 **정시 정밀표는 manifest 에서 `kind: "jeongsi"` 로 표기**해야 정시 상품이 열 수 있다.
  권한 부여는 `POST /admin/entitlements {accountId, productKey, expiresAt}`(일회성 기간제) — 결제 훅은 후속(성공 콜백이 동일 grant() 호출).
- 공개 배포 전 점검표(실행계획서 W2 D6): 무료판 외 파일은 공개 환경에 배치하지 않는다.
- 접합계약 전문·재통합 게이트: `docs/30_features/야누스_배치표_핸드오프_2026-07-14.md` (C1~C6 — 위반 금지).

## 3-1. 공개 상업화 방어(O76 — 유출 억지·귀속·원천차단)

유료(비무료) 표 서빙에 자동 적용:
- **1회용 티켓**: `?t=` 티켓은 1회 사용 후 소멸(재열람=재발급). 유출된 URL 재사용 차단.
- **per-user 워터마크**: 서버가 서빙 직전 열람자(이름·loginId·시각 KST)를 가시 오버레이(대각 타일)로,
  지문 토큰(`<!--jns-fp:base64url(loginId|accountId|ts)-->` 2곳 + `#jns-wm[data-fp]`)을 비가시로 주입.
  유출본에서 `jns-fp` grep → base64url 디코드로 계정·시각 귀속. ⚠ 조작 제거 가능(억지·귀속 장치) —
  대량 유출 **원천차단**은 아래 thin-slice 가 담당.
- **일일 상한**: 계정당 유료 파일 티켓 40회/일 · slice 600행/일. 초과 시 `HUB_DAILY_CAP`(감사 로그 기록).
- **감사 로그**: 티켓 발급(hub.ticket)·유료 서빙(hub.file)·상한 초과(hub.cap.*) 전건 audit_log.

**thin-slice (공개 상업화 기본 경로 — 전체 파일 대신 조회 행만)**
- `GET /placement-hub/slice/:slug?q=&limit=` — 게이트는 티켓과 동일(티어 또는 상품 권한).
  요청당 최대 30행·검색어 2자+(전량 훑기 방지)·계정당 600행/일.
- 데이터: `JANUS_DATA_DIR/placement-hub/slices/<slug>.json` = `{ "rows": [ {...행 객체} ] }`
  (데이터 트랙이 마스터에서 생성 — 문자열 필드가 검색 대상. 예: univ·dept·track).
- slice 파일 미배치면 `available:false` → 웹은 기존 전체 HTML(티켓+워터마크) 경로 폴백.
- **원칙**: 전체 HTML 서빙은 내부·소수 신뢰 사용자용. 공개 상업 서비스는 slice 배치 후 그 경로로.

## 3-2. 투트랙·3버전 원천 정책 (O77 — 외부 유료 공개는 V3만)

- **V1**(아우구르 전·고속+어디가 병합) · **V2**(아우구르 적용 현행) = `"audience": "internal"` —
  관리자(consultant)만 열람. **상품 권한(entitlement)으로도 열리지 않고**, 학생·유료회원에겐 탭 자체 숨김.
- **V3**(청정 빌드: 어디가 원본 직수집 + 평가원·교육청 공식 + 아우구르, **고속 무입력**) = 외부 유료 공개 유일본.
- 고속 데이터 = 파이프라인 입력 금지, **내부 벤치마크 전용**(V3 vs 고속 비교 — 내부 문서).
- 반출 게이트: `python3 ops/placement/check_clean_build.py <DATA_DIR>/placement-hub`
  — audience!=internal 표 + slices/*.json 에 고속 마커 0건이어야 통과(비-0 종료=반출 불가). fail-closed.
- 필드별 원천 태깅·V3 체크리스트: `ops/placement/data-lineage-matrix.md` (데이터트랙이 채움).

## 3-1. 카이로스·알레아 계산기 (배치표와 분리 — repo 서빙)

카이로스·알레아는 **저작권 데이터가 없는 자체완결 코드**라 배치표(JANUS_DATA_DIR)와 달리 **repo 에 편입**한다.

- 위치: `apps/web/public/calc/{kairos,alea}.html` (같은 출처 정적 자산).
- 라우트: 독립 `/kairos`·`/alea`(전체 화면) + 배치표 허브 탭에 자동 편입('유료' 배지).
- **manifest 에 넣지 말 것** — 허브가 repo 계산기 탭을 우선하며, 같은 slug 가 manifest 에도 있으면 데이터측을 제거(중복 방지).
- 게이트(C2): `sso_service` 레지스트리(`kairos`·`alea`, `min_tier=paid` — 0064)가 단일 노브.
  로그인 시 웹이 `GET /sso/entitlements` → `localStorage.janus_sso={tier,services}` 세팅 → 계산기가 읽어 잠금 해제.
  회원(=member)은 free 티저(블러), 유료(paid)+ 는 전체. 유료 티어 도입 전에는 admin/hr(consultant)만 전체.
- 계측(C3)·근거(C5): 계산기가 `janus:track`·`janus_report` 를 dispatch → 호스트가 funnel 계측/근거 수집으로 브리지.

## 3-2. 배치표 버전(정시 v26 · 수시 v6) 반입

- 마스터에서 `build_janus_edition_v2.py`(또는 티어 파이프라인 `tier_build.py`)로 배포판 생성 → 영문 파일명으로 `JANUS_DATA_DIR/placement-hub/` 배치(예: `jeongsi-2027-v26.html`, `susi-v6.html`).
- `manifest.example.json`(이미 v26·v6 반영)을 복사해 목록을 맞춘다. 저작권 데이터·마스터는 **repo 무반입**(C6).
- 성능/배포 계층(맥북=빌드 / Cloudflare=서비스)은 `docs/30_features/야누스_마감스파이크_성능설계서_*` 참조.

## 4. 관련 문서

- 이론서(컨설턴트 교육용): `docs/30_features/야누스_정시배치표_이론서_컨설턴트교육용_2026-07-13.html`
- 예측선 방법론(대외 설명 논리): `docs/30_features/아우구르_예측선_방법론선언_2026-07-14.md`
