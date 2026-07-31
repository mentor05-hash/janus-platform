# 잇올 멘토링 API — 멀티스테이지 빌드 (CLAUDE.md §10 컨테이너화)
# 동일 이미지가 로컬·클라우드에서 실행. 환경 의존값은 전부 ENV(설정 외부화).
# 빌드 컨텍스트 = 모노레포 루트:  docker build -f apps/api/Dockerfile .

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

# 워크스페이스 manifest 먼저 복사 → 의존성 설치 레이어 캐시
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/pricing/package.json packages/pricing/
COPY packages/media-kit/package.json packages/media-kit/
COPY packages/board-core/package.json packages/board-core/
COPY packages/guard-school-record/package.json packages/guard-school-record/
COPY packages/janus-planner/package.json packages/janus-planner/
# ⚠ apps/api/package.json 이 의존하는 워크스페이스는 빠짐없이 여기에 있어야 한다.
#    빠지면 npm 이 공개 레지스트리에서 찾다가 404 로 죽는다(O188 packages/nav 신설 시 누락).
COPY packages/nav/package.json packages/nav/
# 워크스페이스 `prepare` 는 소스 유무를 스스로 확인한다(각 package.json 참조) — 이 시점에는
# 소스가 아직 COPY 전이라 건너뛰고, 실제 빌드는 아래 COPY . . 뒤에서 명시적으로 한다.
RUN npm ci

# 소스 복사 후 Prisma client 생성 + 빌드 → 런타임 의존성만 남김
# 공용 워크스페이스 패키지는 apps/api 가 런타임에 require 하므로 **JS+타입으로 선(先)빌드** → dist.
#   ⚠ apps/api 빌드보다 **먼저** 와야 한다 — dist 가 없으면 nest build 가 타입 선언을 못 찾아 TS2307 로 죽는다
#     (janus-planner 를 import 한 뒤 이미지 빌드가 이 이유로 깨졌다. 로컬은 dist 가 남아 있어 통과했다).
COPY . .
RUN npm run build --workspace @mentoring/guard-school-record \
 && npm run build --workspace @mentoring/janus-planner \
 && npm run prisma:generate --workspace apps/api \
 && npm run build --workspace apps/api \
 && npm run build:seed --workspace apps/api \
 && npm prune --omit=dev

# ---------- runner ----------
FROM node:20-alpine AS runner
ENV NODE_ENV=prod
WORKDIR /app

# dumb-init: PID1 시그널 처리(graceful shutdown — §10 enableShutdownHooks)
# poppler-utils: PDF 배경 서버 렌더(pdftoppm) — 클라이언트 번들러 비의존
# fontconfig+폰트: 폰트 미임베드 PDF 의 텍스트 대체 렌더(base-14 + Noto)
RUN apk add --no-cache dumb-init poppler-utils fontconfig ttf-freefont font-noto

COPY --from=builder /app/node_modules ./node_modules
# 워크스페이스 실파일(dist 포함) — node_modules/@mentoring 심링크 대상.
COPY --from=builder /app/packages/guard-school-record ./packages/guard-school-record
COPY --from=builder /app/packages/janus-planner ./packages/janus-planner
COPY --from=builder /app/packages/nav ./packages/nav
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/dist-seed ./apps/api/dist-seed
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/migrations ./apps/api/migrations
COPY --from=builder /app/apps/api/scripts ./apps/api/scripts
COPY --from=builder /app/apps/api/package.json ./apps/api/

WORKDIR /app/apps/api
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
# 헬스체크(§10 관측성): GET /api/v1/health
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
CMD ["node", "dist/main.js"]
