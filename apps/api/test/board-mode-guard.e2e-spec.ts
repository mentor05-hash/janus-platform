import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/iam/auth.service';

/**
 * 결함 회귀: board(게시판)는 건당 과금 → /qna 전용. 예약(/bookings) 방식에서 제외되어야 한다.
 * (이전엔 board 예약이 시간제로 잘못 생성됨)
 */
const TEACHER = '00000000-0000-4000-8000-0000000000a2';

describe('board 예약 차단(§5-2)', () => {
  let app: INestApplication;
  let token = '';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    const auth = app.get(AuthService);
    const t = await auth.login({ loginId: 'student01', password: 'dev-password!' } as any);
    token = t.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const body = { teacherId: TEACHER, date: '2026-07-20', mode: 'board', consultType: '교과', slotStart: 60, slotEnd: 63 };

  it('board 견적 요청 → 400(허용 방식 아님)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bookings/quote')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it('board 예약 생성 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it('chat 등 시간제 방식은 정상 견적', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bookings/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, mode: 'chat' });
    expect(res.status).toBe(200);
    expect(res.body.credits).toBe(9000); // TransformInterceptor 미등록 테스트 앱 — 원형 응답

  });
});
