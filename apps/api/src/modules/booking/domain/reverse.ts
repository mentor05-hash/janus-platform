/**
 * 역상담 (CLAUDE.md §5-4).
 * 선생님이 학생에게 먼저 제안(direction='reverse'). 첫 상담 한정(옵션).
 * 양방향 수락/거절은 기존 상태머신(new→confirmed/rejected)을 학생 주체로 분기 사용.
 */

/** 선생님-학생 간 기존 성사 상담(confirmed/done) 수가 0일 때만 역상담 제안 가능. */
export function canProposeReverse(priorEstablishedCount: number): boolean {
  return priorEstablishedCount === 0;
}
