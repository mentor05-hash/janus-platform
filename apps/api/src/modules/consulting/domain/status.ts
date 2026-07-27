// 컨설팅 신청 상태머신 + 상품 정책 (순수 함수, DB/NestJS 의존 없음) — 설계안 §3
// 상태 전이는 이 맵만 신뢰한다. 서비스 계층에서 optimistic updateMany(where status=from)로 적용.

export type ConsultingStatus =
  | 'draft'
  | 'submitted'
  | 'awaiting_payment'
  | 'paid'
  | 'in_review'
  | 'completed'
  | 'canceled';

export type ConsultingPackage = 'single' | 'season' | 'full';
export type AssignmentMode = 'at_application' | 'manual';

export const CONSULTING_TRANSITIONS: Record<
  ConsultingStatus,
  ConsultingStatus[]
> = {
  draft: ['submitted', 'canceled'],
  submitted: ['awaiting_payment', 'canceled'],
  awaiting_payment: ['paid', 'canceled'],
  paid: ['in_review', 'canceled'], // paid 이후 취소는 환불(refund)과 연동 — Phase 2
  in_review: ['completed', 'canceled'],
  completed: [],
  canceled: [],
};

export function canTransition(
  from: ConsultingStatus,
  to: ConsultingStatus,
): boolean {
  return CONSULTING_TRANSITIONS[from]?.includes(to) ?? false;
}

// 상품별 배정 방식 기본값. 상품마다 다르게 설정하며, 추후 system_setting으로 override(Phase 2).
export const DEFAULT_ASSIGNMENT_MODE: Record<
  ConsultingPackage,
  AssignmentMode
> = {
  single: 'manual', // 단건 진단 — 관리자 수동 배정
  season: 'at_application', // 시즌 정기권 — 신청 시 전담 지정
  full: 'manual', // 종합 전담 — 맞춤 배정
};

export function defaultAssignmentMode(pkg: ConsultingPackage): AssignmentMode {
  return DEFAULT_ASSIGNMENT_MODE[pkg];
}

// 상품 가격(원). 크레딧 결제 불가 — 원화 기준. null = 맞춤 견적(별도 산정). Phase 2 결제에서 사용.
export const PACKAGE_PRICE_WON: Record<ConsultingPackage, number | null> = {
  single: 150000,
  season: 480000,
  full: null,
};

export function packagePriceWon(pkg: ConsultingPackage): number | null {
  return PACKAGE_PRICE_WON[pkg];
}

// 열람 게이트 — 자료/분석은 결제 완료(payment.status === 'paid') 후에만 접근 허용. Phase 2에서 실사용.
export function canAccessDocuments(paymentStatus?: string | null): boolean {
  return paymentStatus === 'paid';
}
