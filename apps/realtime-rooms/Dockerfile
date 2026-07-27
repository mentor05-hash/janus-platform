# 실시간 룸 서비스 — 멀티스테이지 빌드. 빌드 컨텍스트 = 모노레포 루트:
#   docker build -f apps/realtime-rooms/Dockerfile .
# 환경 의존값은 전부 ENV(설정 외부화). 호스트 앱과 절연된 독립 배포 단위.

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
# .dockerignore 가 apps/mobile·web 을 제외하므로 필요한 워크스페이스 manifest 만 복사
# (이 서비스는 다른 앱에 의존하지 않음). npm ci 는 일부 워크스페이스 부재를 허용.
COPY package.json package-lock.json ./
COPY apps/realtime-rooms/package.json apps/realtime-rooms/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/pricing/package.json packages/pricing/
COPY packages/media-kit/package.json packages/media-kit/
COPY packages/board-core/package.json packages/board-core/
RUN npm ci
COPY . .
RUN npm run build --workspace apps/realtime-rooms \
 && npm prune --omit=dev

# ---------- runner ----------
FROM node:20-alpine AS runner
ENV NODE_ENV=prod
WORKDIR /app
RUN apk add --no-cache dumb-init wget
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/realtime-rooms/dist ./apps/realtime-rooms/dist
COPY --from=builder /app/apps/realtime-rooms/migrations ./apps/realtime-rooms/migrations
COPY --from=builder /app/apps/realtime-rooms/scripts ./apps/realtime-rooms/scripts
COPY --from=builder /app/apps/realtime-rooms/package.json ./apps/realtime-rooms/

WORKDIR /app/apps/realtime-rooms
EXPOSE 3100
ENTRYPOINT ["dumb-init", "--"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3100/api/rt/v1/health || exit 1
# 기동 시 멱등 마이그레이션 적용 후 서버 시작
CMD ["sh", "-c", "node scripts/apply-migrations.mjs || true; node dist/main.js"]
