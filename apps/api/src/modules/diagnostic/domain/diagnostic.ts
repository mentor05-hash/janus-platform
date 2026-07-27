/**
 * 수준진단 채점·약점 판정(순수). 상태(DB)는 서비스가, 규칙은 여기서.
 * 약점 = 유형별 정답률이 임계 미만. 처방은 약점 유형 → 다음 행동 힌트.
 */
export const WEAK_THRESHOLD = 60; // 유형 정답률 이 미만이면 약점

export interface Graded {
  questionId: string;
  unit: string;
  subject: string;
  correct: boolean;
}

export interface UnitStat {
  subject: string;
  unit: string;
  total: number;
  correct: number;
  rate: number; // %
  weak: boolean;
}

/** 정답률(%) — 0 문항이면 0. */
export const scorePct = (correct: number, total: number): number =>
  total ? Math.round((correct / total) * 100) : 0;

/** 유형별 집계 + 약점 표시. */
export function weaknessByUnit(
  items: Graded[],
  threshold = WEAK_THRESHOLD,
): UnitStat[] {
  const map = new Map<string, UnitStat>();
  for (const it of items) {
    const key = `${it.subject}::${it.unit}`;
    const cur = map.get(key) ?? {
      subject: it.subject,
      unit: it.unit,
      total: 0,
      correct: 0,
      rate: 0,
      weak: false,
    };
    cur.total += 1;
    if (it.correct) cur.correct += 1;
    map.set(key, cur);
  }
  return [...map.values()]
    .map((u) => ({
      ...u,
      rate: scorePct(u.correct, u.total),
      weak: scorePct(u.correct, u.total) < threshold,
    }))
    .sort((a, b) => a.rate - b.rate); // 약한 순
}

/** 처방(약점 유형 → 다음 행동). 강좌·격차·클리닉으로 연결(링크는 웹). */
export function prescribe(
  stats: UnitStat[],
): { unit: string; subject: string; rate: number; action: string }[] {
  return stats
    .filter((s) => s.weak)
    .map((s) => ({
      subject: s.subject,
      unit: s.unit,
      rate: s.rate,
      action: `${s.subject} · ${s.unit} 집중 보완 — 관련 강좌·클리닉으로 반복 훈련`,
    }));
}
