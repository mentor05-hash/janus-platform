/**
 * 크레딧 소비 순서 도메인 (CLAUDE.md §5-3).
 * 순서: 주간 부여분(만료 임박 우선) → 구매분. 부족 시 shortfall(>0) → 결제요청 유도.
 * 순수 함수 — DB/시간 의존 없음(만료시각은 호출자가 정렬용 숫자로 전달).
 */

export interface GrantLot {
  id: string;
  remaining: number;
  /** 만료 시각(정렬 기준, epoch ms 또는 비교 가능한 숫자). 작을수록 임박. */
  expireAt: number;
}

export interface ConsumeResult {
  /** 부여분에서 차감한 내역(만료 임박 순). */
  grantSpend: { id: string; used: number }[];
  /** 구매분에서 차감한 양. */
  purchasedSpend: number;
  /** 부족분(>0 이면 잔액 부족 → 결제요청). */
  shortfall: number;
}

export function consumeCredits(grants: GrantLot[], purchased: number, amount: number): ConsumeResult {
  const result: ConsumeResult = { grantSpend: [], purchasedSpend: 0, shortfall: 0 };
  let need = Math.max(0, amount);

  // 1) 부여분 — 만료 임박(expireAt 오름차순) 우선
  const sorted = [...grants].sort((a, b) => a.expireAt - b.expireAt);
  for (const lot of sorted) {
    if (need <= 0) break;
    const used = Math.min(lot.remaining, need);
    if (used > 0) {
      result.grantSpend.push({ id: lot.id, used });
      need -= used;
    }
  }

  // 2) 구매분
  if (need > 0) {
    const used = Math.min(purchased, need);
    result.purchasedSpend = used;
    need -= used;
  }

  // 3) 부족분
  result.shortfall = need;
  return result;
}
