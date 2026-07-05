// 결제 금액 산정 + 자료 열람 게이트 (순수 함수) — 설계안 §6 / 결제 상태 모델링
import { canAccessDocuments, packagePriceWon, type ConsultingPackage } from './status';

export type AmountResolution = { ok: true; amount: number } | { ok: false; reason: string };

// 상품 기본가(원화). full(맞춤 견적)은 amountWon 지정 필수. 크레딧 결제 불가.
export function resolvePaymentAmount(pkg: ConsultingPackage, overrideWon?: number | null): AmountResolution {
  const base = packagePriceWon(pkg);
  if (base != null) {
    // 고정가 상품 — 관리자가 필요 시 override(할인/조정) 가능.
    const amount = overrideWon != null && overrideWon > 0 ? overrideWon : base;
    return { ok: true, amount };
  }
  // 종합 전담(맞춤 견적)
  if (overrideWon == null || overrideWon <= 0) {
    return { ok: false, reason: '종합 전담(맞춤 견적)은 결제 금액(amountWon)을 지정해야 합니다.' };
  }
  return { ok: true, amount: overrideWon };
}

export interface DocViewContext {
  isOwner: boolean;
  isStaff: boolean;
  isAssignedConsultant: boolean;
  paymentStatus?: string | null;
}

// 자료 원문 열람 권한: 신청자·스태프는 항상, 배정 컨설턴트는 결제 완료 후에만.
export function canViewDocumentContent(ctx: DocViewContext): boolean {
  if (ctx.isOwner || ctx.isStaff) return true;
  if (ctx.isAssignedConsultant) return canAccessDocuments(ctx.paymentStatus);
  return false;
}
