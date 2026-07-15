import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// dev: /api/v1 요청을 로컬 API(3000)로 프록시 → CORS 회피, 클라이언트는 동일 출처 사용.
export default defineConfig({
  plugins: [react()],
  build: {
    // livekit-client(미디어 SDK ~500KB)는 방·교실 진입 시에만 로드되는 별도 async 청크 —
    // 축소 불가한 벤더라 경고 임계값 상향(그 외 청크는 코드분할로 모두 500KB 이하).
    chunkSizeWarningLimit: 600,
    // 번들 분할 — 대형 벤더를 별도 청크로(초기 청크 축소·캐시 효율).
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          socket: ['socket.io-client'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    // 터널(localtunnel/ngrok 등) 호스트 허용 — 공개 링크 접속 시 host check 차단 방지.
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
