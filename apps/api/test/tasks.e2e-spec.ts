import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TasksService } from '../src/modules/tasks/tasks.service';
import { ScoresService } from '../src/modules/scores/scores.service';

/** 맞춤 할 일: 수동 CRUD·상태·삭제(멱등 제안은 데이터 의존이라 throw 없음만 확인). */
const TAG = '[E2E-TASK]';

describe('맞춤 할 일(tasks)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: TasksService;
  let student: any;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    svc = mod.get(TasksService);
    const acc = await prisma.account.findFirstOrThrow({ where: { login_id: 'student01' }, select: { id: true, center_id: true } });
    student = { id: acc.id, role: 'student', centerId: acc.center_id };
    await prisma.student_task.deleteMany({ where: { title: { startsWith: TAG }, student_id: acc.id } });
  });
  afterAll(async () => {
    await prisma.student_task.deleteMany({ where: { title: { startsWith: TAG } } });
    await app.close();
  });

  it('list 는 제안 생성 후 반환(throw 없음)', async () => {
    const list = await svc.list(student);
    expect(Array.isArray(list)).toBe(true);
  });

  it('수동 추가 → 목록 포함(todo)', async () => {
    const t = await svc.create(student, { title: `${TAG} 오답노트` });
    expect(t.status).toBe('todo');
    const list = await svc.list(student);
    expect(list.find((x) => x.id === t.id)?.title).toBe(`${TAG} 오답노트`);
  });

  it('완료 처리 → done + done_at', async () => {
    const t = await svc.create(student, { title: `${TAG} 완료대상` });
    const upd = await svc.setStatus(student, t.id, 'done');
    expect(upd.status).toBe('done');
    expect(upd.done_at).not.toBeNull();
  });

  it('수동 항목 삭제', async () => {
    const t = await svc.create(student, { title: `${TAG} 삭제대상` });
    const r = await svc.remove(student, t.id);
    expect((r as { deleted?: boolean }).deleted).toBe(true);
    const list = await svc.list(student);
    expect(list.find((x) => x.id === t.id)).toBeUndefined();
  });

  it('due_date 임박 리마인더 조회(throw 없음)', async () => {
    const n = await svc.runReminders();
    expect(typeof n).toBe('number');
  });

  // ⑤-4 자가목표 ↔ ⑤-2 격차 제안 사슬. 목표 변경 시 낡은 gap 항목이 갱신·회수되는지까지 검증.
  describe('자가목표 → 격차 제안 자동생성·재조정', () => {
    const REPORT_ID = 'ffffffff-0000-4000-8000-00000000ee01';
    let scores: ScoresService;
    let prevGoal: { tier: string | null; avg: number | null } = { tier: null, avg: null };

    const gapOf = async () => (await svc.list(student)).filter((t) => t.category === 'gap');

    beforeAll(async () => {
      scores = app.get(ScoresService);
      const sp = await prisma.student_profile.findUniqueOrThrow({ where: { account_id: student.id }, select: { goal_tier: true, goal_avg: true } });
      prevGoal = { tier: sp.goal_tier, avg: sp.goal_avg };
      // 원점수 회차를 최신으로 심는다(누백 모드는 과목 점수가 없어 격차 계산 대상이 아님).
      await prisma.score_report.create({
        data: {
          id: REPORT_ID, student_id: student.id, period: '9999-격차사슬', exam_type: '내신', source: 'manual',
          items: { create: [{ subject: '수학', score: 62 }, { subject: '영어', score: 88 }, { subject: '국어', score: 95 }] },
        },
      });
    });

    afterAll(async () => {
      await prisma.student_task.deleteMany({ where: { student_id: student.id, created_by: 'auto', category: 'gap' } });
      await prisma.score_item.deleteMany({ where: { report_id: REPORT_ID } });
      await prisma.score_report.deleteMany({ where: { id: REPORT_ID } });
      await scores.setMyGoal(student, prevGoal); // 원상복구
    });

    it('목표 설정 → 미달 과목만 gap 제안(목표 초과 과목 제외) + 재조회 멱등', async () => {
      await scores.setMyGoal(student, { avg: 90 });
      const g1 = await gapOf();
      expect(g1.map((t) => t.source_key).sort()).toEqual(['gap:수학', 'gap:영어']); // 국어 95 ≥ 90 → 제외
      expect(g1.find((t) => t.source_key === 'gap:수학')?.title).toContain('28');
      const g2 = await gapOf();
      expect(g2.length).toBe(g1.length); // 멱등 — 재조회로 중복 생성 없음
    });

    it('목표를 낮추면 제목이 갱신되고 격차가 사라진 과목은 회수된다', async () => {
      await scores.setMyGoal(student, { avg: 70 });
      const g = await gapOf();
      expect(g.map((t) => t.source_key)).toEqual(['gap:수학']); // 영어 88 ≥ 70 → 회수
      expect(g[0].title).toContain('8'); // 70 - 62 = 8
    });

    it('목표를 해제하면 자동 gap 제안이 전부 회수된다', async () => {
      await scores.setMyGoal(student, {});
      expect(await gapOf()).toHaveLength(0);
    });
  });
});
