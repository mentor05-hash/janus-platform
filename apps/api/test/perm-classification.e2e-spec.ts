import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * 관리자 권한레벨(L1마스터/L2본사/L3센터) + 회원 분류(선생님·학생, 확장 가능).
 */
const TEA = '00000000-0000-4000-8000-0000000000a2';

describe('권한레벨·회원분류(§iam·§people)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};

  const login = async (id: string) => {
    const r = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ loginId: id, password: 'dev-password!' });
    return r.body.data.accessToken as string;
  };

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
    tok.hq = await login('hq01');
    tok.center = await login('admin01');
    await prisma.member_type.deleteMany({
      where: { kind: 'teacher', code: 'substitute' },
    });
  });

  afterAll(async () => {
    await prisma.member_type.deleteMany({
      where: { kind: 'teacher', code: 'substitute' },
    });
    await prisma.teacher_profile.update({
      where: { account_id: TEA },
      data: { type_code: null },
    });
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('/me 가 관리자 계층(adminTier) 노출', async () => {
    const m = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set(auth(tok.master));
    const c = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set(auth(tok.center));
    expect(m.body.data.permLevel).toBe('L1');
    expect(m.body.data.adminTier).toBe('마스터');
    expect(c.body.data.adminTier).toBe('센터관리자');
  });

  it('분류 목록 조회(선생님 5종 시드)', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/v1/admin/member-types?kind=teacher')
      .set(auth(tok.center));
    const codes = r.body.data.map((x: any) => x.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'fulltime',
        'parttime',
        'mentor',
        'consultant',
        'external',
      ]),
    );
  });

  it('분류 추가: 센터관리자(L3) 거부, 본사(L2) 허용', async () => {
    const denied = await request(app.getHttpServer())
      .post('/api/v1/admin/member-types')
      .set(auth(tok.center))
      .send({ kind: 'teacher', code: 'substitute', label: '대강 선생님' });
    expect(denied.status).toBe(403);

    const ok = await request(app.getHttpServer())
      .post('/api/v1/admin/member-types')
      .set(auth(tok.hq))
      .send({ kind: 'teacher', code: 'substitute', label: '대강 선생님' });
    expect(ok.status).toBe(201);
  });

  it('선생님 분류 배정(센터관리자)', async () => {
    const r = await request(app.getHttpServer())
      .patch(`/api/v1/admin/teachers/${TEA}/type`)
      .set(auth(tok.center))
      .send({ typeCode: 'fulltime' });
    expect(r.status).toBe(200);
    const prof = await prisma.teacher_profile.findUnique({
      where: { account_id: TEA },
    });
    expect(prof?.type_code).toBe('fulltime');
  });
});
