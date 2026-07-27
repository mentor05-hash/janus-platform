// 학원찾기 정렬 스코어 — 스펙 §5. 거리 단독 정렬이 아니라 3요소 가중합.
//   매칭도(레벨·과목·학년 적합) 0.5 + 통학점수(버스 경유>도보권>기타) 0.3 + 정보신선도·verified 0.2
// 순수함수(부수효과 없음) — 단위테스트 대상. 광고 슬롯은 이 스코어와 무관(별도 영역, 정렬 비오염).

export const SCORE_WEIGHTS = { match: 0.5, commute: 0.3, fresh: 0.2 } as const;

export interface ScoreInput {
  /** 요청 필터를 한 반이 동시에 만족하는 최대 비율(0~1). 필터 미요청 시 1(중립 최고). */
  bestClassFitRatio: number;
  /** "우리 동네 경유" 버스 정류장 존재(행정동 매칭). */
  busPass: boolean;
  /** 최근접 역 도보 분(없으면 null). */
  walkMin: number | null;
  /** 야누스 검증(verified) cohort 보유. */
  verified: boolean;
  /** updated_at 로부터 경과일(신선도). */
  ageDays: number;
}

/** 통학 점수(0~1): 버스 경유 > 도보권 > 기타. */
export function commuteScore(busPass: boolean, walkMin: number | null): number {
  if (busPass) return 1;
  if (walkMin == null) return 0.1;
  if (walkMin <= 5) return 0.8;
  if (walkMin <= 10) return 0.6;
  if (walkMin <= 15) return 0.4;
  return 0.2;
}

/** 신선도·verified 점수(0~1): verified 보유(0.6) + 갱신 최신도(≤0.4). */
export function freshScore(verified: boolean, ageDays: number): number {
  let s = verified ? 0.6 : 0;
  if (ageDays <= 30) s += 0.4;
  else if (ageDays <= 90) s += 0.25;
  else if (ageDays <= 365) s += 0.1;
  return Math.min(1, s);
}

/** 최종 정렬 스코어(0~1). 상위일수록 먼저 노출. */
export function scoreAcademy(i: ScoreInput): number {
  const match = clamp01(i.bestClassFitRatio);
  const commute = commuteScore(i.busPass, i.walkMin);
  const fresh = freshScore(i.verified, i.ageDays);
  return round4(
    SCORE_WEIGHTS.match * match +
      SCORE_WEIGHTS.commute * commute +
      SCORE_WEIGHTS.fresh * fresh,
  );
}

/** 요청 필터(subject/level/grade) 대비 한 반의 적합 비율. 요청이 없으면 1(중립). */
export function classFitRatio(
  cls: { subject: string; level: string; target_grades: string[] },
  req: { subject?: string; level?: string; grade?: string },
): number {
  const checks: boolean[] = [];
  if (req.subject) checks.push(cls.subject === req.subject);
  if (req.level) checks.push(cls.level === req.level);
  if (req.grade) checks.push(cls.target_grades.includes(req.grade));
  if (checks.length === 0) return 1;
  return checks.filter(Boolean).length / checks.length;
}

/** 여러 반 중 최고 적합 비율(요청 필터를 한 반이 가장 많이 만족하는 정도). */
export function bestClassFitRatio(
  classes: Array<{ subject: string; level: string; target_grades: string[] }>,
  req: { subject?: string; level?: string; grade?: string },
): number {
  if (!req.subject && !req.level && !req.grade) return 1;
  if (classes.length === 0) return 0;
  return Math.max(...classes.map((c) => classFitRatio(c, req)));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
