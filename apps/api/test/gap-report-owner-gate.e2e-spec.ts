import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ScoresService } from '../src/modules/scores/scores.service';

/**
 * POST /scores/gap-report 대상 학생 게이트 — IDOR 회귀 고정.
 *
 * 무엇이 깨져 있었나: janusScore 는 **학생 액터에게 studentId 를 조용히 무시**한다(예외 없음).
 * 그래서 게이트를 통과한 것처럼 보이는데 이력 조회(recentNbValues)·적재(archiveReport)는
 * opts.studentId 를 그대로 써서 ①타인의 누백 이력 통계를 volatility 로 되받고 ②타인 이력에 행을 썼다.
 * 보호자는 승인 연결만 확인해 O105 연령별 동의 게이트를 '새로 생성'으로 우회할 수 있었다
 * (listChildReports 는 막히는데 gapReport 는 열려 있던 비대칭).
 */
describe('격차 리포트 대상 게이트(IDOR)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scores: ScoresService;
  let attacker: any;
  let victimId: string;
  let guardian: any;

  const REQ = { mode: 'susi' as const, univ: '침해검증대', dept: '침해과', cut: 2.0, myGrade: 2.5 };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    scores = mod.get(ScoresService);

    const a = await prisma.account.findFirstOrThrow({ where: { login_id: 'student01' }, select: { id: true, center_id: true } });
    attacker = { id: a.id, role: 'student', centerId: a.center_id };
    // 피해자 = 공격자가 아닌 다른 학생 계정
    const v = await prisma.account.findFirstOrThrow({ where: { role: 'student', id: { not: a.id } }, select: { id: true } });
    victimId = v.id;
    const g = await prisma.account.findFirstOrThrow({ where: { login_id: 'guardian01' }, select: { id: true, center_id: true } });
    guardian = { id: g.id, role: 'guardian', centerId: g.center_id };

    await prisma.janus_report.deleteMany({ where: { student_id: { in: [a.id, victimId] } } });
  });

  afterAll(async () => {
    await prisma.janus_report.deleteMany({ where: { student_id: { in: [attacker.id, victimId] } } });
    await app.close();
  });

  const victimRows = () => prisma.janus_report.count({ where: { student_id: victimId } });

  it('학생이 타인 studentId 를 보내면 403 — 조용히 무시하지 않는다', async () => {
    await expect(scores.gapReport(attacker, { ...REQ, studentId: victimId })).rejects.toThrow(/본인 리포트만/);
  });

  it('타인 이력에 행이 쓰이지 않는다(쓰기 IDOR)', async () => {
    const before = await victimRows();
    await scores.gapReport(attacker, { ...REQ, studentId: victimId }).catch(() => {});
    expect(await victimRows()).toBe(before);
  });

  it('타인 누백 이력 통계(volatility)가 새어 나가지 않는다(읽기 IDOR)', async () => {
    // 정시 경로가 recentNbValues(studentId) 를 쓰던 지점 — 거절되어야 한다.
    await expect(
      scores.gapReport(attacker, { mode: 'jeongsi', univ: '침해검증대', dept: '침해과', cut: 2.0, studentId: victimId }),
    ).rejects.toThrow(/본인 리포트만/);
  });

  it('본인 id 를 명시해 보내는 것은 허용(정상 경로 유지)', async () => {
    const r = await scores.gapReport(attacker, { ...REQ, studentId: attacker.id });
    expect(r.kind).toBe('gap');
    expect(await prisma.janus_report.count({ where: { student_id: attacker.id } })).toBeGreaterThan(0);
  });

  it('보호자는 승인 연결만으로는 부족 — O105 동의 게이트를 통과해야 한다', async () => {
    // 동의 상태를 만들지 않은 상태에서는 이력 조회(listChildReports)와 **같은 이유로** 거절돼야 한다.
    // (게이트가 열려 있으면 '이력은 못 보는데 새로 생성은 되는' 비대칭이 된다.)
    const link = await prisma.guardian_student_link.findFirst({
      where: { guardian_id: guardian.id, status: 'approved' }, select: { student_id: true },
    });
    if (!link) return; // 데모에 승인 연결이 없으면 이 케이스 대상 아님
    const listErr = await scores.listChildReports(guardian, link.student_id).then(() => null, (e) => e);
    const genErr = await scores.gapReport(guardian, { ...REQ, studentId: link.student_id }).then(() => null, (e) => e);
    // 둘 다 통과하거나 둘 다 막혀야 한다 — 한쪽만 열려 있으면 우회 경로다.
    expect(!!listErr).toBe(!!genErr);
  });

  it('보호자가 studentId 없이 호출하면 400', async () => {
    await expect(scores.gapReport(guardian, REQ)).rejects.toThrow();
  });

  it('학생·보호자 외 역할은 403', async () => {
    const teacher = { ...attacker, role: 'teacher' };
    await expect(scores.gapReport(teacher, REQ)).rejects.toThrow(/학생·학부모만/);
  });
});
