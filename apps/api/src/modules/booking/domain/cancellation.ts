import { CancelRoute } from '../../../config/enums';

/**
 * 선생님 사유 취소 처리 계획 (CLAUDE.md §5-6).
 * 4경로: ①substitute(대체후보→학생선택) ②priority(우선권 자동배정)
 *        ③admin_manual(관리자 수동) ④rebook_notice(재예약 안내).
 * 공통: 크레딧 환원, 학생·보호자·관리자 알림. substitute/priority 는 대체후보 탐색 + 대체후보 알림.
 */
export type NotifyTarget = 'student' | 'guardian' | 'admin' | 'substitute';

export interface CancellationPlan {
  notifyTargets: NotifyTarget[];
  needsSubstitutes: boolean;
  refund: boolean;
}

export function planTeacherCancellation(route: CancelRoute): CancellationPlan {
  const base: NotifyTarget[] = ['student', 'guardian', 'admin'];
  const needsSubstitutes = route === 'substitute' || route === 'priority';
  const notifyTargets = needsSubstitutes
    ? [...base, 'substitute' as const]
    : base;
  return { notifyTargets, needsSubstitutes, refund: true };
}
