import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QnaService } from '../src/modules/qna/qna.service';
import { CreditService } from '../src/modules/billing/credit.service';

/**
 * 3.1 DoD 통합테스트 (실 DB):
 *  - 질문 등록(건당 과금) → 교사 답변 → 학생 채택(pay_eligible).
 *  - §5-9: 학생이 unfit 으로 분류한 교사는 공개 질문 답변 불가.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const STU_Q = '00000000-0000-4000-8000-0000000000e8';

const teacherUser: any = {
  id: TEACHER,
  role: 'teacher',
  centerId: CENTER,
  loginId: 'teacher01',
};
const studentUser: any = {
  id: STU_Q,
  role: 'student',
  centerId: CENTER,
  loginId: 'qna_s',
};

describe('3.1 온라인 Q&A 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let qna: QnaService;
  let credit: CreditService;

  async function cleanup() {
    await prisma.qna_post.deleteMany({ where: { student_id: STU_Q } }); // cascade answers
    await prisma.teacher_list_entry.deleteMany({
      where: { student_id: STU_Q },
    });
    await prisma.payment.deleteMany({ where: { payer_account_id: STU_Q } });
    await prisma.account.deleteMany({ where: { id: STU_Q } });
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    qna = mod.get(QnaService);
    credit = mod.get(CreditService);
    await cleanup();
    await prisma.account.create({
      data: {
        id: STU_Q,
        role: 'student' as any,
        center_id: CENTER,
        login_id: 'qna_s',
        pw_hash: 'x',
        name: 'q',
        status: 'approved' as any,
      },
    });
    await prisma.student_profile.create({
      data: { account_id: STU_Q, center_id: CENTER },
    });
    await prisma.credit_account.create({
      data: { student_id: STU_Q, purchased_balance: 0, granted_balance: 0 },
    });
    await credit.charge(STU_Q, 100_000); // 티어 검증(일반 4,000 + 문항 8,000)까지 여유 있게
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('질문 등록은 무과금(AI 즉답 대기) → 선생님 답변 받기에서 과금 → 답변 → 채택(pay_eligible)', async () => {
    const before = await credit.getAccount(STU_Q);
    const post: any = await qna.createQuestion(studentUser, {
      scope: 'open',
      body: '미적분 질문',
      qType: 'general',
    });
    // AI 즉답 퍼널 도입 후 **등록은 무료**다(status ai_pending · 선생님 비노출).
    // 옛 스펙은 등록 시 4,000 과금을 기대해 실패했다 — 과금이 사라진 게 아니라 **시점이 옮겨졌다**(O113).
    expect(post.chargedCredits).toBe(0);
    expect(post.status).toBe('ai_pending');
    expect((await credit.getAccount(STU_Q)).total).toBe(before.total);

    // 선생님 답변 받기 = 실제 과금 시점.
    const esc: any = await qna.escalateToHuman(studentUser, post.id);
    expect(esc.status).toBe('open');
    expect(esc.chargedCredits).toBeGreaterThan(0); // 요금은 정책값 — 절대값을 박지 않는다
    const after = await credit.getAccount(STU_Q);
    expect(after.total).toBe(before.total - esc.chargedCredits);

    const ans: any = await qna.answer(
      post.id,
      { body: '답변입니다' },
      teacherUser,
    );
    const res: any = await qna.acceptAnswer(ans.id, studentUser);
    expect(res.payEligible).toBe(true);

    const saved = await prisma.qna_answer.findUnique({ where: { id: ans.id } });
    expect(saved!.pay_eligible).toBe(true);
    const p = await prisma.qna_post.findUnique({ where: { id: post.id } });
    expect(p!.status).toBe('resolved');
  });

  it('지정 질문: 존재하지 않는 교사면 과금 전 거부(fix-7)', async () => {
    const before = await credit.getAccount(STU_Q);
    await expect(
      qna.createQuestion(studentUser, {
        scope: 'assigned',
        assignedTeacherId: '00000000-0000-4000-8000-0000000000ff',
        body: 'x',
      }),
    ).rejects.toThrow();
    const after = await credit.getAccount(STU_Q);
    expect(after.total).toBe(before.total); // 과금 없음
  });

  it('Q&A 목록(H2): 보호자 등 비운영 역할은 조회 불가', async () => {
    const guardian: any = {
      id: '00000000-0000-4000-8000-0000000000a5',
      role: 'guardian',
      centerId: CENTER,
    };
    await expect(qna.listPosts(guardian)).rejects.toThrow();
  });

  it('요금 티어: 문항형은 board_item_fee, 일반형은 board_general_fee 로 과금된다', async () => {
    // 이전엔 `qna_post` 에 유형을 저장하지 않고 escalate 가 항상 'general' 로 견적해
    // **학생이 문항형(8,000)을 보고 등록해도 4,000 만 과금**됐다(board_item_fee 도달 불가, O116).
    const policy = await prisma.pricing_policy.findFirstOrThrow({
      where: { mode: 'board' as never, center_id: null, enabled: true },
      select: { board_general_fee: true, board_item_fee: true },
    });
    const genFee = Number(policy.board_general_fee);
    const itemFee = Number(policy.board_item_fee);
    // 티어가 실제로 갈리는 설정이어야 이 테스트가 의미를 갖는다.
    expect(itemFee).toBeGreaterThan(genFee);

    for (const [qType, expected] of [['general', genFee], ['item', itemFee]] as const) {
      const p: any = await qna.createQuestion(studentUser, { scope: 'open', body: `요금 티어 ${qType}`, qType });
      expect(p.qType).toBe(qType); // 등록 시점에 확정·저장된다
      expect(p.escalateCredits).toBe(expected); // 학생에게 보여줄 예상 과금액
      expect(p.chargedCredits).toBe(0); // 등록은 여전히 무료

      const before = await credit.getAccount(STU_Q);
      const esc: any = await qna.escalateToHuman(studentUser, p.id);
      expect(esc.freeUsed).toBe(false); // 무료 질문권이 끼면 과금 0 이 되어 검증이 공허해진다
      expect(esc.chargedCredits).toBe(expected); // **표시 = 과금**
      expect((await credit.getAccount(STU_Q)).total).toBe(before.total - expected);
    }
  });

  it('유형을 안 보내면 general 로 저장된다(구 행·구 클라이언트 하위호환)', async () => {
    const p: any = await qna.createQuestion(studentUser, { scope: 'open', body: '유형 미지정' });
    expect(p.qType).toBe('general');
  });

  it('§5-9: unfit 분류 교사는 공개 질문 답변 불가', async () => {
    await prisma.teacher_list_entry.create({
      data: {
        student_id: STU_Q,
        teacher_id: TEACHER,
        list_kind: 'unfit' as any,
      },
    });
    const post: any = await qna.createQuestion(studentUser, {
      scope: 'open',
      body: '두번째 질문',
    });
    // ⚠ 위양성 교정: 등록 직후 status 는 'ai_pending' 이라 answer 가 **unfit 게이트가 아니라**
    //   '이미 종료/미공개' 이유로 거부돼 초록이었다. escalate 로 'open' 으로 올린 뒤에야
    //   unfit 분류 게이트를 실제로 탄다 — 거부 사유까지 단정해 다시 위양성이 되지 않게 한다.
    await qna.escalateToHuman(studentUser, post.id);
    await expect(
      qna.answer(post.id, { body: 'x' }, teacherUser),
    ).rejects.toThrow(/맞지 않는|unfit|답변할 수 없/);
  });
});
