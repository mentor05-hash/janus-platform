import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * d1 §10 보안 — 로그인 429 는 **계층이 두 개**다. 이 스펙은 둘을 분리해 각각 검증한다.
 *   ① IP 레이트리밋(RateLimitGuard) — 키 `rl:{METHOD route}:{ip}`, 분당 10회. loginId 와 무관.
 *   ② 계정 잠금(AuthService) — 키 `authfail:{loginId}`, 실패 5회 누적 시 15분 차단. IP 와 무관.
 *
 * ⚠ 원래 스펙은 **같은 loginId 로 12회** 시도해 두 계층을 뒤섞었다. 계정 잠금이 6번째에 먼저 터져
 *   `codes.slice(0,10)` 안에 429 가 섞여 실패했다(standalone 에서도 재현 — 크로스스위트 오염이 아니다).
 *   → ①은 **회차마다 다른 loginId** 로 잠금 계층을 피해 순수하게 검증하고, ②는 별 테스트로 분리했다.
 *
 * ⚠ 캐시는 Nest 앱 인스턴스마다 새 Map(memory-cache.provider)이므로 **테스트마다 앱을 새로 만든다** —
 *   한 앱을 공유하면 ①이 IP 카운터를 소진해 ②가 잠금 대신 IP 429 를 받는다(계층 구분 불가).
 */
const LOGIN_LIMIT = 10; // @RateLimit(login) — 분당 10
const MAX_FAILS = 5; // AuthService.MAX_FAILS

async function makeApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = mod.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

describe('d1 rate limit(§10)', () => {
  let app: INestApplication;
  /** 회차마다 유니크 — 이전 실행의 authfail 키를 물려받지 않는다. */
  const stamp = process.hrtime.bigint().toString(36);

  const attempt = (loginId: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ loginId, password: 'wrongpw' });

  afterEach(async () => {
    await app?.close();
  });

  it(`IP 레이트리밋: ${LOGIN_LIMIT}회 초과 → 429 (loginId 무관)`, async () => {
    app = await makeApp();
    const codes: number[] = [];
    for (let i = 0; i < LOGIN_LIMIT + 2; i++) {
      // loginId 를 매번 다르게 → 계정 잠금(authfail:{loginId}) 계층을 타지 않는다.
      const res = await attempt(`rl_${stamp}_${i}`);
      codes.push(res.status);
    }
    // 한도 이내는 전부 401(자격 실패) — 429 가 섞이면 다른 계층이 개입한 것이다.
    expect(codes.slice(0, LOGIN_LIMIT)).toEqual(Array(LOGIN_LIMIT).fill(401));
    // 초과분은 429
    expect(codes.slice(LOGIN_LIMIT).every((c) => c === 429)).toBe(true);
  });

  it(`계정 잠금: 같은 아이디 실패 ${MAX_FAILS}회 누적 → 다음 시도 429 (IP 한도 이내에서)`, async () => {
    app = await makeApp();
    const loginId = `lock_${stamp}`;
    const codes: number[] = [];
    // MAX_FAILS+1 회 = 6 < IP 한도 10 → 여기서 나오는 429 는 **잠금 계층뿐**이다.
    for (let i = 0; i < MAX_FAILS + 1; i++) {
      codes.push((await attempt(loginId)).status);
    }
    expect(codes.slice(0, MAX_FAILS)).toEqual(Array(MAX_FAILS).fill(401));
    const last = await attempt(loginId);
    expect(last.status).toBe(429);
    // 두 계층이 같은 429 를 쓰므로 **메시지로 사유를 구분**한다(잠금인지 리밋인지).
    expect(JSON.stringify(last.body)).toMatch(/계정이 일시 잠겼|15분/);
  });
});
