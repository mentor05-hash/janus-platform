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
RUN npm ci

# 소스 복사 후 Prisma client 생성 + 빌드 → 런타임 의존성만 남김
COPY . .
RUN npm run prisma:generate --workspace apps/api \
 && npm run build --workspace apps/api \
 && npm prune --omit=dev

# ---------- runner ----------
FROM node:20-alpine AS runner
ENV NODE_ENV=prod
WORKDIR /app

# dumb-init: PID1 시그널 처리(graceful shutdown — §10 enableShutdownHooks)
RUN apk add --no-cache dumb-init

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
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
