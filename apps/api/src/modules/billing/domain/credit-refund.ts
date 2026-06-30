/**
 * 환원 분배 (백로그 M4, §5-3 정합).
 * 소비 시 기록한 분배(부여분 lot별 + 구매분)를 원래 버킷으로 복원.
 * 단, 만료된 부여분(lot.expireAt <= now)은 되살릴 수 없으므로 구매분으로 환원.
 */
export interface SpendSplit {
  grantSpend: { id: string; used: number }[];
  purchasedSpend: number;
}

export interface RefundPlan {
  grantRestores: { id: string; amount: number }[]; // 살아있는 부여 lot 복원
  toPurchased: number; // 구매분 + 만료된 부여분
}

export function planRefund(
  split: SpendSplit | null | undefined,
  lotExpiry: Record<string, number>, // grant id → expireAt(epoch ms)
  now: number,
  fallbackAmount: number,
): RefundPlan {
  // 분배 기록이 없으면(레거시) 전액 구매분 환원
  if (!split) return { grantRestores: [], toPurchased: fallbackAmount };

  const grantRestores: { id: string; amount: number }[] = [];
  let toPurchased = split.purchasedSpend ?? 0;
  for (const g of split.grantSpend ?? []) {
    const exp = lotExpiry[g.id];
    if (exp != null && exp > now)
      grantRestores.push({ id: g.id, amount: g.used });
    else toPurchased += g.used; // 만료/소실된 부여분은 구매분으로
  }
  return { grantRestores, toPurchased };
}
