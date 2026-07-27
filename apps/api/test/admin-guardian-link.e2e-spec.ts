import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { GuardianService } from '../src/modules/people/guardian.service';
import { ACCOUNTS, DEMO_PW, login as loginAs } from './fixtures/demo-accounts';

/**
 * 관리자 보호자 연결 복구(O125) — O124 가 연 재신청 경로가 쿨다운·횟수로 막혔을 때의 **마지막 출구**.
 *
 * 왜 이 스펙이 생겼나: O124 는 관리자 강제 복구를 백엔드에만 넣었고 화면이 없었다. 학생·보호자
 * 화면은 "관리자에게 문의"라고 안내하는데 그 문의를 받은 관리자가 쓸 경로가 제품에 없었다.
 *
 * 여기서 고정하는 계약:
 *  ① 목록은 admin/hr 전용이고 '왜 막혔는지'(쿨다운/횟수)를 준다 — 없으면 개입 판단이 불가능하다.
 *  ② 강제 복구는 **센터로 좁혀진다**(O125 전에는 가드가 없어 타 센터 연결까지 뒤집혔다).
 *  ③ 복구는 감사 로그에 남고 **학생에게 알림이 간다**(학생이 끊은 것을 동의 없이 되살리므로).
 *
 * 센터 격리는 시드 센터가 1개뿐이라 HTTP 로는 타 센터 케이스를 만들 수 없다 →
 * center-isolation.e2e-spec.ts 와 같이 AuthUser 를 위조해 서비스 레벨로 검증한다.
 * 역할 가드(@Roles)는 서비스 호출로는 안 잡히므로 HTTP 레벨로 따로 검증한다.
 */
const OTHER_CENTER = '00000000-0000-4000-8000-0000000000c2';

describe('관리자 보호자 연결 복구(O125)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: GuardianService;
  const tok: Record<string, string> = {};
  let linkId = '';
  let guardianId = '';
  let studentId = '';
  let adminId = '';
  let centerId: string | null = null;

  const get = (p: string, t: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/${p}`)
      .set({ Authorization: `Bearer ${t}` });

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
    svc = mod.get(GuardianService);

    // 로그인 횟수를 최소로 — IP 리밋 분당 10회·계정 잠금 5회/15분에 걸리지 않게.
    tok.admin = await loginAs(app, ACCOUNTS.centerAdmin, DEMO_PW);
    tok.student = await loginAs(app, ACCOUNTS.student, DEMO_PW);

    const [g, s, a] = await Promise.all([
      prisma.account.findFirstOrThrow({
        where: { login_id: ACCOUNTS.guardian },
        select: { id: true },
      }),
      prisma.account.findFirstOrThrow({
        where: { login_id: ACCOUNTS.student },
        select: { id: true, center_id: true },
      }),
      prisma.account.findFirstOrThrow({
        where: { login_id: ACCOUNTS.centerAdmin },
        select: { id: true },
      }),
    ]);
    guardianId = g.id;
    studentId = s.id;
    adminId = a.id;
    centerId = s.center_id;

    const link = await prisma.guardian_student_link.upsert({
      where: {
        guardian_id_student_id: {
          guardian_id: guardianId,
          student_id: studentId,
        },
      },
      create: {
        guardian_id: guardianId,
        student_id: studentId,
        relation: '모',
        status: 'revoked',
        link_method: 'test',
      },
      update: { status: 'revoked' },
    });
    linkId = link.id;
    // 상태뿐 아니라 **이력도** 비운다. 앞선 실행이 중단되면 admin_unlock 잔여가 남아
    // 재신청 집계 기준선을 옮겨 놓는데, 그러면 이 스펙이 무엇을 검증하는지가 실행마다 달라진다.
    await prisma.guardian_link_event.deleteMany({ where: { link_id: linkId } });
    await prisma.audit_log.deleteMany({
      where: {
        action: { in: ['guardian.link.override', 'guardian.link.unlock'] },
        target_id: linkId,
      },
    });
  });

  afterAll(async () => {
    // 다른 스위트(O105/O106 학부모 열람·계획)가 전제하는 기본값 = approved 연결 1건.
    await prisma.guardian_student_link.update({
      where: { id: linkId },
      data: { status: 'approved' },
    });
    await prisma.guardian_link_event.deleteMany({ where: { link_id: linkId } });
    await prisma.audit_log.deleteMany({
      where: {
        action: { in: ['guardian.link.override', 'guardian.link.unlock'] },
        target_id: linkId,
      },
    });
    await app.close();
  });

  // center-isolation.e2e-spec 은 id:'x' 로 위조하지만 그 스펙은 쓰기를 하지 않는다.
  // 여기서는 복구가 guardian_link_event.actor_id(uuid)·audit_log.actor_id 에 기록되므로 실제 계정 id 여야 한다.
  const admin = (cid: string | null) =>
    ({
      id: adminId,
      role: 'admin',
      centerId: cid,
      loginId: ACCOUNTS.centerAdmin,
    }) as any;

  it('목록은 admin/hr 전용 — 학생 토큰은 403', async () => {
    const r = await get('admin/guardian-links', tok.student);
    expect(r.status).toBe(403);
  });

  it('관리자 목록에 끊긴 연결이 뜨고 상대 이름·아이디가 함께 온다', async () => {
    const r = await get('admin/guardian-links', tok.admin);
    expect(r.status).toBe(200);
    const row = (r.body.data.items as any[]).find((x) => x.id === linkId);
    expect(row).toBeDefined();
    expect(row.status).toBe('revoked');
    expect(row.canRecover).toBe(true); // 화면이 복구 버튼을 띄우는 근거
    // 운영자가 동명이인을 가려야 하므로 로그인 아이디까지 준다(관리자 전용 화면).
    expect(row.studentLoginId).toBe(ACCOUNTS.student);
    expect(row.guardianLoginId).toBe(ACCOUNTS.guardian);
  });

  it('검색은 학생·보호자 양쪽 이름/아이디에 걸린다', async () => {
    const byStudent = await get(
      `admin/guardian-links?q=${ACCOUNTS.student}`,
      tok.admin,
    );
    expect(
      (byStudent.body.data.items as any[]).some((x) => x.id === linkId),
    ).toBe(true);
    const byGuardian = await get(
      `admin/guardian-links?q=${ACCOUNTS.guardian}`,
      tok.admin,
    );
    expect(
      (byGuardian.body.data.items as any[]).some((x) => x.id === linkId),
    ).toBe(true);
    const miss = await get(
      'admin/guardian-links?q=존재하지않는이름zzz',
      tok.admin,
    );
    expect((miss.body.data.items as any[]).length).toBe(0);
  });

  it("'왜 막혔는지'를 준다 — 쿨다운이면 해제 예정일까지", async () => {
    await prisma.guardian_link_event.deleteMany({ where: { link_id: linkId } });
    await prisma.guardian_link_event.create({
      data: {
        link_id: linkId,
        from_status: 'approved',
        to_status: 'revoked',
        actor_id: studentId,
        actor_role: 'student',
        reason: 'respond',
      },
    });
    const r = await get('admin/guardian-links', tok.admin);
    const row = (r.body.data.items as any[]).find((x) => x.id === linkId);
    expect(row.relinkBlocked).toBe('cooldown');
    expect(new Date(row.relinkAvailableAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(row.events.length).toBeGreaterThan(0);
  });

  it('횟수를 모두 쓴 연결은 max_attempts 로 구분된다 — 관리자 개입 외에 길이 없다는 표시', async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.guardian_link_event.deleteMany({ where: { link_id: linkId } });
    await prisma.guardian_link_event.create({
      data: {
        link_id: linkId,
        from_status: 'approved',
        to_status: 'revoked',
        actor_id: studentId,
        actor_role: 'student',
        reason: 'respond',
        created_at: old,
      },
    });
    for (let i = 0; i < 3; i++) {
      await prisma.guardian_link_event.create({
        data: {
          link_id: linkId,
          from_status: 'revoked',
          to_status: 'pending',
          actor_id: guardianId,
          actor_role: 'guardian',
          reason: 'relink',
          created_at: old,
        },
      });
    }
    const r = await get('admin/guardian-links', tok.admin);
    const row = (r.body.data.items as any[]).find((x) => x.id === linkId);
    expect(row.relinkBlocked).toBe('max_attempts');
    expect(row.relinkAttempts).toBe(3);
  });

  /**
   * 기본 scope='stuck' — 이 화면의 목적은 막힌 연결이다. 전체를 기본으로 두면 정상 approved 가
   * 상한(100)을 채워 정작 봐야 할 rejected/revoked 가 잘려 나가고, 관리자는 '막힌 연결이 없다'고
   * 오판한다. 잘렸을 때는 truncated 로 그 사실을 밝힌다(빈 목록과 '못 봤음'을 구분).
   */
  it('기본은 막힌 연결만 — approved 는 scope=all 에서만 보인다', async () => {
    await prisma.guardian_student_link.update({
      where: { id: linkId },
      data: { status: 'approved' },
    });
    const stuck = await get('admin/guardian-links', tok.admin);
    expect(stuck.body.data.scope).toBe('stuck');
    expect(
      (stuck.body.data.items as any[]).find((x) => x.id === linkId),
    ).toBeUndefined();

    const all = await get('admin/guardian-links?scope=all', tok.admin);
    expect(all.body.data.scope).toBe('all');
    expect(
      (all.body.data.items as any[]).find((x) => x.id === linkId),
    ).toBeDefined();

    // 상한에 걸리지 않은 응답은 truncated=false 여야 한다(화면이 괜한 경고를 띄우지 않게).
    expect(all.body.data.truncated).toBe(false);
    expect(all.body.data.limit).toBe(100);
    await prisma.guardian_student_link.update({
      where: { id: linkId },
      data: { status: 'revoked' },
    });
  });

  it('타 센터 관리자는 목록에서도 보지 못하고 복구도 거부된다', async () => {
    expect(centerId).toBeTruthy(); // 시드가 바뀌어 학생이 센터 미소속이면 이 테스트는 무의미해진다
    const { items: rows } = await svc.adminListLinks(admin(OTHER_CENTER));
    expect(rows.find((x) => x.id === linkId)).toBeUndefined();
    await expect(
      svc.respondLink(linkId, { action: 'approve' }, admin(OTHER_CENTER)),
    ).rejects.toThrow(/다른 센터/);
    // 거부됐으니 상태는 그대로여야 한다(부분 적용 없음).
    const row = await prisma.guardian_student_link.findUniqueOrThrow({
      where: { id: linkId },
    });
    expect(row.status).toBe('revoked');
  });

  it('본사(센터 미소속)는 전체를 본다', async () => {
    const { items: rows } = await svc.adminListLinks(admin(null));
    expect(rows.find((x) => x.id === linkId)).toBeDefined();
  });

  /**
   * O126 — 가벼운 복구. 강제 승인은 학생 동의를 우회하지만, 관리자가 받는 문의 대부분은
   * '연결해 달라'가 아니라 '다시 신청이라도 하게 해 달라'다. 이 경로는 **상태를 바꾸지 않고**
   * 재신청 집계의 기준선만 옮겨, 연결 성립을 학생 승인에 그대로 남긴다.
   */
  describe('재신청 잠금 해제(가벼운 복구)', () => {
    /** 쿨다운에 걸린 상태를 만든다(방금 해제됨). */
    async function makeCooldown() {
      await prisma.guardian_student_link.update({
        where: { id: linkId },
        data: { status: 'revoked' },
      });
      await prisma.guardian_link_event.deleteMany({
        where: { link_id: linkId },
      });
      await prisma.guardian_link_event.create({
        data: {
          link_id: linkId,
          from_status: 'approved',
          to_status: 'revoked',
          actor_id: studentId,
          actor_role: 'student',
          reason: 'respond',
        },
      });
    }

    it('해제해도 상태는 그대로다 — 연결이 되는 게 아니라 신청이 가능해질 뿐이다', async () => {
      await makeCooldown();
      const notifsBefore = await prisma.notification.count({
        where: { recipient_id: guardianId, type: 'guardian_link_unlocked' },
      });

      await svc.unlockRelink(admin(centerId), linkId);

      // 핵심 불변식: 강제 복구와 달리 status 는 손대지 않는다.
      const row = await prisma.guardian_student_link.findUniqueOrThrow({
        where: { id: linkId },
      });
      expect(row.status).toBe('revoked');
      // 학생에게는 알리지 않는다 — 아직 아무것도 열리지 않았다(동의 절차가 살아 있다).
      const restored = await prisma.notification.count({
        where: {
          recipient_id: studentId,
          type: 'guardian_link_restored',
          created_at: { gt: new Date(Date.now() - 5000) },
        },
      });
      expect(restored).toBe(0);
      // 알림은 보호자에게 — 다시 신청할 수 있게 된 당사자가 모르면 해제가 아무 일도 하지 않는다.
      expect(
        await prisma.notification.count({
          where: { recipient_id: guardianId, type: 'guardian_link_unlocked' },
        }),
      ).toBe(notifsBefore + 1);
      // 이력에는 '상태 변화 없음'이 드러나야 한다(from === to).
      const ev = await prisma.guardian_link_event.findFirst({
        where: { link_id: linkId },
        orderBy: { created_at: 'desc' },
      });
      expect(ev?.reason).toBe('admin_unlock');
      expect(ev?.from_status).toBe(ev?.to_status);
      const audit = await prisma.audit_log.findFirst({
        where: { action: 'guardian.link.unlock', target_id: linkId },
        orderBy: { created_at: 'desc' },
      });
      expect(audit?.summary).toMatch(/잠금 해제/);
    });

    it('해제 뒤에는 보호자가 곧바로 재신청할 수 있고, 승인은 여전히 학생 몫이다', async () => {
      await makeCooldown();
      const guardianUser = {
        id: guardianId,
        role: 'guardian',
        centerId,
        loginId: ACCOUNTS.guardian,
      } as any;

      // 해제 전에는 쿨다운에 막힌다.
      await expect(
        svc.requestLink(guardianUser, { studentLoginId: ACCOUNTS.student }),
      ).rejects.toThrow(/재신청할 수 없습니다/);

      await svc.unlockRelink(admin(centerId), linkId);

      // 해제 직후 재신청이 통과한다. 해제 이벤트 자신이 쿨다운을 다시 걸면(gte 버그) 여기서 터진다.
      const revived = await svc.requestLink(guardianUser, {
        studentLoginId: ACCOUNTS.student,
      });
      expect(revived.status).toBe('pending'); // approved 가 아니다 — 학생 승인이 남아 있다
    });

    it('횟수 소진도 풀린다 — 해제 이전 재신청은 집계에서 빠진다', async () => {
      const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await prisma.guardian_student_link.update({
        where: { id: linkId },
        data: { status: 'revoked' },
      });
      await prisma.guardian_link_event.deleteMany({
        where: { link_id: linkId },
      });
      await prisma.guardian_link_event.create({
        data: {
          link_id: linkId,
          from_status: 'approved',
          to_status: 'revoked',
          actor_id: studentId,
          actor_role: 'student',
          reason: 'respond',
          created_at: old,
        },
      });
      for (let i = 0; i < 3; i++) {
        await prisma.guardian_link_event.create({
          data: {
            link_id: linkId,
            from_status: 'revoked',
            to_status: 'pending',
            actor_id: guardianId,
            actor_role: 'guardian',
            reason: 'relink',
            created_at: old,
          },
        });
      }
      const guardianUser = {
        id: guardianId,
        role: 'guardian',
        centerId,
        loginId: ACCOUNTS.guardian,
      } as any;
      await expect(
        svc.requestLink(guardianUser, { studentLoginId: ACCOUNTS.student }),
      ).rejects.toThrow(/센터 관리자에게 문의/);

      await svc.unlockRelink(admin(centerId), linkId);

      // 관리자 목록도 같은 기준선을 써야 한다 — 서버 판정과 화면이 갈리면 안 된다.
      const { items } = await svc.adminListLinks(admin(centerId));
      const row = items.find((x) => x.id === linkId);
      expect(row?.relinkBlocked).toBeNull();
      expect(row?.relinkAttempts).toBe(0);

      const revived = await svc.requestLink(guardianUser, {
        studentLoginId: ACCOUNTS.student,
      });
      expect(revived.status).toBe('pending');
    });

    it('막히지 않은 연결에 해제를 쓰면 거부한다 — 무의미한 개입·이력을 막는다', async () => {
      await prisma.guardian_student_link.update({
        where: { id: linkId },
        data: { status: 'revoked' },
      });
      await prisma.guardian_link_event.deleteMany({
        where: { link_id: linkId },
      }); // 이력 없음 = 제한 없음
      await expect(svc.unlockRelink(admin(centerId), linkId)).rejects.toThrow(
        /이미 보호자가 다시 신청할 수 있는/,
      );
    });

    it('연결된(approved) 건에는 쓸 수 없고, 타 센터 관리자도 거부된다', async () => {
      await prisma.guardian_student_link.update({
        where: { id: linkId },
        data: { status: 'approved' },
      });
      await expect(svc.unlockRelink(admin(centerId), linkId)).rejects.toThrow(
        /거절·해제된 연결에만/,
      );

      await makeCooldown();
      await expect(
        svc.unlockRelink(admin(OTHER_CENTER), linkId),
      ).rejects.toThrow(/다른 센터/);
    });

    it('해제는 admin/hr 전용 — 학생 토큰은 403', async () => {
      const r = await request(app.getHttpServer())
        .post(`/api/v1/admin/guardian-links/${linkId}/unlock`)
        .set({ Authorization: `Bearer ${tok.student}` })
        .send({});
      expect(r.status).toBe(403);
    });
  });

  it('강제 복구 → approved + 감사 로그 + 학생에게 알림', async () => {
    // 앞 describe 가 상태를 바꿔 놓으므로 이 테스트의 전제(revoked)를 다시 세운다.
    await prisma.guardian_student_link.update({
      where: { id: linkId },
      data: { status: 'revoked' },
    });
    const notifsBefore = await prisma.notification.count({
      where: { recipient_id: studentId, type: 'guardian_link_restored' },
    });

    const res = await svc.respondLink(
      linkId,
      { action: 'approve' },
      admin(centerId),
    );
    expect(res.status).toBe('approved');

    // 이력: 일반 응답과 구분되는 admin_override
    const ev = await prisma.guardian_link_event.findFirst({
      where: { link_id: linkId },
      orderBy: { created_at: 'desc' },
    });
    expect(ev?.reason).toBe('admin_override');

    // 감사 로그: record() 는 실패를 삼키므로 예외가 아니라 DB 로 확인해야 한다.
    const audit = await prisma.audit_log.findFirst({
      where: { action: 'guardian.link.override', target_id: linkId },
      orderBy: { created_at: 'desc' },
    });
    expect(audit).toBeTruthy();
    expect(audit?.target_type).toBe('guardian_student_link');
    // meta 는 화면에 안 나오므로 운영자가 볼 정보는 summary 에 있어야 한다.
    expect(audit?.summary).toMatch(/강제 복구/);

    // 학생이 끊은 것을 동의 없이 되살렸으므로 학생에게 반드시 알린다.
    const notifsAfter = await prisma.notification.count({
      where: { recipient_id: studentId, type: 'guardian_link_restored' },
    });
    expect(notifsAfter).toBe(notifsBefore + 1);
  });
});
