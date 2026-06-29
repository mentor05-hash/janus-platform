import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ConsultationService } from '../src/modules/consultation/consultation.service';
import { GuardianService } from '../src/modules/people/guardian.service';
import { PaymentRequestService } from '../src/modules/billing/payment-request.service';
import { CreditService } from '../src/modules/billing/credit.service';

/**
 * 2.2 DoD 통합테스트 (실 DB):
 *  - 보호자: 승인된 연결 자녀의 상담기록 중 공개항목만 조회, 비공개(guardian_visible=false)·메모 차단.
 *  - 결제요청 보호자 대납: 생성→pay 응답→학생 크레딧 충전.
 */
const STUDENT = '00000000-0000-4000-8000-0000000000a1';
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const GUARDIAN = '00000000-0000-4000-8000-0000000000a5';

const guardianUser: any = { id: GUARDIAN, role: 'guardian', centerId: null, loginId: 'guardian01' };
const studentUser: any = { id: STUDENT, role: 'student', centerId: null, loginId: 'student01' };

describe('2.2 학부모·공개정책·결제요청 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let guardian: GuardianService;
  let consultation: ConsultationService;
  let paymentRequests: PaymentRequestService;
  let credit: CreditService;
  const createdBookings: string[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    guardian = mod.get(GuardianService);
    consultation = mod.get(ConsultationService);
    paymentRequests = mod.get(PaymentRequestService);
    credit = mod.get(CreditService);

    // 깨끗한 시작: 기존 링크/결제요청 제거
    await prisma.guardian_student_link.deleteMany({ where: { guardian_id: GUARDIAN, student_id: STUDENT } });
    await prisma.payment_request.deleteMany({ where: { student_id: STUDENT, ref_type: 'guardian_proxy' } });

    // 공개(final, guardian_visible=true) 노트
    const b1 = await prisma.booking.create({
      data: { student_id: STUDENT, teacher_id: TEACHER, consult_type: 'subject' as any, mode: 'zoom' as any, status: 'done' as any },
    });
    createdBookings.push(b1.id);
    await prisma.consultation_note.create({
      data: {
        booking_id: b1.id, student_id: STUDENT, teacher_id: TEACHER, consult_type: 'subject' as any,
        core_summary: '공개 요약', memo: '내부 메모(비공개)', homework: '숙제',
        guardian_visible: true, save_state: 'final' as any,
      },
    });
    // 비공개(guardian_visible=false) 노트
    const b2 = await prisma.booking.create({
      data: { student_id: STUDENT, teacher_id: TEACHER, consult_type: 'subject' as any, mode: 'zoom' as any, status: 'done' as any },
    });
    createdBookings.push(b2.id);
    await prisma.consultation_note.create({
      data: {
        booking_id: b2.id, student_id: STUDENT, teacher_id: TEACHER, consult_type: 'subject' as any,
        core_summary: '비공개 상담 요약', memo: '내부', save_state: 'final' as any, guardian_visible: false,
      },
    });
  });

  afterAll(async () => {
    for (const id of createdBookings) await prisma.booking.delete({ where: { id } }).catch(() => {});
    await prisma.guardian_student_link.deleteMany({ where: { guardian_id: GUARDIAN, student_id: STUDENT } });
    await prisma.payment_request.deleteMany({ where: { student_id: STUDENT, ref_type: 'guardian_proxy' } });
    await app.close();
  });

  it('연결 신청→학생 승인 상태머신', async () => {
    const link = await guardian.requestLink(guardianUser, { studentLoginId: 'student01', relation: '모' });
    expect(link.status).toBe('pending');
    const res = await guardian.respondLink(link.id, { action: 'approve' }, studentUser);
    expect(res.status).toBe('approved');
  });

  it('보호자는 공개 항목만, 메모·비공개 노트 차단(§5-5)', async () => {
    const notes: any[] = await consultation.listForStudent(STUDENT, guardianUser);
    // 이 테스트가 만든 노트만 스코프(다른 테스트 잔여 데이터와 격리)
    const mine = notes.filter((n) => createdBookings.includes(n.bookingId));
    expect(mine.length).toBe(1); // 공개 final + guardian_visible=true 1건만(비공개는 제외)
    const n = mine[0];
    expect(n.coreSummary).toBe('공개 요약');
    expect(n.homework).toBe('숙제');
    // 비공개(guardian_visible=false) 노트는 목록에 없음
    expect(notes.some((x) => x.coreSummary === '비공개 상담 요약')).toBe(false);
    // 반환된 어떤 노트에도 내부 메모 미포함
    expect(notes.every((x) => !('memo' in x))).toBe(true);
  });

  it('결제요청 보호자 대납: 생성→pay→학생 크레딧 충전', async () => {
    const before = await credit.getAccount(STUDENT);
    const req: any = await paymentRequests.create(guardianUser, { neededCredits: 15_000, studentId: STUDENT });
    expect(req.path).toBe('guardian_proxy');
    const res: any = await paymentRequests.respond(req.id, { action: 'pay' }, guardianUser);
    expect(res.status).toBe('done');
    const after = await credit.getAccount(STUDENT);
    expect(after.total).toBe(before.total + 15_000);
  });
});
