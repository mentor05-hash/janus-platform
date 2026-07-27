import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ACCOUNTS, auth, login as doLogin } from './fixtures/demo-accounts';

/**
 * 대시보드(§D 권한 매트릭스 + 평가/순위·센터비교 엔진).
 * - 설정(가중치/원장)=본사급(L2↑)만, 센터관리자(L3)=조회·자기 센터 스코프(fail-closed).
 * - 합계 100 검증, z-score 0~100, 센터 격리.
 */
describe('대시보드(§dashboard)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tok: Record<string, string> = {};
  let adminCenter: string | null = null;
  let ownTeacher = '';
  let otherTeacher = '';

  const login = (id: string) => doLogin(app, id);
  const get = (p: string, t: string) =>
    request(app.getHttpServer()).get(`/api/v1/${p}`).set(auth(t));
  const put = (p: string, t: string, b: any) =>
    request(app.getHttpServer()).put(`/api/v1/${p}`).set(auth(t)).send(b);

  const WEIGHTS_OK = {
    w_total: 20,
    w_completion: 20,
    w_rerequest: 15,
    w_reject: 10,
    w_noshow: 10,
    w_response: 10,
    w_satisfaction: 15,
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

    tok.master = await login(ACCOUNTS.master);
    tok.hq = await login(ACCOUNTS.hq); // 본사(L2) — 구 'hq1' 은 시드에 없는 값이었다
    tok.center = await login(ACCOUNTS.centerAdmin);
    tok.teacher = await login(ACCOUNTS.teacher); // 구 't1' 없음

    const ca = await prisma.account.findUnique({
      where: { login_id: 'admin01' },
    });
    adminCenter = ca?.center_id ?? null;
    const own = adminCenter
      ? await prisma.teacher_profile.findFirst({
          where: { center_id: adminCenter },
        })
      : null;
    ownTeacher = own?.account_id ?? '';
    const other = await prisma.teacher_profile.findFirst({
      where: adminCenter ? { center_id: { not: adminCenter } } : {},
    });
    otherTeacher = other?.account_id ?? '';
  });

  afterAll(async () => {
    if (adminCenter)
      await prisma.evaluation_weight_policy.deleteMany({
        where: { center_id: adminCenter },
      });
    if (ownTeacher) {
      await prisma.teacher_monthly_hours.deleteMany({
        where: { teacher_id: ownTeacher },
      });
      await prisma.teacher_profile.update({
        where: { account_id: ownTeacher },
        data: { director_role: null },
      });
    }
    await app.close();
  });

  it('가중치 조회: 본사 200(전사 기본 반환)', async () => {
    const r = await get('admin/evaluation/weights', tok.hq);
    expect(r.status).toBe(200);
    expect(r.body.data).toBeTruthy();
  });

  it('가중치 조정: 합계≠100 → 400', async () => {
    const r = await put('admin/evaluation/weights', tok.hq, {
      ...WEIGHTS_OK,
      w_satisfaction: 16,
    });
    expect(r.status).toBe(400);
  });

  it('가중치 조정: 센터관리자(L3) → 403(설정 권한 없음)', async () => {
    const r = await put('admin/evaluation/weights', tok.center, {
      ...WEIGHTS_OK,
      centerId: adminCenter,
    });
    expect(r.status).toBe(403);
  });

  it('가중치 조정: 본사(L2) 합계100 → 200', async () => {
    const r = await put('admin/evaluation/weights', tok.hq, {
      ...WEIGHTS_OK,
      centerId: adminCenter,
    });
    expect(r.status).toBe(200);
  });

  it('순위 조회: 본사=전체 스코프 200', async () => {
    const r = await get('admin/evaluation/ranking?period=all', tok.hq);
    expect(r.status).toBe(200);
    expect(r.body.meta.scope).toBe('global');
    if (r.body.data.length > 1) {
      // 점수 내림차순 + rank 부여
      expect(r.body.data[0].score).toBeGreaterThanOrEqual(r.body.data[1].score);
      expect(r.body.data[0].rank).toBe(1);
    }
  });

  it('순위 조회: 센터관리자=자기 센터 스코프', async () => {
    const r = await get('admin/evaluation/ranking?period=all', tok.center);
    expect(r.status).toBe(200);
    expect(r.body.meta.scope).toBe(adminCenter ?? 'global');
  });

  it('원장 지정: 센터관리자 → 403, 본사 → 200', async () => {
    if (!ownTeacher) return;
    const denied = await put(
      `admin/teachers/${ownTeacher}/director`,
      tok.center,
      {
        directorRole: '원장',
      },
    );
    expect(denied.status).toBe(403);
    const ok = await put(`admin/teachers/${ownTeacher}/director`, tok.hq, {
      directorRole: '원장',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.directorRole).toBe('원장');
  });

  it('월별 시수: 센터관리자가 타 센터 선생님 → 403', async () => {
    if (!otherTeacher) return;
    const r = await put(
      `admin/teachers/${otherTeacher}/monthly-hours`,
      tok.center,
      {
        yearMonth: '2026-06',
        hours: 80,
      },
    );
    expect(r.status).toBe(403);
  });

  it('월별 시수: 자기 센터 선생님 → 200', async () => {
    if (!ownTeacher) return;
    const r = await put(
      `admin/teachers/${ownTeacher}/monthly-hours`,
      tok.center,
      {
        yearMonth: '2026-06',
        hours: 80,
      },
    );
    expect(r.status).toBe(200);
    expect(Number(r.body.data.hours)).toBe(80);
  });

  it('센터 비교: 본사=전체 z-score 0~100, 센터관리자=자기 센터만', async () => {
    const hq = await get('ops/center-comparison?period=all', tok.hq);
    expect(hq.status).toBe(200);
    expect(hq.body.meta.scope).toBe('global');
    for (const c of hq.body.data) {
      expect(c.score0to100).toBeGreaterThanOrEqual(0);
      expect(c.score0to100).toBeLessThanOrEqual(100);
    }
    const ca = await get('ops/center-comparison?period=all', tok.center);
    expect(ca.status).toBe(200);
    expect(ca.body.meta.scope).toBe('center');
    expect(ca.body.data.length).toBeLessThanOrEqual(1); // 자기 센터 위치만
  });

  it('피벗(center): 본사 200 rows', async () => {
    const r = await get('ops/pivots/center?period=all', tok.hq);
    expect(r.status).toBe(200);
    expect(r.body.meta.view).toBe('center');
    expect(Array.isArray(r.body.data)).toBe(true);
  });

  it('피벗 dedup: 같은 선생님·학생·날짜 중복 예약은 1건만(상태 우선 done 보존)', async () => {
    const student = await prisma.student_profile.findFirst({
      select: { account_id: true },
    });
    if (!student || !ownTeacher) return; // 시드 없으면 skip(방어)

    const teacherTotal = async () => {
      const r = await get(
        `ops/pivots/teacher-in-center?period=all&teacherId=${ownTeacher}`,
        tok.hq,
      );
      const row = r.body.data.find((x: any) => x.key === ownTeacher);
      return { total: row?.total ?? 0, done: row?.done ?? 0 };
    };

    const before = await teacherTotal();
    // 동일 T·U·D(같은 날 10시/11시) 2건: done 1 + cancelled 1 → dedup 후 1건(done 보존)
    const day = '2026-05-15';
    const mk = (
      h: number,
      status: 'done' | 'cancelled',
      type: 'subject' | 'homeroom',
    ) =>
      prisma.booking.create({
        data: {
          student_id: student.account_id,
          teacher_id: ownTeacher,
          center_id: adminCenter,
          consult_type: type,
          mode: 'zoom',
          status,
          start_at: new Date(`${day}T0${h}:00:00Z`),
        },
        select: { id: true },
      });
    const created = [
      await mk(1, 'cancelled', 'homeroom'),
      await mk(2, 'done', 'subject'),
    ];
    try {
      const after = await teacherTotal();
      expect(after.total - before.total).toBe(1); // 2건 → +1 (중복제거)
      expect(after.done - before.done).toBe(1); // done 이 cancelled 보다 우선 보존
    } finally {
      await prisma.booking.deleteMany({
        where: { id: { in: created.map((c) => c.id) } },
      });
    }
  });

  it('역할 차단: 선생님은 대시보드 접근 403', async () => {
    const r = await get('admin/evaluation/ranking', tok.teacher);
    expect(r.status).toBe(403);
  });
});
