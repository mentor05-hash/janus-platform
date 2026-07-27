import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { GuardianService } from '../src/modules/people/guardian.service';
import { GuardianLinkRequestDto } from '../src/modules/people/dto/guardian.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ACCOUNTS } from './fixtures/demo-accounts';

/**
 * 학부모–자녀 연결 사슬 — **모든 학부모 기능의 선결조건**.
 *
 * 왜 이 스펙이 생겼나: `POST /guardian/links`·`PATCH .../respond` API 는 있었지만 **조회 API 가 없었고**
 * 웹·모바일 어디에도 화면이 없었다. 그래서 학생은 신청이 온 줄 모르고(승인 UI 0), 보호자는 자기 신청
 * 상태를 볼 수 없어 연결이 성립하지 못했고 → 학부모 메뉴 전량(주간 리포트·상담 리포트·자녀 계획·동의·결제)이
 * 빈 화면이었다. O105 공유 동의도 연결 행이 있어야 대상이 생기므로 이 경로가 O105 의 선결조건이다.
 */
describe('학부모–자녀 연결', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: GuardianService;
  let guardian: any;
  let student: any;
  let studentLoginId = '';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    svc = mod.get(GuardianService);

    const g = await prisma.account.findFirstOrThrow({
      where: { login_id: ACCOUNTS.guardian },
      select: { id: true, center_id: true },
    });
    const s = await prisma.account.findFirstOrThrow({
      where: { login_id: ACCOUNTS.student },
      select: { id: true, center_id: true, login_id: true },
    });
    guardian = { id: g.id, role: 'guardian', centerId: g.center_id };
    student = { id: s.id, role: 'student', centerId: s.center_id };
    studentLoginId = s.login_id;

    // 이 스펙이 상태를 만들고 되돌린다 — 다른 스위트가 기대하는 기본값은 'approved' 연결 1건이다.
    await prisma.guardian_student_link.deleteMany({
      where: { guardian_id: g.id, student_id: s.id },
    });
  });

  afterAll(async () => {
    // 기본값 복원(approved) — 다른 O105/O106 스위트가 이 연결을 전제한다.
    await prisma.guardian_student_link.upsert({
      where: {
        guardian_id_student_id: {
          guardian_id: guardian.id,
          student_id: student.id,
        },
      },
      create: {
        guardian_id: guardian.id,
        student_id: student.id,
        relation: '모',
        status: 'approved',
        link_method: 'test',
      },
      update: { status: 'approved' },
    });
    await app.close();
  });

  it('보호자가 자녀 아이디로 연결을 신청하면 pending 으로 생긴다', async () => {
    const link = await svc.requestLink(guardian, {
      studentLoginId,
      relation: '모',
    });
    expect(link.status).toBe('pending');
  });

  it('같은 자녀에 중복 신청은 거절된다', async () => {
    await expect(svc.requestLink(guardian, { studentLoginId })).rejects.toThrow(
      /이미 연결 신청/,
    );
  });

  it('학생은 자기에게 온 신청을 조회할 수 있다 — 이 경로가 없어서 승인이 불가능했다', async () => {
    const rows = await svc.listLinks(student);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].canRespond).toBe(true); // 화면이 승인 버튼을 띄우는 근거
    expect(rows[0].counterpartName).toBeTruthy(); // 상대(보호자) 이름
  });

  it('보호자는 자기 신청 상태를 조회한다 — 상대는 자녀 이름이고 응답 권한은 없다', async () => {
    const rows = await svc.listLinks(guardian);
    expect(rows).toHaveLength(1);
    expect(rows[0].canRespond).toBe(false); // 보호자는 자기 신청을 스스로 승인할 수 없다
  });

  it('학생이 승인하면 approved — 그 뒤에야 보호자 자녀 목록에 나타난다', async () => {
    const [pending] = await svc.listLinks(student);
    const r = await svc.respondLink(pending.id, { action: 'approve' }, student);
    expect(r.status).toBe('approved');
    const children = await svc.listChildren(guardian);
    expect(children.length).toBeGreaterThan(0);
  });

  it('타인은 남의 연결에 응답할 수 없다(소유권)', async () => {
    const [link] = await svc.listLinks(student);
    const stranger = { ...student, id: '00000000-0000-4000-8000-0000000000fe' };
    await expect(
      svc.respondLink(link.id, { action: 'revoke' }, stranger as any),
    ).rejects.toThrow();
  });

  it('학생이 연결을 해제하면 보호자 자녀 목록에서 사라진다', async () => {
    const [link] = await svc.listLinks(student);
    await svc.respondLink(link.id, { action: 'revoke' }, student);
    const children = await svc.listChildren(guardian);
    expect(
      children.find((c: any) => c.studentId === student.id),
    ).toBeUndefined();
  });

  /**
   * 아래 블록은 **화면 문구의 근거**다(O124 — 이전 계약을 뒤집었다).
   *
   * 예전에는 거절·해제가 종착이라 (보호자,학생) 쌍이 **영구히** 연결 불가였고, 모바일 확인 문구도
   * '지금은 다시 신청할 수 없어요'라고 그 사실을 말했다. 지금은 재신청으로 같은 행이 pending 으로
   * 되살아난다 — 대신 즉시 반복은 쿨다운·횟수로 막고, 종착 상태를 곧바로 approved 로 되돌리는 것은
   * 관리자만 할 수 있다. **문구와 이 계약은 한 몸이라** 여기서 함께 고정한다.
   */
  it('해제 직후 재신청은 쿨다운에 막힌다 — 되살릴 수는 있으나 즉시는 아니다', async () => {
    await expect(svc.requestLink(guardian, { studentLoginId })).rejects.toThrow(
      /7일 동안은 재신청할 수 없습니다/,
    );
  });

  it('쿨다운이 지나면 해제된 연결이 pending 으로 부활하고 승인 요청 알림이 다시 간다', async () => {
    const [link] = await svc.listLinks(student);
    // 해제 시각을 쿨다운 밖으로 되돌린다(시간 경과 시뮬레이션).
    await prisma.guardian_link_event.updateMany({
      where: { link_id: link.id },
      data: { created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    const notifs = () =>
      prisma.notification.count({
        where: { recipient_id: student.id, type: 'guardian_link_requested' },
      });
    const before = await notifs();

    const revived = await svc.requestLink(guardian, {
      studentLoginId,
      relation: '모',
    });

    // @@unique(guardian_id, student_id) 때문에 새 행이 아니라 **같은 행**이 되살아나야 한다.
    expect(revived.id).toBe(link.id);
    expect(revived.status).toBe('pending');
    expect(await notifs()).toBe(before + 1); // 학생이 다시 승인해야 하므로 알림 재발송
    const ev = await prisma.guardian_link_event.findFirst({
      where: { link_id: link.id, to_status: 'pending', from_status: 'revoked' },
      orderBy: { created_at: 'desc' },
    });
    expect(ev?.reason).toBe('relink');
    // 부활은 pending 일 뿐 — 학생 승인 전에는 자녀 목록에 나타나지 않는다.
    expect(
      (await svc.listChildren(guardian)).find(
        (c: any) => c.studentId === student.id,
      ),
    ).toBeUndefined();
  });

  it('재신청 3회를 모두 쓰면 자동 경로가 닫히고 관리자 안내로 바뀐다', async () => {
    const [link] = await svc.listLinks(student);
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 쿨다운 밖 — 횟수만으로 막히는지 본다
    await prisma.guardian_student_link.update({
      where: { id: link.id },
      data: { status: 'revoked' },
    });
    await prisma.guardian_link_event.deleteMany({
      where: { link_id: link.id },
    });
    for (let i = 0; i < 3; i++) {
      await prisma.guardian_link_event.create({
        data: {
          link_id: link.id,
          from_status: 'revoked',
          to_status: 'pending',
          actor_id: guardian.id,
          actor_role: 'guardian',
          reason: 'relink',
          created_at: old,
        },
      });
    }
    await prisma.guardian_link_event.create({
      data: {
        link_id: link.id,
        from_status: 'approved',
        to_status: 'revoked',
        actor_id: student.id,
        actor_role: 'student',
        reason: 'respond',
        created_at: old,
      },
    });

    await expect(svc.requestLink(guardian, { studentLoginId })).rejects.toThrow(
      /센터 관리자에게 문의/,
    );
  });

  it('종착 상태 복구는 관리자만 — 학생은 스스로 되돌릴 수 없다', async () => {
    const [link] = await svc.listLinks(student);
    expect(link.status).toBe('revoked');

    // 학생에게 revoked 는 여전히 종착이다(학생의 해제 의사를 학생이 뒤집지 않는다).
    await expect(
      svc.respondLink(link.id, { action: 'approve' }, student),
    ).rejects.toThrow(/허용되지 않는 연결 상태 전이/);

    // 관리자는 쿨다운·횟수와 무관하게 강제 복구할 수 있다(법정대리인 확인 등 오프라인 근거).
    const adminAcc = await prisma.account.findFirstOrThrow({
      where: { login_id: ACCOUNTS.centerAdmin },
      select: { id: true, center_id: true },
    });
    const admin = {
      id: adminAcc.id,
      role: 'admin',
      centerId: adminAcc.center_id,
    };
    const r = await svc.respondLink(
      link.id,
      { action: 'approve' },
      admin as any,
    );
    expect(r.status).toBe('approved');
    const ev = await prisma.guardian_link_event.findFirst({
      where: { link_id: link.id },
      orderBy: { created_at: 'desc' },
    });
    expect(ev?.reason).toBe('admin_override'); // 일반 응답과 구분해 감사에 남는다
  });

  it('relation 은 부/모/기타로 좁혀져 있다 — 이 값이 자녀 승인 카드에 그대로 렌더되므로 자유 텍스트면 문구를 심을 수 있다', async () => {
    const inject = plainToInstance(GuardianLinkRequestDto, {
      studentLoginId,
      relation: '지금 승인하세요! 미승인 시 계정 정지',
    });
    expect(
      (await validate(inject)).some((e) => e.property === 'relation'),
    ).toBe(true);
    for (const ok of ['부', '모', '기타']) {
      expect(
        await validate(
          plainToInstance(GuardianLinkRequestDto, {
            studentLoginId,
            relation: ok,
          }),
        ),
      ).toHaveLength(0);
    }
  });
});
