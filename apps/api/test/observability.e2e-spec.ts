import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { requestIdMiddleware } from '../src/common/observability/request-id.middleware';

/**
 * c1 §10 관측성: 요청 ID 미들웨어가 모든 응답에 x-request-id 를 부여하고,
 * 클라이언트가 보낸 x-request-id 는 승계한다.
 */
describe('c1 요청 ID 전파(§10)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.use(requestIdMiddleware);
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('응답에 x-request-id 생성', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('클라이언트 x-request-id 승계', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'client-rid-123');
    expect(res.headers['x-request-id']).toBe('client-rid-123');
  });
});
