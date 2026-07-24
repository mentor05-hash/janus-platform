/**
 * CORS origin 해석 — HTTP(main.ts)와 WS 게이트웨이 데코레이터가 동일 정책을 쓰도록 단일 출처.
 * WebSocketGateway 가 `origin: true, credentials: true` 를 하드코딩하면 소켓 핸드셰이크가
 * HTTP allowlist 를 우회해 임의 오리진을 반영(+credentials) → 어느 사이트든 인증 WS 연결 가능.
 */

/** 순수 코어: allowlist(csv) 있으면 배열, 없으면 로컬 true·운영 false(reflect 금지). */
export function pickCorsOrigin(csv: string | undefined, isProd: boolean): string[] | boolean {
  const origins = (csv ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return origins.length ? origins : isProd ? false : true;
}

/** env 래퍼: ROOMS_CORS_ORIGINS + APP_ENV/NODE_ENV.
 *  ⚠ @WebSocketGateway 데코레이터에서 쓰이므로 모듈 import 시점에 평가됨 — main.ts 첫 줄
 *  `import 'dotenv/config'` 프리로드가 전제(제거 금지). */
export function resolveCorsOrigin(): string[] | boolean {
  const env = process.env.APP_ENV ?? process.env.NODE_ENV;
  const isProd = env === 'prod' || env === 'production';
  return pickCorsOrigin(process.env.ROOMS_CORS_ORIGINS, isProd);
}
