import { isProdEnv } from '../config/env.validation';

/**
 * CORS origin 해석 — HTTP(main.ts)와 WS 게이트웨이 데코레이터가 동일 정책을 쓰도록 단일 출처.
 * WebSocketGateway 가 `origin: true, credentials: true` 를 하드코딩하면 소켓 핸드셰이크가
 * HTTP allowlist 를 우회해 임의 오리진을 반영(+credentials) → 어느 사이트든 인증 WS 연결 가능.
 */

/** 순수 코어: allowlist(csv) 있으면 배열, 없으면 로컬 true·운영 false(reflect 금지). */
export function pickCorsOrigin(csv: string | undefined, isProd: boolean): string[] | boolean {
  const origins = (csv ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  return origins.length ? origins : isProd ? false : true;
}

/** env 래퍼: CORS_ORIGINS + isProdEnv().
 *  ⚠ @WebSocketGateway 데코레이터에서 쓰이므로 **모듈 import 시점**에 평가됨. .env 파일 값도 여기 반영되도록
 *  main.ts 첫 줄에서 `import 'dotenv/config'` 프리로드(제거 금지 — ConfigModule 로드는 런타임이라 늦음). */
export function resolveCorsOrigin(): string[] | boolean {
  return pickCorsOrigin(process.env.CORS_ORIGINS, isProdEnv());
}
