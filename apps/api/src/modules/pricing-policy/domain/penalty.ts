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
  lifted: boolean;
}

/**
 * 제한 해제 창(§5-7) — restrictMinutes 가 지정되면 마지막 오펜스(penaltySince)로부터
 * 그 시간만큼만 "일시 제한"이 유지되고 이후 자동 해제된다. null=무기한(누적값 유지).
 */
export interface PenaltyWindow {
  restrictMinutes: number | null;
  penaltySinceMs: number | null;
  nowMs: number;
}

export function evaluatePenalty(
  stats: PenaltyStats,
  t: PenaltyThresholds,
  window?: PenaltyWindow,
): PenaltyResult {
  const reasons: string[] = [];
  if (t.cancelThreshold != null && stats.cancelCount >= t.cancelThreshold)
    reasons.push('cancel');
  if (t.noshowThreshold != null && stats.noshowCount >= t.noshowThreshold)
    reasons.push('noshow');
  if (t.rejectThreshold != null && stats.rejectCount >= t.rejectThreshold)
    reasons.push('reject');
  let restricted = reasons.length > 0;

  // 시간 기반 해제: 임계 초과여도 제한 창이 지났으면 해제
  let lifted = false;
  if (
    restricted &&
    window &&
    window.restrictMinutes != null &&
    window.penaltySinceMs != null &&
    window.nowMs >= window.penaltySinceMs + window.restrictMinutes * 60_000
  ) {
    restricted = false;
    lifted = true;
  }
  return {
    restricted,
    reasons,
    rankingWeightDown: restricted ? (t.rankingWeightDown ?? 0) : 0,
    lifted,
  };
}
