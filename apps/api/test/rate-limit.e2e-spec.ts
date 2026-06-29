import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * d1 §10 보안: 로그인 엔드포인트 rate limit(분당 10) — 초과 시 429.
 */
describe('d1 rate limit(§10)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('로그인 10회 초과 → 429', async () => {
    const body = { loginId: 'nope_rl', password: 'wrongpw' };
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send(body);
      codes.push(res.status);
    }
    // 한도(10) 이내는 401(자격 실패), 초과분에 429 가 나타난다.
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
    expect(codes.slice(0, 10).every((c) => c !== 429)).toBe(true);
  });
});
