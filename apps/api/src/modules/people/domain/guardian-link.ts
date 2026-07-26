/**
 * 보호자-학생 연결 승인 상태머신 (CLAUDE.md §3 people, 통합스펙 §학부모).
 * pending → approved | rejected, approved → revoked(연결 해제).
 *
 * rejected·revoked 는 학생 기준으로는 여전히 종착이다 — 학생의 거절·해제 의사는
 * 학생 스스로 뒤집지 않는다. 다만 그 상태가 (보호자,학생) 쌍의 영구 잠금이 되지
 * 않도록 두 개의 탈출구를 둔다(O124):
 *   ① 보호자 재신청 → 기존 행을 pending 으로 되살리고 학생이 다시 승인(canRelink).
 *   ② 관리자/HR 강제 복구 → 종착 상태에서도 approved 로 전이(GUARDIAN_LINK_ADMIN_TRANSITIONS).
 */
export type GuardianLinkStatus =
  'pending' | 'approved' | 'rejected' | 'revoked';

export const GUARDIAN_LINK_TRANSITIONS: Record<
  GuardianLinkStatus,
  GuardianLinkStatus[]
> = {
  pending: ['approved', 'rejected'],
  approved: ['revoked'],
  rejected: [],
  revoked: [],
};

/**
 * 관리자/HR 전용 전이표. 학생용 전이에 더해 종착 상태를 approved 로 되돌릴 수 있다.
 * 법정대리인 확인 등 오프라인 근거로 운영이 개입하는 경로 — 이력에 admin_override 로 남는다.
 */
export const GUARDIAN_LINK_ADMIN_TRANSITIONS: Record<
  GuardianLinkStatus,
  GuardianLinkStatus[]
> = {
  pending: ['approved', 'rejected'],
  approved: ['revoked'],
  rejected: ['approved'],
  revoked: ['approved'],
};

export function canLinkTransition(
  from: GuardianLinkStatus,
  to: GuardianLinkStatus,
  opts: { isAdmin?: boolean } = {},
): boolean {
  const table = opts.isAdmin
    ? GUARDIAN_LINK_ADMIN_TRANSITIONS
    : GUARDIAN_LINK_TRANSITIONS;
  return table[from]?.includes(to) ?? false;
}

/** 재신청이 가능한 상태(= 학생이 이미 판단을 내려 종료된 상태). */
export const RELINKABLE_STATUSES: GuardianLinkStatus[] = ['rejected', 'revoked'];

/**
 * 재신청 스팸 방지(O124). 관리자 강제 복구는 이 제한을 받지 않는다.
 * - 쿨다운: 거절·해제 직후 즉시 재신청 반복을 막는다.
 * - 횟수: 누적 재신청이 한도를 넘으면 자동 경로를 닫고 운영 개입을 강제한다.
 */
export const RELINK_COOLDOWN_DAYS = 7;
export const RELINK_MAX_ATTEMPTS = 3;

export type RelinkDecision =
  | { allowed: true }
  | { allowed: false; code: 'cooldown'; availableAt: Date }
  | { allowed: false; code: 'max_attempts'; attempts: number };

/**
 * 재신청 허용 여부 판정.
 * @param lastEndedAt 마지막으로 rejected·revoked 가 된 시각(없으면 쿨다운 미적용)
 * @param priorAttempts 지금까지 성공한 재신청 횟수
 * @param now 기준 시각(테스트 주입)
 */
export function evaluateRelink(
  lastEndedAt: Date | null,
  priorAttempts: number,
  now: Date,
): RelinkDecision {
  if (priorAttempts >= RELINK_MAX_ATTEMPTS) {
    return { allowed: false, code: 'max_attempts', attempts: priorAttempts };
  }
  if (lastEndedAt) {
    const availableAt = new Date(
      lastEndedAt.getTime() + RELINK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    );
    if (now < availableAt) {
      return { allowed: false, code: 'cooldown', availableAt };
    }
  }
  return { allowed: true };
}
