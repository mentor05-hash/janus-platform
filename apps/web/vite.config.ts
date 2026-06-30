import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// dev: /api/v1 요청을 로컬 API(3000)로 프록시 → CORS 회피, 클라이언트는 동일 출처 사용.
export default defineConfig({
  plugins: [react()],
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
