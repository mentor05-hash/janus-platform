import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PeopleService } from '../src/modules/people/people.service';

/**
 * 미구현 구현(SC-12): §5-7 랭킹 가중치 — 교사 취소 누적이 검색 순위를 낮춘다.
 * 평점이 더 높아도 취소가 많으면(유효평점 하락) 아래로 정렬.
 */
const SUBJ = '랭크테스트';
const TA = '00000000-0000-4000-8000-0000000ab001'; // 취소 0, 평점 4.0
const TB = '00000000-0000-4000-8000-0000000ab002'; // 취소 5, 평점 4.5(유효 3.5)
const C1 = '00000000-0000-4000-8000-0000000000c1';

describe('랭킹 가중치(§5-7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let people: PeopleService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    people = mod.get(PeopleService);
    const pw = (await prisma.account.findUnique({ where: { login_id: 'student01' } }))!.pw_hash;
    for (const [id, ln] of [[TA, 'rank_ta'], [TB, 'rank_tb']] as const) {
      await prisma.account.upsert({ where: { id }, update: {}, create: { id, role: 'teacher' as any, center_id: C1, login_id: ln, pw_hash: pw, name: ln, status: 'approved' as any } });
    }
    await prisma.teacher_profile.upsert({ where: { account_id: TA }, update: { rating: 4.0, cancel_count: 0, subjects: [SUBJ] }, create: { account_id: TA, center_id: C1, subjects: [SUBJ], grade: 'A' as any, rating: 4.0, cancel_count: 0 } });
    await prisma.teacher_profile.upsert({ where: { account_id: TB }, update: { rating: 4.5, cancel_count: 5, subjects: [SUBJ] }, create: { account_id: TB, center_id: C1, subjects: [SUBJ], grade: 'A' as any, rating: 4.5, cancel_count: 5 } });
  });

  afterAll(async () => {
    await prisma.teacher_profile.deleteMany({ where: { account_id: { in: [TA, TB] } } });
    await prisma.account.deleteMany({ where: { id: { in: [TA, TB] } } });
    await app.close();
  });

  it('취소 누적 교사는 평점 높아도 아래로 정렬', async () => {
    const r = await people.listTeachers({ subject: SUBJ, page: 1, size: 10 } as any);
    const ids = r.data.map((t: any) => t.id);
    expect(ids).toEqual([TA, TB]); // TA(유효4.0) > TB(유효3.5)
  });
});
