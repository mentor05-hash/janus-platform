// k6 부하/스모크 스크립트(프로덕션 게이트용). 설치: https://k6.io
// 실행: k6 run ops/loadtest/k6-smoke.js -e BASE=http://localhost:3000
//   램프업 후 임계(p95<500ms, 실패<1%) 초과 시 실패 종료 → CI 게이트로 사용 가능.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // 램프업
    { duration: '1m', target: 50 },    // 유지
    { duration: '20s', target: 0 },    // 램프다운
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // p95 500ms 미만
    http_req_failed: ['rate<0.01'],    // 실패율 1% 미만
  },
};

export default function () {
  const res = http.get(`${BASE}/api/v1/health`);
  check(res, { 'health 200': (r) => r.status === 200 });
  sleep(1);
}
