import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TasksService } from '../src/modules/tasks/tasks.service';

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
});
