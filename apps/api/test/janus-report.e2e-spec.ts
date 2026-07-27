import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ScoresService } from '../src/modules/scores/scores.service';

/**
 * janus_report 이력(append-only) — 격차 리포트 산출 시 적재·동일산출 skip·최신순 조회.
 * payload 는 트렁크 JanusReport 봉투(누백/등급·target·band)이며 B 의 avg payload 가 아니다(O102).
 */
describe('janus_report 이력', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scores: ScoresService;
  let student: any;

  const target = { univ: '이력검증대', dept: '테스트학과', cut: 2.0 };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    scores = mod.get(ScoresService);
    const acc = await prisma.account.findFirstOrThrow({
      where: { login_id: 'student01' },
      select: { id: true, center_id: true },
    });
    student = { id: acc.id, role: 'student', centerId: acc.center_id };
    await prisma.janus_report.deleteMany({ where: { student_id: acc.id } });
  });
  afterAll(async () => {
    await prisma.janus_report.deleteMany({ where: { student_id: student.id } });
    await app.close();
  });

  const rows = () =>
    prisma.janus_report.findMany({
      where: { student_id: student.id, kind: 'gap' },
      orderBy: { created_at: 'desc' },
    });

  it('격차 리포트 산출 → 이력 1건 적재(payload=트렁크 봉투)', async () => {
    const r = await scores.gapReport(student, {
      mode: 'susi',
      ...target,
      myGrade: 2.5,
    });
    expect(r.kind).toBe('gap');
    const list = await rows();
    expect(list).toHaveLength(1);
    const p = list[0].payload as any;
    expect(p.version).toBe('v1'); // 트렁크 봉투(B avg payload 는 version:1 숫자)
    expect(p.target.univ).toBe(target.univ);
    expect(['안정', '적정', '소신', '상향']).toContain(p.gap.band); // 정본 밴드 어휘
    expect(Array.isArray(p.evidence)).toBe(true);
    expect(p.evidence.every((e: any) => !!e.relTier)).toBe(true); // C5: 전건 relTier
  });

  it('같은 산출 재조회 → 중복 적재하지 않음(행 폭증 방지)', async () => {
    await scores.gapReport(student, { mode: 'susi', ...target, myGrade: 2.5 });
    await scores.gapReport(student, { mode: 'susi', ...target, myGrade: 2.5 });
    expect(await rows()).toHaveLength(1);
  });

  it('내 위치가 바뀌면 새 이력 적재', async () => {
    await scores.gapReport(student, { mode: 'susi', ...target, myGrade: 1.4 });
    const list = await rows();
    expect(list).toHaveLength(2);
    expect((list[0].payload as any).generatedFor.value).toBe(1.4); // 최신순
  });

  it('목표가 바뀌면 새 이력 적재', async () => {
    await scores.gapReport(student, {
      mode: 'susi',
      univ: '다른대',
      dept: '다른과',
      cut: 1.2,
      myGrade: 1.4,
    });
    const list = await rows();
    expect(list).toHaveLength(3);
    expect((list[0].payload as any).target.univ).toBe('다른대');
  });

  it('listMyReports — 최신순·본인 것만·limit 상한', async () => {
    const list = await scores.listMyReports(student, 'gap', 2);
    expect(list).toHaveLength(2);
    expect(new Date(list[0].created_at).getTime()).toBeGreaterThanOrEqual(
      new Date(list[1].created_at).getTime(),
    );
    const other = { ...student, id: '00000000-0000-4000-8000-0000000000ff' };
    expect(await scores.listMyReports(other, 'gap')).toHaveLength(0); // 타인 이력 안 보임
  });

  it('이력 적재 실패가 리포트 응답을 막지 않는다(프로필 없는 학생)', async () => {
    const ghost = {
      id: '00000000-0000-4000-8000-0000000000fe',
      role: 'student',
      centerId: student.centerId,
    };
    const r = await scores.gapReport(ghost as any, {
      mode: 'susi',
      ...target,
      myGrade: 3.0,
    });
    expect(r.kind).toBe('gap'); // FK 위반은 삼켜지고 리포트는 정상 반환
  });
});
