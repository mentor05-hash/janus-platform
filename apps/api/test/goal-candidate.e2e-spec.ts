import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ScoresService } from '../src/modules/scores/scores.service';

/**
 * 목표 후보 — 등록·중복차단·상한·밴드 비교·회차 변동 폭·소유권·삭제.
 * 후보는 학생이 직접 등록한 것만 다룬다(자동 제안·조합 추천은 범위 밖). gap-report 정본을 순수 호출해 비교한다.
 */
describe('목표 후보(goal candidates)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scores: ScoresService;
  let student: any;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    scores = mod.get(ScoresService);
    const acc = await prisma.account.findFirstOrThrow({ where: { login_id: 'student01' }, select: { id: true, center_id: true } });
    student = { id: acc.id, role: 'student', centerId: acc.center_id };
    await prisma.student_goal_candidate.deleteMany({ where: { student_id: acc.id } });
  });
  afterAll(async () => {
    await prisma.student_goal_candidate.deleteMany({ where: { student_id: student.id } });
    await app.close();
  });

  const cand = (univ: string, dept: string, cut: number) => ({ mode: 'jeongsi' as const, univ, dept, cut });

  it('후보 등록 → 목록에 포함', async () => {
    const c = await scores.addGoalCandidate(student, cand('가온대', '소프트웨어', 1.5));
    expect(c.cut).toBe(1.5);
    const list = await scores.listGoalCandidates(student, 'jeongsi');
    expect(list.map((x) => x.univ)).toContain('가온대');
  });

  it('같은 대학·학과 중복 등록은 400', async () => {
    await expect(scores.addGoalCandidate(student, cand('가온대', '소프트웨어', 1.9))).rejects.toThrow();
  });

  it('상한(3개) 초과 등록은 400', async () => {
    await scores.addGoalCandidate(student, cand('나래대', '데이터과학', 2.4));
    await scores.addGoalCandidate(student, cand('다솜대', '컴퓨터공학', 3.2));
    await expect(scores.addGoalCandidate(student, cand('벼리대', '전자공학', 2.0))).rejects.toThrow();
  });

  it('후보별 밴드 비교 — 격차 작은 순(안정→상향) 정렬, 근거는 1회만', async () => {
    const rep = await scores.goalCandidateReport(student, 'jeongsi');
    expect(rep.candidates).toHaveLength(3);
    // 내 누백(2.4 데모) 기준: cut 3.2=안정 / 2.4=적정 / 1.5=상향
    expect(rep.candidates.map((c) => c.band)).toEqual(['안정', '적정', '상향']);
    // delta 오름차순 정렬 보장
    const deltas = rep.candidates.map((c) => c.delta);
    expect([...deltas].sort((a, b) => a - b)).toEqual(deltas);
    // evidence 는 후보마다 중복하지 않고 공통 1세트
    expect(rep.evidence.length).toBeGreaterThan(0);
    expect(rep.disclaimer).toContain('보장하지 않습니다');
    // 합격률 힌트는 후보 카드에 싣지 않는다(인접 후보 동일 37% 오독 방지) — 목록 수준 1회 안내만.
    expect(rep.candidates.every((c) => !('admitProbHint' in c))).toBe(true);
    if (rep.admitHintNote) expect(rep.admitHintNote).toContain('개별 학과 합격률이 아닙니다');
  });

  it('회차 변동 폭 — 누백 이력 2회 이상이면 분포 제공(1회성 시험 편차 근거)', async () => {
    const rep = await scores.goalCandidateReport(student, 'jeongsi');
    if (rep.spread) {
      expect(rep.spread.count).toBeGreaterThanOrEqual(2);
      expect(rep.spread.best).toBeLessThanOrEqual(rep.spread.worst); // 누백은 낮을수록 상위
      expect(rep.spread.spread).toBeCloseTo(rep.spread.worst - rep.spread.best, 2);
    } else {
      expect(rep.spread).toBeNull(); // 이력 2회 미만
    }
  });

  it('타인 후보는 삭제 불가(소유권)', async () => {
    const list = await scores.listGoalCandidates(student, 'jeongsi');
    const other = { ...student, id: '00000000-0000-4000-8000-0000000000ff' };
    await expect(scores.removeGoalCandidate(other, list[0].id)).rejects.toThrow();
  });

  it('후보 삭제', async () => {
    const list = await scores.listGoalCandidates(student, 'jeongsi');
    const r = await scores.removeGoalCandidate(student, list[0].id);
    expect(r.deleted).toBe(true);
    const after = await scores.listGoalCandidates(student, 'jeongsi');
    expect(after.find((x) => x.id === list[0].id)).toBeUndefined();
  });
});
