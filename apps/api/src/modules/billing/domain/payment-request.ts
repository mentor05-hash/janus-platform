import { AccountRole } from '../../../config/enums';

/**
 * 결제요청 3경로 (CLAUDE.md §billing, 통합스펙 §학부모).
 * 학생 직접 / 보호자 대납 / 관리자 발행.
 */
export type PaymentRequestPath =
  'student_self' | 'guardian_proxy' | 'admin_issued';

export function resolveCreatePath(actorRole: AccountRole): PaymentRequestPath {
  switch (actorRole) {
    case AccountRole.STUDENT:
      return 'student_self';
    case AccountRole.GUARDIAN:
      return 'guardian_proxy';
    case AccountRole.ADMIN:
      return 'admin_issued';
    default:
      throw new Error(`결제요청을 생성할 수 없는 역할: ${actorRole}`);
  }
}

/** 결제요청에 '대납/결제'로 응답 가능한 역할(보호자·학생 본인). */
export function canPayRequest(actorRole: AccountRole): boolean {
  return (
    actorRole === AccountRole.GUARDIAN || actorRole === AccountRole.STUDENT
  );
}
