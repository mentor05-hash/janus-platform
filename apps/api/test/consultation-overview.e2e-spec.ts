import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * T6 뷰어 개요(담임 공백 + 거부 이력) — GET /students/:id/record-overview.
 * 역할 게이트(관리자·HR·선생님만), 응답 형태, 학생 본인 접근 차단(앱 별도) 검증.
 */
describe('상담기록 뷰어 개요(record-overview)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};
  let studentId = '';

  const login = async (id: string, password = 'dev-password!') =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ loginId: id, password })
    ).body.data.accessToken;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (p: string, t: string) =>
    request(app.getHttpServer()).get(`/api/v1/${p}`).set(auth(t));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = mod.get(PrismaService);

    tok.master = await login('master01');
    tok.student = await login('student01');
    const s = await prisma.account.findUnique({
      where: { login_id: 'student01' },
    });
    studentId = s?.id ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('관리자: 200 + 담임 공백 레벨 + 거부 이력 배열', async () => {
    const r = await get(`students/${studentId}/record-overview`, tok.master);
    expect(r.status).toBe(200);
    expect(['none', 'ok', 'warn', 'danger']).toContain(
      r.body.data.homeroomGap.level,
    );
    expect(Array.isArray(r.body.data.rejections)).toBe(true);
    expect(typeof r.body.data.rejectCount).toBe('number');
  });

  it('역할 차단: 학생 본인 토큰 → 403(뷰어는 관리자·HR·선생님 전용)', async () => {
    const r = await get(`students/${studentId}/record-overview`, tok.student);
    expect(r.status).toBe(403);
  });
});
