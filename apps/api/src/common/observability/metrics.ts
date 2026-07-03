import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus 메트릭(§10 관측성) — 프로세스 기본 지표 + HTTP 요청/에러 카운터.
 * 모듈 싱글턴 레지스트리(전역 register 미사용 → 테스트 격리). 필터/인터셉터가 갱신.
 */
export const metricsRegistry = new Registry();
metricsRegistry.setDefaultLabels({ app: 'mentoring-api' });
collectDefaultMetrics({ register: metricsRegistry }); // CPU·메모리·GC·이벤트루프 등

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'HTTP 요청 수',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP 요청 처리 시간(초)',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const errorsTotal = new Counter({
  name: 'app_errors_total',
  help: '처리된 에러 수(코드·상태별)',
  labelNames: ['code', 'status'] as const,
  registers: [metricsRegistry],
});

/** 경로 정규화 — UUID·숫자 ID 를 :id 로 치환해 라벨 카디널리티를 낮춘다. */
export function normalizeRoute(path: string): string {
  return (path || '/')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .split('?')[0];
}
