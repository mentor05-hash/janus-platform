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
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    svc = mod.get(GuardianService);

    const g = await prisma.account.findFirstOrThrow({ where: { login_id: ACCOUNTS.guardian }, select: { id: true, center_id: true } });
    const s = await prisma.account.findFirstOrThrow({ where: { login_id: ACCOUNTS.student }, select: { id: true, center_id: true, login_id: true } });
    guardian = { id: g.id, role: 'guardian', centerId: g.center_id };
    student = { id: s.id, role: 'student', centerId: s.center_id };
    studentLoginId = s.login_id;

    // 이 스펙이 상태를 만들고 되돌린다 — 다른 스위트가 기대하는 기본값은 'approved' 연결 1건이다.
    await prisma.guardian_student_link.deleteMany({ where: { guardian_id: g.id, student_id: s.id } });
  });

  afterAll(async () => {
    // 기본값 복원(approved) — 다른 O105/O106 스위트가 이 연결을 전제한다.
    await prisma.guardian_student_link.upsert({
      where: { guardian_id_student_id: { guardian_id: guardian.id, student_id: student.id } },
      create: { guardian_id: guardian.id, student_id: student.id, relation: '모', status: 'approved', link_method: 'test' },
      update: { status: 'approved' },
    });
    await app.close();
  });

  it('보호자가 자녀 아이디로 연결을 신청하면 pending 으로 생긴다', async () => {
    const link = await svc.requestLink(guardian, { studentLoginId, relation: '모' });
    expect(link.status).toBe('pending');
  });

  it('같은 자녀에 중복 신청은 거절된다', async () => {
    await expect(svc.requestLink(guardian, { studentLoginId })).rejects.toThrow(/이미 연결 신청/);
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
    await expect(svc.respondLink(link.id, { action: 'revoke' }, stranger as any)).rejects.toThrow();
  });

  it('학생이 연결을 해제하면 보호자 자녀 목록에서 사라진다', async () => {
    const [link] = await svc.listLinks(student);
    await svc.respondLink(link.id, { action: 'revoke' }, student);
    const children = await svc.listChildren(guardian);
    expect(children.find((c: any) => c.studentId === student.id)).toBeUndefined();
  });

  /**
   * 아래 2건은 **화면 문구의 근거**다.
   * 모바일 승인 카드는 거절·해제에 '지금은 다시 신청할 수 없어요'라고 말한다 — 그 말이 참인지 여기서 고정한다.
   * (재신청을 허용할지는 정책 결정이라 이 스펙은 현재 계약을 기록할 뿐 옳다고 주장하지 않는다.)
   */
  it('해제된 뒤에는 보호자가 재신청할 수 없다 — 종착 상태라 되돌릴 경로가 없다', async () => {
    await expect(svc.requestLink(guardian, { studentLoginId })).rejects.toThrow(/이미 연결 신청이 존재합니다/);
  });

  it('relation 은 부/모/기타로 좁혀져 있다 — 이 값이 자녀 승인 카드에 그대로 렌더되므로 자유 텍스트면 문구를 심을 수 있다', async () => {
    const inject = plainToInstance(GuardianLinkRequestDto, { studentLoginId, relation: '지금 승인하세요! 미승인 시 계정 정지' });
    expect((await validate(inject)).some((e) => e.property === 'relation')).toBe(true);
    for (const ok of ['부', '모', '기타']) {
      expect(await validate(plainToInstance(GuardianLinkRequestDto, { studentLoginId, relation: ok }))).toHaveLength(0);
    }
  });
});
