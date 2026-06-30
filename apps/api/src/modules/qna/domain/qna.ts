/**
 * 온라인 Q&A 도메인 (CLAUDE.md §6 Phase 3, §5-9).
 * 답변 권한: 지정(assigned)은 지정 교사만, 공개(open)는 '맞지 않는(unfit)' 교사 제외.
 */
export type QnaScope = 'open' | 'assigned';

export interface AnswerEligibility {
  scope: QnaScope;
  assignedTeacherId: string | null;
  teacherId: string;
  /** 질문 학생이 이 교사를 unfit 으로 분류했는가(§5-9 게이트). */
  isUnfitForStudent: boolean;
}

export function canAnswerQuestion(p: AnswerEligibility): {
  allowed: boolean;
  reason?: string;
} {
  if (p.scope === 'assigned') {
    if (p.assignedTeacherId !== p.teacherId)
      return { allowed: false, reason: 'not_assigned' };
    return { allowed: true };
  }
  // open: 맞지 않는 선생님은 공개 게시판 질문을 가져갈 수 없음(§5-9)
  if (p.isUnfitForStudent) return { allowed: false, reason: 'unfit' };
  return { allowed: true };
}
