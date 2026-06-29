/**
 * 가중 제한 (CLAUDE.md §5-7).
 * 당일취소·노쇼·과다거절 임계 초과 시 신규 신청 일시 제한 + 랭킹 가중치 하락.
 * 임계값은 정책테이블(penalty_policy) + ENV 기본값(하드코딩 금지). null=미설정(제한 없음).
 */
export interface PenaltyStats {
  cancelCount: number;
  noshowCount: number;
  rejectCount: number;
}

export interface PenaltyThresholds {
  cancelThreshold: number | null;
  noshowThreshold: number | null;
  rejectThreshold: number | null;
  rankingWeightDown: number | null;
}

export interface PenaltyResult {
  restricted: boolean;
  reasons: string[];
  rankingWeightDown: number;
}

export function evaluatePenalty(stats: PenaltyStats, t: PenaltyThresholds): PenaltyResult {
  const reasons: string[] = [];
  if (t.cancelThreshold != null && stats.cancelCount >= t.cancelThreshold) reasons.push('cancel');
  if (t.noshowThreshold != null && stats.noshowCount >= t.noshowThreshold) reasons.push('noshow');
  if (t.rejectThreshold != null && stats.rejectCount >= t.rejectThreshold) reasons.push('reject');
  const restricted = reasons.length > 0;
  return { restricted, reasons, rankingWeightDown: restricted ? (t.rankingWeightDown ?? 0) : 0 };
}
