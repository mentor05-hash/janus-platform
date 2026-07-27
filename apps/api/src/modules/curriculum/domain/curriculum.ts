/**
 * 주간 학습 플랜(순수) — 진단 약점 + 성적 요약 → "무엇을 이 순서로" 처방 카드.
 * 우선순위: 약점 정답률 낮은 유형부터. 각 항목에 이번 주 행동(질문·자료·클리닉) 힌트.
 */
export interface WeakUnit {
  subject: string;
  unit: string;
  rate: number;
}
export interface PlanScore {
  label: string; // 성적 요약 라벨(전국누백/표점·계열) 또는 '성적 미입력'
  hasScore: boolean;
}
export interface PlanItem {
  order: number;
  subject: string;
  unit: string;
  rate: number;
  focus: string; // 이번 주 목표 문장
  actions: string[]; // 행동 라벨(웹이 링크로 연결)
}
export interface WeeklyPlan {
  headline: string;
  score: PlanScore;
  items: PlanItem[];
  hasDiagnostic: boolean;
}

/** 약점(정답률 낮은 순 최대 5개) → 주간 플랜. */
export function buildWeeklyPlan(
  weak: WeakUnit[],
  score: PlanScore,
): WeeklyPlan {
  const sorted = [...weak].sort((a, b) => a.rate - b.rate).slice(0, 5);
  const items: PlanItem[] = sorted.map((w, i) => ({
    order: i + 1,
    subject: w.subject,
    unit: w.unit,
    rate: w.rate,
    focus: `${w.subject} · ${w.unit} — 정답률 ${w.rate}%를 이번 주 70%까지`,
    actions: ['이 과목 질문하기', '자료 찾기', '약점 클리닉'],
  }));
  const headline = !sorted.length
    ? '약점 유형이 없어요 — 실력진단을 먼저 보거나, 지금 페이스를 유지하세요.'
    : `이번 주 우선순위 ${sorted.length}개: ${sorted.map((s) => s.unit).join(' · ')}`;
  return {
    headline,
    score,
    items,
    hasDiagnostic: weak.length > 0 || sorted.length > 0,
  };
}
