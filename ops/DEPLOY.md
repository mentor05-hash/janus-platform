# 프로덕션 배포 가이드 (멘토링 플랫폼)

로컬 데모 → 클라우드 실서비스로 **코드 변경 없이 설정·인프라만 전환**하는 절차입니다
(CLAUDE.md §10 이식 원칙). 어댑터는 ENV provider 스위치로 실연동을 켭니다.

## 0. 준비물(외부 계정·자격증명)
| 항목 | 필요한 것 | ENV |
|---|---|---|
| DB | 관리형 PostgreSQL 16 (RDS/Cloud SQL) | `DATABASE_URL` |
| 캐시 | 관리형 Redis 7 | `CACHE_PROVIDER=redis` · `REDIS_URL` |
| 결제 PG | 벤더 계약(토스/포트원 등) | `PG_PROVIDER=real` + 키 |
| 알림톡/SMS | 카카오 비즈채널·발신번호 | `KAKAO_*` · `SMS_*` |
| 스토리지 | S3 버킷 + IAM | `STORAGE_PROVIDER=s3` + `AWS_*` |
| 화상 | Zoom 앱(S2S OAuth) | `ZOOM_PROVIDER=api` + 키 |
| AI | Anthropic API 키 | `LLM_PROVIDER=claude` + `ANTHROPIC_API_KEY` |

## 1. 시크릿·환경
```bash
cp .env.example .env         # 실값 채우기(시크릿은 시크릿 매니저 권장)
openssl rand -hex 32         # JWT_SECRET / JWT_REFRESH_SECRET 각각 생성
```
- `NODE_ENV=production` → helmet HSTS·mock PG 결제 차단 등 안전장치 자동 활성.
- 프론트 빌드에 **`VITE_DEMO_MODE`/`EXPO_PUBLIC_DEMO_MODE` 미설정**(데모 자동로그인 비활성 — 보안①).

## 2. 마이그레이션 적용(코드화된 스키마)
```bash
# 순서대로 apps/api/migrations/*.sql 적용(0001 → 최신). 예:
for f in apps/api/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
npm run prisma:generate --workspace apps/api
```
> 수동 SQL 임의 적용 금지 — 반드시 migrations/ 순서 유지(로컬·클라우드 동일).

## 3. 빌드·이미지
```bash
npm run build --workspace apps/api
npm run export:web --workspace apps/mobile      # 데모면 EXPO_PUBLIC_DEMO_MODE=true
docker compose -f docker-compose.full.yml build  # web 은 VITE_DEMO_MODE ARG(실서비스 미전달)
```
- 실서비스 web 이미지: `docker build --build-arg VITE_DEMO_MODE= -f apps/web/Dockerfile .`

## 4. 실행·헬스체크
```bash
docker compose -f docker-compose.full.yml up -d
curl -fsS https://api.example.com/api/v1/health   # 200 확인
```
오토스케일·모니터링은 `/health` + 구조적 로그(`LOG_FORMAT=json`) 기반.

## 5. 외부 연동 활성(②) — 벤더별 어댑터
provider 스위치를 바꾸고 자격증명 설정 후 재기동하면 실연동됩니다.
| 스위치 | mock/stub | 실연동 |
|---|---|---|
| `PG_PROVIDER` | mock (충전 무료·prod 차단) | real |
| `STORAGE_PROVIDER` | local (디스크) | s3 |
| `ZOOM_PROVIDER` | mock (더미 URL) | api |
| `LLM_PROVIDER` | mock (휴리스틱) | claude |
| 알림 채널 | stub (로그) | 카카오/SMS 게이트웨이 |

> 어댑터 구현체는 `apps/api/src/modules/*/providers|pg`에 존재. 실연동 시 해당 provider의
> TODO(실 API 호출부)를 벤더 SDK로 채우면 됩니다.

## 6. 런칭 전 보안 체크리스트
- [ ] `VITE_DEMO_MODE`/`EXPO_PUBLIC_DEMO_MODE` 미설정(자동로그인·기본 비번 비노출)
- [ ] JWT 시크릿 강한 랜덤·시크릿 매니저 보관
- [ ] `NODE_ENV=production`(HSTS·mock 결제 차단)
- [ ] `CORS_ORIGINS` 실도메인만 화이트리스트
- [ ] DB/Redis 프라이빗 네트워크·TLS
- [ ] 백업(ops/backup-db.sh) 스케줄 등록 + 복구 리허설
- [ ] 개인정보 접근 감사로그(audit) 보존·검토 운영

## 7. 운영
- 백업: `ops/backup-db.sh`(크론 등록). 복구 절차 문서화·정기 리허설.
- 관측성: 구조적 로그 수집 + `/health` 모니터. 크론은 Redis 리더락으로 다중 인스턴스 안전.
