import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ReportService } from '../src/modules/report/report.service';
import { BlockService } from '../src/modules/report/block.service';
import { BookingService } from '../src/modules/booking/booking.service';

/**
 * 3.3 DoD 통합테스트 (실 DB):
 *  - 신고 등록 → AI 1차 검토(LlmProvider stub) 첨부 → 관리자 상태머신 처리.
 *  - 교사 차단 → 해당 교사 예약 차단.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const STU_B = '00000000-0000-4000-8000-0000000000eb';
const studentUser: any = { id: STU_B, role: 'student', centerId: CENTER, loginId: 'rep_s' };
const adminUser: any = { id: '00000000-0000-4000-8000-0000000000a3', role: 'admin', centerId: CENTER };

describe('3.3 신고·차단·AI 검토 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reports: ReportService;
  let blocks: BlockService;
  let booking: BookingService;
  const reportIds: string[] = [];

  async function cleanup() {
    await prisma.teacher_block.deleteMany({ where: { student_id: STU_B } });
    await prisma.account.deleteMany({ where: { id: STU_B } });
    if (reportIds.length) await prisma.report.deleteMany({ where: { id: { in: reportIds } } });
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    reports = mod.get(ReportService);
    blocks = mod.get(BlockService);
    booking = mod.get(BookingService);
    await cleanup();
    await prisma.account.create({ data: { id: STU_B, role: 'student' as any, center_id: CENTER, login_id: 'rep_s', pw_hash: 'x', name: 'r', status: 'approved' as any } });
    await prisma.student_profile.create({ data: { account_id: STU_B, center_id: CENTER } });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('신고 등록 → AI 검토 첨부 → 관리자 처리(상태머신)', async () => {
    const r: any = await reports.create(studentUser, { targetType: 'teacher', targetId: TEACHER, reason: '상담 중 폭언을 들었습니다' });
    reportIds.push(r.id);
    expect(r.aiFlagged).toBe(true); // '폭언' 키워드 → flagged
    expect(r.status).toBe('received');

    const reviewing: any = await reports.handle(r.id, { status: 'reviewing' }, adminUser);
    expect(reviewing.status).toBe('reviewing');
    const resolved: any = await reports.handle(r.id, { status: 'resolved', action: '경고 조치' }, adminUser);
    expect(resolved.status).toBe('resolved');
    // 종료 상태에서 재전이 불가
    await expect(reports.handle(r.id, { status: 'reviewing' }, adminUser)).rejects.toThrow();
  });

  it('신고: 특이사항 없는 사유는 flagged=false', async () => {
    const r: any = await reports.create(studentUser, { targetType: 'teacher', reason: '시간 변경 문의' });
    reportIds.push(r.id);
    expect(r.aiFlagged).toBe(false);
  });

  it('M2/M3: AI 결과 별도 보존 + 센터 스코프', async () => {
    const r: any = await reports.create(studentUser, { targetType: 'teacher', reason: '폭언 신고' });
    reportIds.push(r.id);
    const row: any = await prisma.report.findUnique({ where: { id: r.id } });
    expect(row.ai_review).toBeTruthy(); // AI 결과는 ai_review 컬럼에 보존
    expect(row.center_id).toBe(CENTER); // 신고자 센터로 스코프

    // 타 센터 관리자는 처리 불가
    const otherAdmin: any = { id: adminUser.id, role: 'admin', centerId: '00000000-0000-4000-8000-0000000000c2' };
    await expect(reports.handle(r.id, { status: 'reviewing' }, otherAdmin)).rejects.toThrow();

    // 처리 후에도 AI 결과 보존(action 과 분리)
    await reports.handle(r.id, { status: 'resolved', action: '경고 조치' }, adminUser);
    const row2: any = await prisma.report.findUnique({ where: { id: r.id } });
    expect(row2.ai_review).toBeTruthy();
    expect(row2.action).toBe('경고 조치');
  });

  it('교사 차단 → 예약 차단', async () => {
    await blocks.block(studentUser, TEACHER);
    expect(await blocks.blockedTeacherIds(STU_B)).toContain(TEACHER);
    await expect(
      booking.create(
        { teacherId: TEACHER, date: '2033-01-02', consultType: '교과' as any, mode: 'zoom' as any, slotStart: 60, slotEnd: 63 } as any,
        studentUser,
      ),
    ).rejects.toThrow(/차단/);
  });
});
