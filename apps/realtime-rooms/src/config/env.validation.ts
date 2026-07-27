/**
 * realtime-rooms ENV 검증 — 부팅 시 운영 시크릿 누락/약함을 즉시 실패시킨다.
 * 이 앱은 HMAC 룸 토큰·API 키로 접근을 통제하므로, 운영에서 기본값/약한 시크릿을 반드시 차단.
 */
export function isProdEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.APP_ENV ?? env.NODE_ENV;
  return v === 'prod' || v === 'production';
}

const MIN_SECRET_LEN = 32;
const PLACEHOLDER_RE = /change[_-]?me|__|dev-.*-secret|dev-rooms|dev-sso/i;

function checkSecret(name: string, val: string | undefined, errs: string[]) {
  const s = val ?? '';
  if (!s) errs.push(`${name}: 운영에서 필수(미설정)`);
  else if (s.length < MIN_SECRET_LEN)
    errs.push(`${name}: 최소 ${MIN_SECRET_LEN}자 이상(현재 ${s.length})`);
  else if (PLACEHOLDER_RE.test(s))
    errs.push(`${name}: 플레이스홀더/기본값 사용 금지`);
}

/** ConfigModule.forRoot({ validate }) 로 주입. 운영에서만 시크릿 강제(로컬은 dev 기본값 허용). */
export function validateRoomsEnv(config: Record<string, unknown>) {
  if (isProdEnv(config as NodeJS.ProcessEnv)) {
    const errs: string[] = [];
    checkSecret('ROOMS_JWT_SECRET', config.ROOMS_JWT_SECRET as string, errs);
    checkSecret('ROOMS_API_KEY', config.ROOMS_API_KEY as string, errs);
    if (!config.ROOMS_CORS_ORIGINS)
      errs.push('ROOMS_CORS_ORIGINS: 운영에서 필수(허용 오리진 명시)');
    if (errs.length)
      throw new Error(
        `realtime-rooms 운영 ENV 검증 실패:\n${errs.map((e) => `  - ${e}`).join('\n')}`,
      );
  }
  return config;
}
