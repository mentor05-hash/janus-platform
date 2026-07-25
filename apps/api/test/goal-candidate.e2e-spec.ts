import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ScoresService } from '../src/modules/scores/scores.service';

/**
 * 목표 후보 — 등록·중복차단·상한·밴드 비교·회차 변동 폭·소유권·삭제.
 * 후보는 학생이 직접 등록한 것만 다룬다(자동 제안·조합 추천은 범위 밖). gap-report 정본을 순수 호출해 비교한다.
 */
/** 이 스펙이 시드하는 회차의 period 접두 — 정리 대상 식별용(데모 회차는 건드리지 않는다). */
const SEED_PREFIX = '2100-O108검증-';

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

    // 누백 이력을 **이 스펙이 직접 시드**한다 — 데모 시드에 의존하면 다른 세션의 검증 잔여물(누백 없는 최신 회차)에
    // 최신 선정이 가려져 NO_NB 로 무너진다. period 는 문자열 정렬이라 기존 회차보다 뒤에 오게 두고 afterAll 에서 지운다.
    // 값 선정: 최신 2.4(기존 밴드 기대치 유지) · best 1.9 · worst 3.1 → 컷 3.2/2.4/1.5 에서 각각 다르게 뒤집힌다.
    await prisma.score_report.deleteMany({ where: { student_id: acc.id, period: { startsWith: SEED_PREFIX } } });
    for (const [i, nb] of [1.9, 3.1, 2.4].entries()) {
      await prisma.score_report.create({
        data: {
          student_id: acc.id, center_id: acc.center_id, period: `${SEED_PREFIX}${i + 1}`,
          exam_type: '수능/모의', source: 'self', created_by: acc.id,
          placement: { nb, gye: '이과' },
        },
      });
    }
  });
  afterAll(async () => {
    await prisma.student_goal_candidate.deleteMany({ where: { student_id: student.id } });
    await prisma.score_report.deleteMany({ where: { student_id: student.id, period: { startsWith: SEED_PREFIX } } });
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

  describe('후보별 회차 변동성(O108)', () => {
    it('후보 행에는 컷 종속 3키만 — 범위·표본·문장을 3중복으로 싣지 않는다', async () => {
      const rep = await scores.goalCandidateReport(student, 'jeongsi');
      for (const c of rep.candidates) {
        if (c.volatility === null) continue; // 이력 2회 미만
        expect(Object.keys(c.volatility).sort()).toEqual(['bestBand', 'consistent', 'worstBand']);
        // 후보 불변값(범위·표본 수·문장)은 목록 레벨이 1회 담당한다 — admitProbHint 와 같은 처리.
        for (const k of ['count', 'best', 'worst', 'spread', 'smallSample', 'message']) {
          expect(k in (c.volatility as Record<string, unknown>)).toBe(false);
        }
      }
    });

    it('점 판정(band)은 [bestBand, worstBand] 범위 안에 있다 — 창과 최신 회차가 어긋나면 깨진다', async () => {
      const rep = await scores.goalCandidateReport(student, 'jeongsi');
      const ORDER = ['안정', '적정', '소신', '상향'];
      for (const c of rep.candidates) {
        if (!c.volatility) continue;
        const [lo, hi, pt] = [c.volatility.bestBand, c.volatility.worstBand, c.band].map((b) => ORDER.indexOf(b));
        expect(pt).toBeGreaterThanOrEqual(lo);
        expect(pt).toBeLessThanOrEqual(hi);
      }
    });

    it('목록 레벨 통계는 후보 판정과 같은 창에서 나온다(헤더 범위 ↔ 후보 뒤집힘 정합)', async () => {
      const rep = await scores.goalCandidateReport(student, 'jeongsi');
      expect(rep.sortKey).toBe('delta');
      // spread 유무와 volatility 유무는 같은 recent 배열에서 파생되므로 항상 동시에 존재/부재한다.
      const anyVol = rep.candidates.some((c) => c.volatility !== null);
      expect(anyVol).toBe(rep.spread !== null);
      if (rep.spread) {
        expect(rep.smallSample).toBe(rep.spread.count < 3);
        expect(rep.flipCount).toBe(rep.candidates.filter((c) => c.volatility && !c.volatility.consistent).length);
      }
    });

    it('뒤집힘은 컷마다 다르다 — 전역 spread 로 답할 수 없다는 존재 근거', async () => {
      const rep = await scores.goalCandidateReport(student, 'jeongsi');
      // 시드 이력 1.9~3.1 · 컷 3.2/2.4/1.5 → 안정~적정 / 안정~상향 / 소신~상향 (전부 다른 조합)
      // count 는 데모 회차가 함께 잡혀 환경마다 다르므로 단정하지 않는다 — 판정을 좌우하는 best/worst 만 고정.
      expect(rep.spread!.best).toBe(1.9);
      expect(rep.spread!.worst).toBe(3.1);
      expect(rep.spread!.spread).toBe(1.2);
      expect(rep.spread!.count).toBeGreaterThanOrEqual(3);
      expect(rep.smallSample).toBe(false);
      const shapes = rep.candidates.map((c) => `${c.volatility!.bestBand}~${c.volatility!.worstBand}`);
      expect(shapes).toEqual(['안정~적정', '안정~상향', '소신~상향']);
      // 하나의 전역 범위(1.9~3.1)에서 후보마다 다른 판정이 나온다 = 컷 종속. 전역 분포만으로는 이 정보를 만들 수 없다.
      expect(new Set(shapes).size).toBe(3);
      expect(rep.flipCount).toBe(3);
    });

    it('수시는 volatility 전부 null + 사유 문장 — 침묵하면 "수시가 더 확실하다"로 오독된다', async () => {
      // 상한은 모드별이므로 수시 후보를 따로 담아 '후보가 0개라 통과'하는 공허한 검증을 피한다.
      await scores.addGoalCandidate(student, { mode: 'susi', univ: '수시검증대', dept: '내신과', cut: 2.0 });
      const rep = await scores.goalCandidateReport(student, 'susi', 2.5);
      expect(rep.candidates.length).toBeGreaterThan(0);
      expect(rep.spread).toBeNull();
      expect(rep.flipCount).toBe(0);
      expect(rep.volatilityNote).toContain('회차 이력이 없어');
      // 누백(정시 단위) 이력이 등급 판정에 섞이면 재앙 — 단위가 다르다.
      expect(rep.candidates.every((c) => c.volatility === null)).toBe(true);
    });
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
