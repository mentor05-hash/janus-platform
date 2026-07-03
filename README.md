# 1:1 멘토링 플랫폼 — 모노레포

설계·도메인 규칙의 단일 기준은 상위 폴더의 `CLAUDE.md` 및 산출물(`통합스펙`, `ERD-API`, `DB_스키마`, `openapi.yaml`)입니다.
이 레포는 **Phase 0 스캐폴딩** 결과물입니다.

## 스택
- 백엔드: **NestJS 11**(TypeScript, DDD) · ORM **Prisma 6** · DB **PostgreSQL 16** · 캐시 **Redis 7**
- 프론트(예정): React(web) · React Native(mobile)
- 인프라: 로컬 docker-compose → 클라우드 이식(코드 변경 없이 설정만 전환, CLAUDE.md §10)

## 구조
```
itall-mentoring/
├─ apps/
│  ├─ api/                  # NestJS 백엔드
│  │  ├─ src/
│  │  │  ├─ config/         # env 검증·ENUM 상수·도메인 상수(요금/버퍼 기본값)
│  │  │  ├─ common/         # Prisma·에러필터·응답 인터셉터·RBAC 가드·페이지네이션
│  │  │  ├─ health/         # GET /api/v1/health (DB ping)
│  │  │  └─ modules/        # 13개 바운디드 컨텍스트(§3)
│  │  ├─ prisma/            # schema.prisma(introspected) · seed.ts(더미)
│  │  └─ migrations/        # 0001_init.sql (= 설계 DDL, 진실의 원천)
│  ├─ web/  └─ mobile/      # (Phase 1+)
├─ packages/
│  ├─ shared/               # OpenAPI 생성 타입(api-types.ts)·디자인 토큰
│  └─ pricing/              # 요금/분류 도메인 로직(Phase 1)
├─ docker-compose.yml       # postgres + redis
└─ openapi.yaml             # API 계약
```

## 로컬 실행

```bash
# 1) 의존성
npm install

# 2) 인프라(postgres + redis)
npm run infra:up          # docker compose up -d
npm run infra:ps          # healthy 확인

# 3) DB 초기화 (apps/api 기준)
cd apps/api
cp .env.example .env       # 로컬 기본값으로 바로 동작
npm run db:init            # 0001_init.sql 적용 → prisma db pull → generate

# 4) 공유 타입 생성(루트)
cd ../.. && npm run gen:types

# 5) 더미 시드
npm run api:seed

# 6) 실행
npm run api:dev            # http://localhost:3000/api/v1
curl localhost:3000/api/v1/health
```

> ⚠️ **Prisma 한글 ENUM 주의:** `consult_type`(담임/교과/입시/심리)·`session_mode`(상담/질문)는
> Prisma가 식별자로 못 다뤄, `schema.prisma`에서 ASCII 멤버명 + `@map("한글")`으로 수동 매핑함.
> `prisma db pull` 재실행 시 이 두 enum 블록이 다시 주석 처리되므로, 재introspect 후 매핑을 복원할 것.

## 더미 시드 계정 (민감정보 아님)
`student01` · `teacher01` · `admin01` · `hr01` · `guardian01` — 공통 비밀번호 **`dev-password!`** (bcrypt 해시, 로컬 전용).
시드에 선생님 근무표(매일 09:00–18:00)·학생 체류(09:00–22:00) 포함.

## Phase 0 DoD — 완료
- [x] docker compose(postgres·redis) healthy
- [x] 마이그레이션 적용 → 44테이블 생성
- [x] OpenAPI 타입 생성 + 헬스체크 200
- [x] 시드 더미 적재(민감정보 0건)
- [x] 공통 골격(JWT 가드·RBAC·에러필터 `{error:{code,message}}`·응답 `{data,meta}`·페이지네이션)

## Phase 1 — 핵심 예약 흐름(MVP) — 완료
엔드투엔드 핵심 경로 동작: **로그인 → 선생님 검색 → 슬롯 조회 → quote → (충전) → 예약 → 수락 → 상담기록(draft/final) → 완료 → 권한별 조회 → 자동매칭**.

| 모듈 | 주요 엔드포인트 |
|---|---|
| iam | `POST /auth/login` `POST /auth/signup` `GET /me` (전역 JWT 가드 + `@Roles` RBAC) |
| people | `GET /teachers` `GET /teachers/{id}` · `GET /hr/students` `POST /hr/students/{id}/approve` |
| availability | `GET /teachers/{id}/slots?date=` `GET/PUT /teachers/{id}/work-schedule` |
| matching | `POST /match/auto` (7일 내 30분 자동매칭) |
| booking | `POST /bookings/quote` `POST /bookings`(402) `GET /bookings` `/{id}/{accept,reject,confirm,complete,cancel,noshow}` |
| consultation | `POST/GET /bookings/{id}/note` `GET /students/{id}/notes` `GET /me/notes` |
| billing | `GET /credits/account` `GET /credits/transactions` `POST /payments/charge` `POST /credits/run-weekly-grant` |

### §5 불변규칙 — 단위테스트로 보장 (`npm test`, 15 tests green)
- **§5-1 휴게 버퍼** — `modules/availability/domain/slots.spec.ts`: A=9:10–9:50·B=10:30–11:20 → 유일창 10:00–10:20(index 60,61). 예약 생성 시에도 재검증(버퍼 침범 → 409).
- **§5-2 요금** — `modules/pricing-policy/domain/cost.spec.ts`: 줌 30분 일반 20,000 / S급 24,000.
- **§5-3 크레딧 소비순서** — `modules/billing/domain/credit-consume.spec.ts`: 주간부여(만료 임박) → 구매분, 부족 시 shortfall.
- **§5-4 상태머신** — `modules/booking/domain/state-machine.spec.ts`: new→confirmed→done, 잘못된 전이 차단.
- **§5-5 상담기록 공개** — done은 final 필수, memo는 내부(학생/보호자 뷰 제외), 보호자 공개 게이트.

### 동시성 (§7)
예약·크레딧은 DB 트랜잭션 + `credit_account` 행잠금(`FOR UPDATE`) + `time_slot` UNIQUE 제약으로 중복 예약 방지.

## 다음(Phase 2) 후보
학부모 연결·결제요청 3경로, 구독·주간부여 연동, 취소·알림(`CancellationEvent`+notification), 관리자 정책 편집(요금/한도/기능토글), 역상담, payroll, ops 대시보드.
