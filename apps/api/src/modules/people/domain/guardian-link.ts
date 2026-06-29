/**
 * 보호자-학생 연결 승인 상태머신 (CLAUDE.md §3 people, 통합스펙 §학부모).
 * pending → approved | rejected, approved → revoked(연결 해제).
 */
export type GuardianLinkStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export const GUARDIAN_LINK_TRANSITIONS: Record<GuardianLinkStatus, GuardianLinkStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['revoked'],
  rejected: [],
  revoked: [],
};

export function canLinkTransition(from: GuardianLinkStatus, to: GuardianLinkStatus): boolean {
  return GUARDIAN_LINK_TRANSITIONS[from]?.includes(to) ?? false;
}
