import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * 미구현 구현(SC-01): 조직·관리자 계정 생성 API + 권한 위계.
 * 센터/관리자 생성은 본사 이상, 본사관리자(L2) 생성은 마스터(L1)만.
 */
describe('조직·관리자 생성(§iam)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};
  let centerId = '';
  const CREATED = ['orgtest_hq', 'orgtest_ca'];

  const login = async (id: string, password = 'dev-password!') =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ loginId: id, password })
    ).body.data.accessToken;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
    tok.hq = await login('hq1');
    tok.center = await login('admin01');
    await prisma.account.deleteMany({ where: { login_id: { in: CREATED } } });
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { login_id: { in: CREATED } } });
    if (centerId) await prisma.center.deleteMany({ where: { id: centerId } });
    await app.close();
  });

  const post = (p: string, t: string, b: any) =>
    request(app.getHttpServer()).post(`/api/v1/${p}`).set(auth(t)).send(b);

  it('센터 생성: 본사(L2) 허용, 센터(L3) 거부', async () => {
    const denied = await post('centers', tok.center, {
      name: 'X센터',
      region: '테스트',
    });
    expect(denied.status).toBe(403);
    const ok = await post('centers', tok.hq, {
      name: '시험센터',
      region: '테스트',
    });
    expect(ok.status).toBe(201);
    centerId = ok.body.data.id;
  });

  it('본사관리자(L2) 생성: 마스터(L1)만 허용, 본사(L2)는 거부', async () => {
    const denied = await post('admin/staff', tok.hq, {
      loginId: 'orgtest_hq',
      password: 'mentor2026',
      name: '본사X',
      permLevel: 'L2',
    });
    expect(denied.status).toBe(403);
    const ok = await post('admin/staff', tok.master, {
      loginId: 'orgtest_hq',
      password: 'mentor2026',
      name: '신규본사',
      permLevel: 'L2',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.tier).toBe('본사관리자');
  });

  it('센터관리자(L3) 생성: 본사 허용, 센터(L3)는 거부 + 새 계정 로그인 tier', async () => {
    const denied = await post('admin/staff', tok.center, {
      loginId: 'orgtest_ca',
      password: 'mentor2026',
      name: 'CAX',
      permLevel: 'L3',
      centerId,
    });
    expect(denied.status).toBe(403);
    const ok = await post('admin/staff', tok.hq, {
      loginId: 'orgtest_ca',
      password: 'mentor2026',
      name: '신규센터',
      permLevel: 'L3',
      centerId,
    });
    expect(ok.status).toBe(201);
    const t = await login('orgtest_ca', 'mentor2026');
    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set(auth(t));
    expect(me.body.data.adminTier).toBe('센터관리자');
  });
});
