import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * 자료실(§material): 게시(선생님)·공개범위 스코프·다운로드 게이트·삭제 권한.
 */
describe('자료실(§material)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};
  let t1Center: string | null = null;
  const created: string[] = [];

  const login = async (id: string) =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ loginId: id, password: 'dev-password!' })
    ).body.data.accessToken;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = mod.get(PrismaService);

    const t1 = await prisma.account.findFirst({ where: { login_id: 't1' } });
    t1Center = t1?.center_id ?? null;
    const sameS = await prisma.account.findFirst({
      where: { role: 'student', center_id: t1Center },
      select: { login_id: true },
    });
    const otherS = await prisma.account.findFirst({
      where: { role: 'student', center_id: { not: t1Center } },
      select: { login_id: true },
    });
    const otherT = await prisma.account.findFirst({
      where: { role: 'teacher', NOT: { login_id: 't1' } },
      select: { login_id: true },
    });

    tok.t1 = await login('t1');
    tok.tOther = await login(otherT!.login_id);
    tok.sSame = await login(sameS!.login_id);
    tok.sOther = await login(otherS!.login_id);
  });

  afterAll(async () => {
    if (created.length) await prisma.material.deleteMany({ where: { id: { in: created } } });
    await app.close();
  });

  const post = (t: string) =>
    request(app.getHttpServer()).post('/api/v1/materials').set(auth(t));

  it('게시: 학생은 403, 선생님은 201(파일 첨부)', async () => {
    const denied = await post(tok.sSame).field('title', 'x').field('visibility', 'public');
    expect(denied.status).toBe(403);

    const pub = await post(tok.t1)
      .field('title', '공개자료')
      .field('visibility', 'public')
      .attach('file', Buffer.from('public-bytes'), 'pub.txt');
    expect(pub.status).toBe(201);
    created.push(pub.body.data.id);

    const center = await post(tok.t1)
      .field('title', '센터자료')
      .field('visibility', 'center')
      .attach('file', Buffer.from('center-bytes'), 'center.txt');
    expect(center.status).toBe(201);
    created.push(center.body.data.id);

    const priv = await post(tok.t1)
      .field('title', '비공개자료')
      .field('visibility', 'private')
      .attach('file', Buffer.from('private-bytes'), 'priv.txt');
    expect(priv.status).toBe(201);
    created.push(priv.body.data.id);
  });

  it('목록 공개범위: 같은 센터 학생=공개+센터(비공개 제외), 타 센터=공개만', async () => {
    const same = await request(app.getHttpServer()).get('/api/v1/materials').set(auth(tok.sSame));
    const sameTitles = same.body.data.map((m: any) => m.title);
    expect(sameTitles).toContain('공개자료');
    expect(sameTitles).toContain('센터자료');
    expect(sameTitles).not.toContain('비공개자료');

    const other = await request(app.getHttpServer()).get('/api/v1/materials').set(auth(tok.sOther));
    const otherTitles = other.body.data.map((m: any) => m.title);
    expect(otherTitles).toContain('공개자료');
    expect(otherTitles).not.toContain('센터자료');
  });

  it('다운로드 게이트: 같은 센터=센터자료 200, 타 센터=403', async () => {
    const centerId = created[1];
    const ok = await request(app.getHttpServer())
      .get(`/api/v1/materials/${centerId}/download`)
      .set(auth(tok.sSame));
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('center-bytes');

    const denied = await request(app.getHttpServer())
      .get(`/api/v1/materials/${centerId}/download`)
      .set(auth(tok.sOther));
    expect(denied.status).toBe(403);
  });

  it('비공개 자료: 타 선생님 다운로드 403, 작성자 200', async () => {
    const privId = created[2];
    const denied = await request(app.getHttpServer())
      .get(`/api/v1/materials/${privId}/download`)
      .set(auth(tok.tOther));
    expect(denied.status).toBe(403);
    const ok = await request(app.getHttpServer())
      .get(`/api/v1/materials/${privId}/download`)
      .set(auth(tok.t1));
    expect(ok.status).toBe(200);
  });

  it('삭제: 타 선생님 403, 작성자 200', async () => {
    const id = created[0];
    const denied = await request(app.getHttpServer())
      .delete(`/api/v1/materials/${id}`)
      .set(auth(tok.tOther));
    expect(denied.status).toBe(403);
    const ok = await request(app.getHttpServer())
      .delete(`/api/v1/materials/${id}`)
      .set(auth(tok.t1));
    expect(ok.status).toBe(200);
    created.shift();
  });
});
