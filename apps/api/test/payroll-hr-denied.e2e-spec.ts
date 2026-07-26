import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PayrollService } from '../src/modules/payroll/payroll.service';
import { ACCOUNTS, DEMO_PW, login as loginAs } from './fixtures/demo-accounts';

/**
 * N35 결정(O127) — **HR 은 급여에 권한이 없다**.
 *
 * 왜 이 스펙이 생겼나: 코드는 HR 에게 확정 정산·지급 완료를 허용했는데 웹 nav 는 숨기고
 * 기능정의서는 무권한으로 적어 **세 곳이 서로 달랐다**. 24일 동안 아무도 못 잡은 이유는
 * 단순하다 — **HR 액터로 무언가를 치는 e2e 가 저장소 전체에 0건**이었다.
 * 그래서 이 스펙은 '거부'를 고정한다. 거부는 조용해서 회귀해도 아무도 모른다.
 *
 * 함께 고정: markPaid 의 센터 가드(O127). estimate·settle 에는 있었지만
 * **지급 완료에는 없어** teacher UUID 만 알면 타 센터 교사를 'paid' 로 바꿀 수 있었고,
 * 되돌리는 API 가 없다.
 */
describe('급여 권한 — HR 차단 + 센터 격리(O127)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: PayrollService;
  const tok: Record<string, string> = {};
  let teacherId = '';
  let teacherCenterId: string | null = null;

  const OTHER_CENTER = '00000000-0000-4000-8000-0000000000c2';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = mod.get(PrismaService);
    svc = mod.get(PayrollService);

    // 로그인은 2회만 — IP 리밋 분당 10회.
    tok.hr = await loginAs(app, ACCOUNTS.hr, DEMO_PW);
    tok.admin = await loginAs(app, ACCOUNTS.centerAdmin, DEMO_PW);

    const t = await prisma.account.findFirstOrThrow({
      where: { login_id: ACCOUNTS.teacher },
      select: { id: true, center_id: true },
    });
    teacherId = t.id;
    teacherCenterId = t.center_id;
  });

  afterAll(async () => app.close());

  const hdr = (t: string) => ({ Authorization: `Bearer ${t}` });
  const admin = (cid: string | null) =>
    ({ id: 'a0000000-0000-4000-8000-00000000000a', role: 'admin', centerId: cid, loginId: 'a' }) as any;

  describe('HR 은 급여 엔드포인트 전부 403', () => {
    // 돈이 움직이거나 남의 급여가 보이는 경로 전수. 하나라도 열리면 N35 가 되살아난다.
    const WRITES: [string, string][] = [
      ['확정 정산', `teachers/${'{t}'}/payroll/settle`],
      ['지급 완료', `teachers/${'{t}'}/payroll/pay`],
    ];
    const READS: [string, string][] = [
      ['재무 리포트', 'admin/payroll/report'],
      ['전임 배분 요약', 'admin/payroll/revenue-share'],
      ['배분율 조회', 'admin/payroll/share-policy'],
      ['급여 모델 조회', 'admin/payroll/model'],
    ];

    it.each(WRITES)('%s — HR POST 403', async (_label, path) => {
      const r = await request(app.getHttpServer())
        .post(`/api/v1/${path.replace('{t}', teacherId)}`)
        .set(hdr(tok.hr))
        .send({});
      expect(r.status).toBe(403);
    });

    it.each(READS)('%s — HR GET 403', async (_label, path) => {
      const r = await request(app.getHttpServer()).get(`/api/v1/${path}`).set(hdr(tok.hr));
      expect(r.status).toBe(403);
    });

    it('남의 명세서·예상급여도 못 본다(@Roles 가 없어 서비스 검사에만 의존하는 경로)', async () => {
      // 이 3개는 컨트롤러에 @Roles 가 없다(교사 본인도 쓰므로) — 서비스에서 막혀야 한다.
      for (const p of [
        `teachers/${teacherId}/payroll/payslip`,
        `teachers/${teacherId}/payroll/revenue-share`,
        `teachers/${teacherId}/payroll`,
      ]) {
        const r = await request(app.getHttpServer()).get(`/api/v1/${p}`).set(hdr(tok.hr));
        expect(r.status).toBe(403);
      }
    });

    it('관리자는 같은 경로가 열린다 — 차단이 급여 기능 자체를 죽인 게 아니다', async () => {
      const r = await request(app.getHttpServer()).get('/api/v1/admin/payroll/report').set(hdr(tok.admin));
      expect(r.status).toBe(200);
    });
  });

  describe('센터 격리 — 지급 완료에도 걸린다', () => {
    it('타 센터 관리자는 지급 완료를 할 수 없다', async () => {
      expect(teacherCenterId).toBeTruthy(); // 시드가 바뀌어 교사가 센터 미소속이면 무의미해진다
      await expect(svc.markPaid(teacherId, admin(OTHER_CENTER))).rejects.toThrow(/다른 센터/);
    });

    it('타 센터 관리자는 명세서·매출배분 명세도 못 본다', async () => {
      await expect(svc.payslip(teacherId, admin(OTHER_CENTER))).rejects.toThrow(/다른 센터/);
      await expect(svc.revenueSharePayslip(teacherId, admin(OTHER_CENTER))).rejects.toThrow(/다른 센터/);
    });

    it('자기 센터 관리자는 센터를 이유로 막히지 않는다', async () => {
      // 이 달의 정산 행이 있는지는 **다른 스위트 실행 순서에 좌우된다**(ops-payroll 이 settle·pay 를
      // 남기고 정리하지 않는다). 그래서 '무엇으로 실패하는가'만 본다 — 결과가 성공이든
      // '먼저 정산을 확정'이든 '이미 지급 완료'든 상관없고, **센터가 이유여서는 안 된다**.
      const err = await svc.markPaid(teacherId, admin(teacherCenterId)).then(
        () => null,
        (e: Error) => e,
      );
      expect(String(err?.message ?? '')).not.toMatch(/다른 센터/);
    });
  });
});
