import { ConsultationService } from './consultation.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountRole } from '../../config/enums';

/**
 * P0#1 회귀 — 교사의 학생 상담기록 접근이 소속 센터/담당 이력으로 스코핑되는지(BOLA 차단).
 * 기존 버그: assertStudentAccess 가 교사에 무조건 통과 → listForStudent 의 save_state=FINAL
 * 분기가 전 센터 학생의 최종 상담 본문을 노출.
 */

function build(
  opts: {
    teacherCenter?: string | null;
    studentCenter?: string | null;
    hasBooking?: boolean;
  } = {},
) {
  const calls: Record<string, unknown[][]> = {};
  const track =
    (name: string, ret: unknown) =>
    (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return Promise.resolve(
        typeof ret === 'function'
          ? (ret as (...a: unknown[]) => unknown)(...args)
          : ret,
      );
    };
  const prisma = {
    teacher_profile: {
      findUnique: track('teacher', {
        center_id: opts.teacherCenter === undefined ? 'c1' : opts.teacherCenter,
      }),
    },
    student_profile: {
      findUnique: track('student', {
        center_id: opts.studentCenter === undefined ? 'c1' : opts.studentCenter,
      }),
    },
    booking: {
      findFirst: track('booking', opts.hasBooking ? { id: 'b1' } : null),
    },
    consultation_note: { findMany: track('notes', []) },
  };

  const service = new ConsultationService(prisma as any);
  return { service, calls };
}

const teacher: AuthUser = {
  id: 'tea-1',
  role: AccountRole.TEACHER,
  centerId: 'c1',
  loginId: 't01',
};

describe('P0#1 상담기록 BOLA — 교사 접근 스코핑', () => {
  it('타 센터 학생 → 차단(조회 자체 안 됨)', async () => {
    const s = build({ teacherCenter: 'c1', studentCenter: 'c2' });
    await expect(s.service.listForStudent('stu-x', teacher)).rejects.toThrow();
    expect(s.calls['notes']).toBeUndefined();
  });

  it('같은 센터 학생 → 통과(정상 조회)', async () => {
    const s = build({ teacherCenter: 'c1', studentCenter: 'c1' });
    await expect(s.service.listForStudent('stu-y', teacher)).resolves.toEqual(
      [],
    );
    expect(s.calls['notes']).toBeDefined();
  });

  it('센터 없는 교사 → 담당 예약 이력 없으면 차단', async () => {
    const s = build({ teacherCenter: null, hasBooking: false });
    await expect(s.service.listForStudent('stu-z', teacher)).rejects.toThrow();
  });

  it('센터 없는 교사 → 담당 예약 이력 있으면 통과', async () => {
    const s = build({ teacherCenter: null, hasBooking: true });
    await expect(s.service.listForStudent('stu-z', teacher)).resolves.toEqual(
      [],
    );
  });

  it('record-overview 도 동일 경계 — 타 센터 차단', async () => {
    const s = build({ teacherCenter: 'c1', studentCenter: 'c2' });
    await expect(s.service.recordOverview('stu-x', teacher)).rejects.toThrow();
  });
});
