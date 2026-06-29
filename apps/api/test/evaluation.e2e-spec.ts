import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EvaluationService } from '../src/modules/evaluation/evaluation.service';

/**
 * 3.2 DoD 통합테스트 (실 DB):
 *  - 분류(§5-9): fit 분류·제거, 반대 목록 동시 분류 차단.
 *  - 리뷰: 완료 상담 평가 → 교사 평점·등급 재산정. 비완료/중복 차단.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const STU_E = '00000000-0000-4000-8000-0000000000e9';
const TEA_E = '00000000-0000-4000-8000-0000000000ea';
const studentUser: any = { id: STU_E, role: 'student', centerId: CENTER, loginId: 'eval_s' };

describe('3.2 평가·분류·랭킹 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let evalService: EvaluationService;

  async function cleanup() {
    await prisma.booking.deleteMany({ where: { teacher_id: TEA_E } }); // cascade review
    await prisma.teacher_list_entry.deleteMany({ where: { student_id: STU_E } });
    await prisma.account.deleteMany({ where: { id: { in: [STU_E, TEA_E] } } }); // cascade profiles/grade
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    evalService = mod.get(EvaluationService);
    await cleanup();
    await prisma.account.create({ data: { id: STU_E, role: 'student' as any, center_id: CENTER, login_id: 'eval_s', pw_hash: 'x', name: 's', status: 'approved' as any } });
    await prisma.student_profile.create({ data: { account_id: STU_E, center_id: CENTER } });
    await prisma.account.create({ data: { id: TEA_E, role: 'teacher' as any, center_id: CENTER, login_id: 'eval_t', pw_hash: 'x', name: 't', status: 'approved' as any } });
    await prisma.teacher_profile.create({ data: { account_id: TEA_E, center_id: CENTER, grade: 'B' as any } });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('분류: fit 추가 → 반대(unfit) 동시 분류 차단 → 제거 후 재분류(§5-9)', async () => {
    await evalService.classify(studentUser, { teacherId: TEA_E, listKind: 'fit' });
    let lists = await evalService.myLists(studentUser);
    expect(lists.fit).toContain(TEA_E);

    await expect(evalService.classify(studentUser, { teacherId: TEA_E, listKind: 'unfit' })).rejects.toThrow();

    await evalService.removeClassification(studentUser, TEA_E);
    await evalService.classify(studentUser, { teacherId: TEA_E, listKind: 'unfit' });
    lists = await evalService.myLists(studentUser);
    expect(lists.unfit).toContain(TEA_E);
    expect(lists.fit).not.toContain(TEA_E);
  });

  it('리뷰: 완료 상담 평가 → 평점·등급 재산정', async () => {
    const b = await prisma.booking.create({
      data: { student_id: STU_E, teacher_id: TEA_E, center_id: CENTER, consult_type: 'subject' as any, mode: 'zoom' as any, status: 'done' as any },
    });
    const res: any = await evalService.review(
      b.id,
      { ratingAttitude: 4, ratingContent: 4, ratingSkill: 5, ratingAgain: 4 },
      studentUser,
    );
    expect(res.reviewCount).toBe(1);
    expect(res.rating).toBe(4.3); // avg(4,4,5,4)=4.25 → 4.3
    expect(res.grade).toBe('A'); // 4.0 이상

    const tp = await prisma.teacher_profile.findUnique({ where: { account_id: TEA_E } });
    expect(Number(tp!.rating)).toBe(4.3);
    expect(tp!.grade).toBe('A');

    // 중복 평가 차단
    await expect(
      evalService.review(b.id, { ratingAttitude: 1, ratingContent: 1, ratingSkill: 1, ratingAgain: 1 }, studentUser),
    ).rejects.toThrow();
  });

  it('리뷰: 비완료 상담은 평가 불가', async () => {
    const b = await prisma.booking.create({
      data: { student_id: STU_E, teacher_id: TEA_E, center_id: CENTER, consult_type: 'subject' as any, mode: 'zoom' as any, status: 'confirmed' as any },
    });
    await expect(
      evalService.review(b.id, { ratingAttitude: 5, ratingContent: 5, ratingSkill: 5, ratingAgain: 5 }, studentUser),
    ).rejects.toThrow();
  });
});
