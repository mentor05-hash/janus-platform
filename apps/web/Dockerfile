# 잇올 멘토링 Web — 멀티스테이지(빌드 → nginx 정적 서빙 + /api 프록시)
# 빌드 컨텍스트 = 모노레포 루트:  docker build -f apps/web/Dockerfile .

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/pricing/package.json packages/pricing/
COPY packages/media-kit/package.json packages/media-kit/
COPY packages/board-core/package.json packages/board-core/
# ⚠ apps/web/package.json 이 의존하는 워크스페이스는 **빠짐없이** 여기에 있어야 한다.
#    빠지면 npm 이 로컬 워크스페이스가 아니라 공개 레지스트리에서 찾다가 404 로 죽는다
#    (O188 에서 packages/nav 를 신설하고 이 줄을 빠뜨려 이미지 빌드가 막혔다).
COPY packages/nav/package.json packages/nav/
# macOS 에서 생성된 lock 은 linux/musl rollup 바이너리를 누락(npm optional-deps 버그).
# lock 을 지우고 install 하면 컨테이너 플랫폼에 맞는 optional 을 새로 해석한다.
RUN rm -f package-lock.json && npm install --no-audit --no-fund
COPY . .
# 데모 편의(자동로그인·역할 원터치·기본 비번 노출)는 이 플래그가 'true' 일 때만 활성.
# 실서비스 빌드는 이 ARG 를 넘기지 않으면 자동으로 비활성(안전 기본값).
ARG VITE_DEMO_MODE=""
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
# 상담 미디어 스택(O79 M1): livekit 지정 시 상담룸이 미디어킷(음성+화상). 미지정=기존 P2P.
ARG VITE_MEDIA_CONSULT=""
ENV VITE_MEDIA_CONSULT=$VITE_MEDIA_CONSULT
RUN npm run build --workspace apps/web

# ---------- runner (nginx) ----------
FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
