import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ScoresService } from '../src/modules/scores/scores.service';

/**
 * 선생님↔학생 관계 게이트(O107) — 지도 관계가 있는 선생님만 학생 데이터를 본다.
 *   ①담임 ②상담 이력(booking) 중 하나 + 같은 센터. 연령·동의는 근거가 아니다(학부모 O105 와 다름).
 * 기존 teacherTrend 의 '같은 센터 전원 열람 + 배치 무조건 노출' 비대칭도 함께 정렬됐는지 검증한다.
 */
describe('선생님 관계 게이트', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scores: ScoresService;
  let studentId: string;
  let centerId: string | null;
  let homeroomTeacher: any;
  let bookedTeacher: any;
  let strangerTeacher: any;
  let prevHomeroom: string | null = null;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    scores = mod.get(ScoresService);

    const s = await prisma.student_profile.findFirstOrThrow({
      where: { account: { login_id: 'student01' } },
      select: { account_id: true, center_id: true, homeroom_teacher_id: true },
    });
    studentId = s.account_id;
    centerId = s.center_id;
    prevHomeroom = s.homeroom_teacher_id;

    // 같은 센터 선생님 3명 확보(담임 / 상담이력 / 무관)
    const teachers = await prisma.account.findMany({
      where: { role: 'teacher', center_id: centerId },
      select: { id: true },
      take: 3,
    });
    if (teachers.length < 2)
      throw new Error('센터 선생님 데모 계정이 2명 이상 필요');
    homeroomTeacher = { id: teachers[0].id, role: 'teacher', centerId };
    bookedTeacher = { id: teachers[1].id, role: 'teacher', centerId };
    strangerTeacher = {
      id: (teachers[2] ?? teachers[1]).id,
      role: 'teacher',
      centerId,
    };

    // 담임 지정
    await prisma.student_profile.update({
      where: { account_id: studentId },
      data: { homeroom_teacher_id: homeroomTeacher.id },
    });
    // 이력 1건(열람 대상)
    await prisma.janus_report.deleteMany({ where: { student_id: studentId } });
    await scores.gapReport(
      { id: studentId, role: 'student', centerId } as any,
      {
        mode: 'susi',
        univ: '선생님게이트대',
        dept: '검증과',
        cut: 2.0,
        myGrade: 2.5,
      },
    );
  });

  afterAll(async () => {
    await prisma.janus_report.deleteMany({ where: { student_id: studentId } });
    await prisma.student_profile.update({
      where: { account_id: studentId },
      data: { homeroom_teacher_id: prevHomeroom },
    });
    await app.close();
  });

  it('담임 선생님 → 이력 열람 가능', async () => {
    const list = await scores.listStudentReportsForTeacher(
      homeroomTeacher,
      studentId,
    );
    expect(list.length).toBeGreaterThan(0);
    expect((list[0].payload as any).target.univ).toBe('선생님게이트대');
  });

  it('상담 이력이 있는 선생님 → 열람 가능', async () => {
    const booking = await prisma.booking.findFirst({
      where: { student_id: studentId, teacher_id: bookedTeacher.id },
      select: { id: true },
    });
    if (!booking) {
      // 데모에 해당 조합이 없으면 관계 없음으로 차단돼야 한다(반대 방향으로 검증).
      await expect(
        scores.listStudentReportsForTeacher(bookedTeacher, studentId),
      ).rejects.toThrow();
      return;
    }
    const list = await scores.listStudentReportsForTeacher(
      bookedTeacher,
      studentId,
    );
    expect(Array.isArray(list)).toBe(true);
  });

  it('담임도 아니고 상담 이력도 없는 같은 센터 선생님 → 403(관계 없음)', async () => {
    const hasBooking = await prisma.booking.findFirst({
      where: { student_id: studentId, teacher_id: strangerTeacher.id },
      select: { id: true },
    });
    if (strangerTeacher.id === homeroomTeacher.id || hasBooking) return; // 관계가 있으면 이 케이스 대상 아님
    await expect(
      scores.listStudentReportsForTeacher(strangerTeacher, studentId),
    ).rejects.toThrow(/담임이거나 상담/);
  });

  it('다른 센터 선생님 → 403', async () => {
    const other = {
      id: homeroomTeacher.id,
      role: 'teacher',
      centerId: '00000000-0000-4000-8000-0000000000cf',
    };
    await expect(
      scores.listStudentReportsForTeacher(other as any, studentId),
    ).rejects.toThrow(/다른 센터/);
  });

  it('선생님 아닌 역할 → 403', async () => {
    const notTeacher = { id: homeroomTeacher.id, role: 'student', centerId };
    await expect(
      scores.listStudentReportsForTeacher(notTeacher as any, studentId),
    ).rejects.toThrow(/선생님만/);
  });

  describe('기존 teacherTrend 정렬(O107)', () => {
    it('관계 없는 선생님은 성적 추이도 차단된다(기존 같은 센터 전원 열람 정리)', async () => {
      const hasBooking = await prisma.booking.findFirst({
        where: { student_id: studentId, teacher_id: strangerTeacher.id },
        select: { id: true },
      });
      if (strangerTeacher.id === homeroomTeacher.id || hasBooking) return;
      await expect(
        scores.teacherTrend(strangerTeacher, studentId),
      ).rejects.toThrow();
    });

    it('담임은 추이 조회 가능 + 배치 노출은 전사 정책을 따른다(선생님 우회 제거)', async () => {
      const p = await scores.getScorePolicy();
      const tr = await scores.teacherTrend(homeroomTeacher, studentId);
      expect(Array.isArray(tr.points)).toBe(true);
      if (tr.points.length) {
        const hasPlacement = tr.points.some((x: any) => x.placement != null);
        // 정책이 OFF 면 어떤 회차에도 배치가 실리지 않아야 한다.
        if (!p.placement) expect(hasPlacement).toBe(false);
      }
    });
  });
});
