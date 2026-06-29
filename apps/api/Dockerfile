# apps/api/Dockerfile — 동일 이미지가 로컬·클라우드에서 실행(§10 컨테이너화)
# --- build ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- run ---
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=prod
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
EXPOSE 3000
# 헬스체크 엔드포인트(§10 관측성): GET /api/v1/health
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
CMD ["node", "dist/main.js"]
