import { CancelRoute } from '../../../config/enums';
import { planTeacherCancellation } from './cancellation';

/** §5-6 선생님 사유 취소 4경로 처리 계획. */
describe('취소 처리 계획(§5-6)', () => {
  it('모든 경로는 크레딧 환원 + 학생·보호자·관리자 알림', () => {
    for (const route of [
      'substitute',
      'priority',
      'admin_manual',
      'rebook_notice',
    ] as CancelRoute[]) {
      const p = planTeacherCancellation(route);
      expect(p.refund).toBe(true);
      expect(p.notifyTargets).toEqual(
        expect.arrayContaining(['student', 'guardian', 'admin']),
      );
    }
  });

  it('substitute/priority 는 대체후보 탐색 + 대체후보 알림', () => {
    expect(planTeacherCancellation('substitute').needsSubstitutes).toBe(true);
    expect(planTeacherCancellation('priority').needsSubstitutes).toBe(true);
    expect(planTeacherCancellation('substitute').notifyTargets).toContain(
      'substitute',
    );
  });

  it('admin_manual/rebook_notice 는 대체후보 탐색 없음', () => {
    expect(planTeacherCancellation('admin_manual').needsSubstitutes).toBe(
      false,
    );
    expect(planTeacherCancellation('rebook_notice').needsSubstitutes).toBe(
      false,
    );
    expect(
      planTeacherCancellation('rebook_notice').notifyTargets,
    ).not.toContain('substitute');
  });
});
