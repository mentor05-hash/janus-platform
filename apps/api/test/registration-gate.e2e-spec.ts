import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuthService } from '../src/modules/iam/auth.service';
import { BookingService } from '../src/modules/booking/booking.service';

/**
 * 결함 회귀: 회원가입+승인만 되고 회원등록(student_profile 생성)이 안 된 계정은
 * 정방향(예약)·역방향(역상담) 모두 명확한 404 로 거부돼야 한다(이전엔 정방향 500).
 */
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const CENTER = '00000000-0000-4000-8000-0000000000c1';

describe('회원등록 게이트 — 양방향(§iam/people)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let booking: BookingService;
  let acctId = '';
  const loginId = 'reggate_stu';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    auth = mod.get(AuthService);
    booking = mod.get(BookingService);

    // 회원가입(pending) → 승인(approved). 단 student_profile 은 생성하지 않음(미등록).
    const su = await auth.signup({ loginId, password: 'mentor2026', name: '미등록학생', role: 'student', centerId: CENTER } as any);
    acctId = su.id;
    await prisma.account.update({ where: { id: acctId }, data: { status: 'approved' as any } });
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { id: acctId } });
    await app.close();
  });

  const studentUser = () => ({ id: acctId, role: 'student', centerId: CENTER, loginId }) as any;
  const dto = { teacherId: TEACHER, date: '2034-08-08', consultType: '교과', mode: 'zoom', slotStart: 60, slotEnd: 63 } as any;

  it('정방향: 미등록 학생 예약 → 500 아닌 404(프로필 없음)', async () => {
    await expect(booking.create(dto, studentUser())).rejects.toMatchObject({ status: 404 });
    await expect(booking.create(dto, studentUser())).rejects.toThrow(/등록|프로필/);
  });

  it('정방향: 미등록 학생 견적 → 404', async () => {
    await expect(booking.quote(dto, studentUser())).rejects.toMatchObject({ status: 404 });
  });

  it('역방향: 선생님이 미등록 학생에 역상담 제안 → 404', async () => {
    const teacherUser = { id: TEACHER, role: 'teacher', centerId: CENTER, loginId: 'teacher01' } as any;
    await expect(
      booking.proposeReverse({ studentId: acctId, date: '2034-08-08', consultType: '교과', mode: 'zoom', slotStart: 60, slotEnd: 63 } as any, teacherUser),
    ).rejects.toMatchObject({ status: 404 });
  });
});
