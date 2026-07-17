# V3 청정 빌드 지시서 (데이터트랙용 — O77)

> **이 문서를 데이터트랙(배치표 제작 프로젝트) 세션에 그대로 전달한다.**
> 목적: 외부 유료 공개 유일본 **V3**(고속 무입력 청정 빌드) 제작.
> 근거 결정: O77(투트랙·3버전) · O76(워터마크·thin-slice) · O74(상품 권한). 접합계약 C1~C6 준수 전제.
> 플랫폼 쪽(서빙·게이트·워터마크·slice API·entitlement)은 **준비 완료** — 이 지시서의 산출물만 도착하면 된다.

---

## 0. 배경 한 줄

현행 배치표(V1=아우구르 전, V2=아우구르 적용)는 **고속성장 유래 입력**이 섞여 있어
`audience:"internal"`(관리자 전용)로 격리됐다. 외부 유료 공개는 **V3만** 허용된다.

## 1. V3 정의 (무엇을 만드나)

| 항목 | 규칙 |
|---|---|
| **입력 허용** | 어디가(대입정보포털) **원본 직수집** · 평가원/교육청 공식(채점자료·표점분포·응시통계) · 대학 모집요강/대교협 공시 · 아우구르 엔진 산출 · 자체 파생 지표 |
| **입력 금지** | 고속성장 유래 전부(원값·보정치·환산표·그 2차 가공물) · **타인이 가공한 어디가 2차 가공물**(어디가는 반드시 원본에서 직접 재유도) |
| **고속의 지위** | 파이프라인 입력 금지. **내부 벤치마크 전용** — "V3 예측 vs 고속 예측" 비교표(내부 문서)로만 사용 |
| **표현층** | 원자료와 1:1 역산이 안 되는 자체 스케일 우선(relTier·트리비움 밴드·확률 P·안정/적정/소신/상향) |
| **출처 표기** | 어디가·평가원 공공데이터 출처 문구를 표 하단에 삽입(공공데이터 이용조건 + 신뢰도 어필) |

## 2. 작업 순서

1. **계보 태깅** — `ops/placement/data-lineage-matrix.md`(repo)의 §3 표를 병합 JSON(`고속_어디가_병합_2026_v9.json`) 필드 목록으로 채운다. 각 필드를 ADIGA/KICE/UNIV/AUGUR/DERIVED/GOSOK/GOSOK-D 로 분류.
   ⚠ 매트릭스는 코드 채널 문서 — **필드명·분류만, 실데이터 값 기입 금지**(C6).
2. **GOSOK 필드 처리** — 분류 결과 GOSOK/GOSOK-D 필드 전부를 ①재유도(어디가 원본+KICE 분포로 재계산) ②모델산출(아우구르가 생성) ③드롭 중 하나로. 특히:
   - `고속_표점_누백_환산.json` → **평가원·교육청 채점자료 분포로 재유도** (자체 환산표 생성)
   - 70%컷 등 입결 → 어디가 공시 원본에서 직수집
3. **아우구르 재적합** — 청정 입력으로 CALIB 재적합 + LOO + 백테스트 1회. 정확도가 V2 대비 허용 범위인지 기록(수치는 내부 문서).
4. **V3 빌드** — `야누스판_빌드.py` 파이프라인으로 배포판 생성. **V2와 동일한 계약 배선 유지**:
   - C1 `janus_score`(v22 키 동결) · C2 `janus:sso`/`data-tier`+free 블러 가드(`.jns-lock`) · C3 `consult-reserve`+`janus:track` · C5 `janus_report`(relTier 필수)
   - 서비스 id `baechipyo` · page id 정시 `baechi`/수시 `baechi_susi` (V2와 동일)
5. **slices 생성 (신규 — thin-slice 용)** — 표별 행 JSON:
   ```json
   // slices/<slug>.json
   { "rows": [ { "univ": "…", "dept": "…", "track": "…", "...": "표시에 필요한 필드" } ] }
   ```
   - 검색 대상은 **문자열 필드**(univ·dept·track 등). 플랫폼이 요청당 30행·계정당 600행/일로 서빙.
   - 공개 상업 서비스의 기본 경로이므로 **여기에도 고속 유래 0건**.
6. **자체 검사 후 반출** — 아래 §3 게이트 전부 통과 시에만 전달.

## 3. 반출 게이트 (하나라도 실패 = 반출 불가)

- [ ] 계보 매트릭스에서 GOSOK/GOSOK-D 필드 전부 재유도·모델산출·드롭 처리 완료
- [ ] `python3 ops/placement/check_clean_build.py <검사폴더>` **exit 0** (공개표+slices 고속 마커 0건, fail-closed)
- [ ] 재통합 게이트(핸드오프 §3-A): 데이터 부재 grep(무료판) · 연계 스니펫 diff 0 · "잇올" 0건 · DEMO 마커 0건 · gitleaks
- [ ] 백테스트 정확도 기록(내부 문서) — V2 대비 허용 범위
- [ ] 출처 표기 문구 삽입 확인

## 4. 산출물·전달 (파일명 고정 — 플랫폼 manifest가 이 이름을 찾는다)

| 산출물 | 파일명 | 전달 채널 |
|---|---|---|
| 정시 2027 V3 배포판 | `jeongsi-2027-clean-v3.html` | **데이터 채널만**(20_data 직접 배치 — repo·공유링크 금지) |
| 수시 V3 배포판(준비되면) | `susi-clean-v3.html` | 동일 |
| thin-slice 데이터 | `slices/jeongsi-2027-v3.json` 등 | 동일 |
| V3 vs 고속 벤치마크 비교표 | 내부 문서(반출 금지) | 데이터트랙 보관 |
| 계보 매트릭스(채운 것) | `data-lineage-matrix.md` 갱신 | 코드 채널(repo) — 값 없이 필드·분류만 |

배치 위치: `~/janus/20_data/placement-hub/` (파일) · `~/janus/20_data/placement-hub/slices/` (JSON)

---

# V3 완성 후 해야 할 목록 (플랫폼·운영 트랙)

## A. 즉시 — V3 연결 (맥, 10분)

1. V3 파일을 `20_data/placement-hub/`(+`slices/`)에 배치
2. manifest 교체 — repo의 정책 시행판 사용:
   ```bash
   cd /Users/mentor05daum.net/janus/10_platform/janus-platform && git pull
   cp ops/placement/manifest.example.json /Users/mentor05daum.net/janus/20_data/placement-hub/manifest.json
   # V3 슬롯(slug: jeongsi-2027-v3)의 title 에서 "(준비 중)" 제거, updated 기입
   ```
3. 반출 게이트 최종 실행:
   ```bash
   python3 ops/placement/check_clean_build.py /Users/mentor05daum.net/janus/20_data/placement-hub
   ```
   exit 0 확인 (V1·V2는 internal 이라 건너뛰고, V3+slices만 검사됨)
4. 실측 매트릭스:
   - `paid01`/`paidall` → **V3만** 보이고 열림(V1·V2 탭 자체가 없음), 워터마크 표시
   - `student01`(미구매) → V3 페이월
   - `admin01` → V3 + V1·V2("내부용" 뱃지) 모두 열람
   - V3 ⌘S 저장 → `jns-fp` 지문 grep 확인(워터마크 회귀 확인)

## B. 단기 — 공개 준비

5. **slice 씬프론트 UI** — 유료 회원용 검색형 화면(iframe 전체표 대신 slice API 소비). 플랫폼 트랙에 요청하면 구현 *(API·상한·게이트는 이미 있음)*
6. **고속 서면 확인 1통** — 벤치마크 용도 사용에 대한 제작자 확인(가장 싼 보험)
7. **법률 검토 1회** — 어디가 이용조건·DB제작자 권리 관점 최종 확인
8. **무료판(V3 기반) 재생성** — `tier_build.py`로 데이터 제거 무료판 → janus-public `/baechi/` 교체(현행 무료판이 V2 계열이면 이것도 V3 계열로 교체)

## C. 수익화 마감 — 결제 연결 (N23~N25 확정 후)

9. 가격 확정 → 상품 4종(전체/정시/카이로스/카이로스+알레아) 가격 반영
10. **결제 훅**: PG(토스페이먼츠 예정 W9~10) 성공 콜백 → `EntitlementService.grant(source:'payment')` 호출 — 배관 완성, 이 한 줄 연결이 전부
11. 환불 훅 → `revoke()` 연결
12. 만료 알림 크론 등록(`POST /admin/entitlements/run-expiry-check` 주기 실행 — 현재 수동)

## D. 운영 루틴

13. 감사 로그 주간 점검 — `hub.cap.*`(상한 초과)·`hub.file` 이상 패턴(동일 계정 다수 서빙)
14. 유출 의심 시 대응 절차: 입수본에서 `jns-fp` grep → base64url 디코드 → 계정 특정 → entitlement revoke + 계정 조치
15. 시즌 종료 시: 일회성 기간제 만료(expires_at) 일괄 도래 — 만료 알림·재구매 유도 확인

*V1·V2는 영구히 internal — 외부로 나가는 일이 없도록 manifest 변경 시 항상 check_clean_build 를 함께 돌린다.*
