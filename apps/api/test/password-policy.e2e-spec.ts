import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * d2 §10 보안: 약한 비밀번호 가입 거부(400), 정책 충족 시 가입 성공.
 */
describe('d2 비밀번호 정책(§10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const strongLogin = 'pwpolicy_strong';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = mod.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { login_id: strongLogin } });
    await app.close();
  });

  it('약한 비밀번호 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({ loginId: 'pwpolicy_weak', password: 'short', name: '약함', role: 'student' });
    expect(res.status).toBe(400);
  });

  it('정책 충족 비밀번호 → 가입 성공', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({ loginId: strongLogin, password: 'mentor2026', name: '강함', role: 'student' });
    expect(res.status).toBe(201);
  });
});
