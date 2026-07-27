import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { GuardianPlanService } from '../src/modules/guardian-plan/guardian-plan.service';
import { GuardianConsentService } from '../src/modules/guardian-consent/guardian-consent.service';

/**
 * 학부모 계획 트랙(O106) — 별도 트랙 + 제안 전달.
 * 핵심 불변식: **수락 전에는 student_task 가 생기지 않는다**(⑤-2 재동기화·톰스톤 로직과 격리).
 * 연령 권한(O105): 미성년=제안 자유 / 성인=학생 공유 동의 필요.
 */
describe('학부모 계획 트랙', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let plan: GuardianPlanService;
  let consent: GuardianConsentService;
  let student: any;
  let guardian: any;
  let prevIsMinor: boolean | null = null;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    plan = mod.get(GuardianPlanService);
    consent = mod.get(GuardianConsentService);
    const s = await prisma.account.findFirstOrThrow({
      where: { login_id: 'student01' },
      select: { id: true, center_id: true },
    });
    const g = await prisma.account.findFirstOrThrow({
      where: { login_id: 'guardian01' },
      select: { id: true, center_id: true },
    });
    student = { id: s.id, role: 'student', centerId: s.center_id };
    guardian = { id: g.id, role: 'guardian', centerId: g.center_id };
    // 승인된 연결을 **이 스펙이 보장**한다 — guardian.e2e-spec 이 afterAll 에서 링크를 지우고 복원하지 않아
    // 전체 e2e 순서에 따라 이 스위트가 통째로 무너졌다(데모 시드에도 링크가 없다).
    await prisma.guardian_student_link.upsert({
      where: {
        guardian_id_student_id: { guardian_id: g.id, student_id: s.id },
      },
      create: {
        guardian_id: g.id,
        student_id: s.id,
        relation: '모',
        status: 'approved',
        link_method: 'test',
      },
      update: { status: 'approved' },
    });

    const uc = await prisma.user_consent.findUnique({
      where: { account_id: s.id },
      select: { is_minor: true },
    });
    prevIsMinor = uc?.is_minor ?? null;
    await prisma.guardian_plan_item.deleteMany({ where: { student_id: s.id } });
    await prisma.student_task.deleteMany({
      where: { student_id: s.id, created_by: 'guardian' },
    });
    await prisma.student_share_consent.deleteMany({
      where: { student_id: s.id },
    });
  });

  afterAll(async () => {
    await prisma.guardian_plan_item.deleteMany({
      where: { student_id: student.id },
    });
    await prisma.student_task.deleteMany({
      where: { student_id: student.id, created_by: 'guardian' },
    });
    await prisma.student_share_consent.deleteMany({
      where: { student_id: student.id },
    });
    if (prevIsMinor !== null)
      await prisma.user_consent.update({
        where: { account_id: student.id },
        data: { is_minor: prevIsMinor },
      });
    await app.close();
  });

  const setMinor = (v: boolean) =>
    prisma.user_consent.upsert({
      where: { account_id: student.id },
      create: {
        account_id: student.id,
        terms_version: 'v1',
        privacy_version: 'v1',
        is_minor: v,
      },
      update: { is_minor: v },
    });

  const guardianTasks = () =>
    prisma.student_task.findMany({
      where: { student_id: student.id, created_by: 'guardian' },
    });

  it('학부모가 자기 트랙에 계획 추가(draft) — 학생 인박스·할 일에는 아직 없다', async () => {
    const item = await plan.create(guardian, student.id, {
      title: '수학 오답노트 매일 20분',
      subject: '수학',
    });
    expect(item.status).toBe('draft');
    expect(await plan.myProposals(student)).toHaveLength(0); // 제안 전이라 학생에게 안 보임
    expect(await guardianTasks()).toHaveLength(0); // task 도 없음
  });

  it('draft 는 수정 가능', async () => {
    const [item] = await plan.list(guardian, student.id);
    const upd = await plan.update(guardian, item.id, {
      title: '수학 오답노트 매일 30분',
      subject: '수학',
    });
    expect(upd.title).toContain('30분');
  });

  it('미성년 자녀 → 학생 동의 없이도 제안 가능(보호자 권한)', async () => {
    await setMinor(true);
    const [item] = await plan.list(guardian, student.id);
    const p = await plan.propose(guardian, item.id);
    expect(p.status).toBe('proposed');
    expect(p.proposed_at).not.toBeNull();
    const props = await plan.myProposals(student);
    expect(props).toHaveLength(1);
    expect(props[0].title).toContain('30분');
    expect(await guardianTasks()).toHaveLength(0); // **수락 전에는 task 없음**
  });

  it('제안한 항목은 수정 불가(학생이 본 내용과 달라지지 않게)', async () => {
    const [item] = await plan.list(guardian, student.id);
    await expect(
      plan.update(guardian, item.id, { title: '몰래 바꾸기' }),
    ).rejects.toThrow();
  });

  it('학생 수락 → 내 할 일 생성(created_by=guardian)·상태 accepted', async () => {
    const [prop] = await plan.myProposals(student);
    const r = await plan.accept(student, prop.id);
    expect(r.accepted).toBe(true);
    const tasks = await guardianTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toContain('30분');
    expect(tasks[0].created_by).toBe('guardian'); // 출처 구분(auto/self 와 다름)
    const [item] = await plan.list(guardian, student.id);
    expect(item.status).toBe('accepted');
    expect(item.student_task_id).toBe(tasks[0].id);
    expect(await plan.myProposals(student)).toHaveLength(0); // 대기 목록에서 빠짐
  });

  it('수락을 동시에 두 번 눌러도 할 일이 하나만 생긴다(이중 탭 방어)', async () => {
    const item = await plan.create(guardian, student.id, {
      title: '이중탭 방어 검증',
    });
    await plan.propose(guardian, item.id);
    const before = (await guardianTasks()).length;
    // 동시 실행 — 원자적 claim 이 없으면 둘 다 통과해 할 일이 2건 생긴다(모바일 이중 탭 실측 재현).
    const results = await Promise.allSettled([
      plan.accept(student, item.id),
      plan.accept(student, item.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await guardianTasks()).length).toBe(before + 1); // 정확히 1건만 증가
  });

  it('이미 응답한 제안은 재응답 불가', async () => {
    const [item] = await plan.list(guardian, student.id);
    await expect(plan.accept(student, item.id)).rejects.toThrow();
  });

  it('학생 거절 → 할 일 만들지 않고 declined 로 남는다', async () => {
    const item = await plan.create(guardian, student.id, {
      title: '거절될 계획',
    });
    await plan.propose(guardian, item.id);
    const before = (await guardianTasks()).length;
    const r = await plan.decline(student, item.id);
    expect(r.declined).toBe(true);
    expect((await guardianTasks()).length).toBe(before); // task 증가 없음
    const rows = await plan.list(guardian, student.id);
    expect(rows.find((x) => x.id === item.id)?.status).toBe('declined');
  });

  it('성인 자녀 → 학생 공유 동의가 없으면 제안 불가', async () => {
    await setMinor(false);
    await prisma.student_share_consent.deleteMany({
      where: { student_id: student.id },
    });
    const item = await plan.create(guardian, student.id, {
      title: '성인 자녀 제안 시도',
    });
    await expect(plan.propose(guardian, item.id)).rejects.toThrow();
    expect(
      (await plan.list(guardian, student.id)).find((x) => x.id === item.id)
        ?.status,
    ).toBe('draft');
  });

  it('성인 자녀 → 학생이 동의하면 제안 가능', async () => {
    await consent.grantShare(student, guardian.id);
    const item = (await plan.list(guardian, student.id)).find(
      (x) => x.status === 'draft',
    )!;
    const p = await plan.propose(guardian, item.id);
    expect(p.status).toBe('proposed');
  });

  it('타인 계획은 수정·삭제 불가(소유권)', async () => {
    const [item] = await plan.list(guardian, student.id);
    const other = { ...guardian, id: '00000000-0000-4000-8000-0000000000fc' };
    await expect(plan.remove(other as any, item.id)).rejects.toThrow();
  });

  it('내게 오지 않은 제안은 응답 불가', async () => {
    const props = await plan.myProposals(student);
    if (props.length) {
      const stranger = {
        ...student,
        id: '00000000-0000-4000-8000-0000000000fb',
      };
      await expect(plan.accept(stranger as any, props[0].id)).rejects.toThrow();
    }
  });

  it('학부모가 계획을 삭제해도 학생이 수락한 할 일은 남는다(학생 소유)', async () => {
    const accepted = (await plan.list(guardian, student.id)).find(
      (x) => x.status === 'accepted',
    )!;
    const taskId = accepted.student_task_id!;
    await plan.remove(guardian, accepted.id);
    const task = await prisma.student_task.findUnique({
      where: { id: taskId },
    });
    expect(task).not.toBeNull(); // FK SET NULL — 할 일은 보존
  });
});
