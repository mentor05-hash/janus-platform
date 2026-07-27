import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  ACCOUNTS,
  E2E_PREFIX,
  auth,
  login as doLogin,
} from './fixtures/demo-accounts';

/**
 * 자료실(§material): 게시(선생님)·공개범위 스코프·다운로드 게이트·삭제 권한.
 */
describe('자료실(§material)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};
  let t1Center: string | null = null;
  let otherCenterId = '';
  const created: string[] = [];

  // 픽스처 식별자는 상수로 — beforeAll 의 사전 정리와 afterAll 의 원복이 같은 값을 써야
  // 중단된 실행의 잔여물도 다음 실행에서 자동 회수된다. 이름 접두어 규약은 E2E_PREFIX.
  const OTHER_CENTER = `${E2E_PREFIX}material-other-center`;
  const OTHER_STUDENT = `${E2E_PREFIX}material_other_student`;

  /** 정리 순서 고정: account → center. account.center_id FK 에 ON DELETE 가 없어 뒤집으면 FK 위반이다. */
  const dropFixture = async () => {
    await prisma.account.deleteMany({ where: { login_id: OTHER_STUDENT } }); // student_profile 은 Cascade
    await prisma.center.deleteMany({ where: { name: OTHER_CENTER } });
  };

  const login = (id: string) => doLogin(app, id);

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

    const t1 = await prisma.account.findFirstOrThrow({
      where: { login_id: ACCOUNTS.teacher },
    });
    t1Center = t1.center_id ?? null;
    if (!t1Center)
      throw new Error(
        `${ACCOUNTS.teacher} 에 center_id 가 없다 — 센터 공개범위 검증이 성립하지 않는다.`,
      );

    const sameS = await prisma.account.findFirstOrThrow({
      where: { role: 'student', center_id: t1Center },
      orderBy: { login_id: 'asc' }, // 결정론 — orderBy 없으면 회차마다 다른 학생을 잡는다
      select: { login_id: true, center_id: true },
    });
    const otherT = await prisma.account.findFirstOrThrow({
      where: { role: 'teacher', NOT: { login_id: ACCOUNTS.teacher } },
      orderBy: { login_id: 'asc' },
      select: { login_id: true },
    });

    // ⚠ **타 센터 학생은 스펙이 직접 만든다.** 시드에는 센터가 1개뿐이라 `center_id: { not: t1Center }` 는
    //   항상 0건이었고(그래서 otherS 가 null → 스위트 전멸), 설령 있는 값을 느슨하게 잡으면 같은 센터 학생을
    //   집어 `centers.has(m.center_id)` 경계를 **전혀 타지 않는 위양성**이 된다.
    await dropFixture();
    const fxCenter = await prisma.center.create({
      data: { name: OTHER_CENTER },
      select: { id: true },
    });
    otherCenterId = fxCenter.id;
    const fxAcc = await prisma.account.create({
      data: {
        role: 'student',
        center_id: otherCenterId,
        login_id: OTHER_STUDENT,
        pw_hash: t1.pw_hash, // 시드 계정 해시 복사 — 같은 비번(DEMO_PW)으로 로그인된다
        name: 'e2e 타 센터 학생',
        status: 'approved',
      },
      select: { id: true },
    });
    await prisma.student_profile.create({
      data: { account_id: fxAcc.id, center_id: otherCenterId },
    });

    tok.t1 = await login(ACCOUNTS.teacher); // 구 't1' 은 시드에 없는 값이었다
    tok.tOther = await login(otherT.login_id);
    tok.sSame = await login(sameS.login_id);
    tok.sOther = await login(OTHER_STUDENT);

    // 경계가 살아 있다는 불변식 — 같은 센터/타 센터가 정말 다른 센터여야 한다.
    expect(sameS.center_id).toBe(t1Center);
    expect(otherCenterId).not.toBe(t1Center);
  });

  afterAll(async () => {
    if (created.length)
      await prisma.material.deleteMany({ where: { id: { in: created } } });
    await dropFixture();
    await app.close();
  });

  const post = (t: string) =>
    request(app.getHttpServer()).post('/api/v1/materials').set(auth(t));

  it('게시: 학생은 403, 선생님은 201(파일 첨부)', async () => {
    const denied = await post(tok.sSame)
      .field('title', 'x')
      .field('visibility', 'public');
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
    const same = await request(app.getHttpServer())
      .get('/api/v1/materials')
      .set(auth(tok.sSame));
    const sameTitles = same.body.data.map((m: any) => m.title);
    expect(sameTitles).toContain('공개자료');
    expect(sameTitles).toContain('센터자료');
    expect(sameTitles).not.toContain('비공개자료');

    const other = await request(app.getHttpServer())
      .get('/api/v1/materials')
      .set(auth(tok.sOther));
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
