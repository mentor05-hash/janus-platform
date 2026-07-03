/**
 * 급여 공제 계산 (데모 근사) — 4대보험 근로자 부담분 + 원천징수(소득세·지방소득세).
 * 실제 요율·간이세액표는 매년 변동하므로 배포 전 최신값·세무 검토 필요.
 */
export type Deductions = {
  국민연금: number;
  건강보험: number;
  장기요양: number;
  고용보험: number;
  소득세: number;
  지방소득세: number;
  total: number;
  net: number;
};

// 2024 기준 근로자 부담 요율(데모)
const RATE = { pension: 0.045, health: 0.03545, care: 0.1295, employment: 0.009 };

/** 근로소득 간이세액 근사(월). 실제 간이세액표 대체용 데모. */
function incomeTaxApprox(gross: number): number {
  if (gross <= 1_060_000) return 0;
  if (gross <= 3_000_000) return Math.round((gross - 1_060_000) * 0.04);
  if (gross <= 5_000_000) return Math.round(77_600 + (gross - 3_000_000) * 0.09);
  return Math.round(257_600 + (gross - 5_000_000) * 0.15);
}

/** 사업주(회사) 4대보험 부담 — 급여 위에 얹히는 비용. 회사 총부담 = gross + total. */
export type EmployerContribution = {
  국민연금: number;
  건강보험: number;
  장기요양: number;
  고용보험: number; // 실업급여 + 고용안정·직업능력
  산재보험: number;
  total: number;
};

// 사업주 부담 요율(2025 근사). 고용보험=실업 0.9% + 고용안정·직능 0.25%(150인 미만). 산재=교육서비스 근사 0.7%.
const EMP_RATE = { pension: 0.045, health: 0.03545, care: 0.1295, employment: 0.009 + 0.0025, accident: 0.007 };

export function computeEmployerContribution(gross: number): EmployerContribution {
  const g = Math.max(0, Math.round(gross));
  const 국민연금 = Math.round((g * EMP_RATE.pension) / 10) * 10;
  const 건강보험 = Math.round((g * EMP_RATE.health) / 10) * 10;
  const 장기요양 = Math.round((건강보험 * EMP_RATE.care) / 10) * 10;
  const 고용보험 = Math.round((g * EMP_RATE.employment) / 10) * 10;
  const 산재보험 = Math.round((g * EMP_RATE.accident) / 10) * 10;
  const total = 국민연금 + 건강보험 + 장기요양 + 고용보험 + 산재보험;
  return { 국민연금, 건강보험, 장기요양, 고용보험, 산재보험, total };
}

export function computeDeductions(gross: number): Deductions {
  const g = Math.max(0, Math.round(gross));
  const 국민연금 = Math.round((g * RATE.pension) / 10) * 10;
  const 건강보험 = Math.round((g * RATE.health) / 10) * 10;
  const 장기요양 = Math.round((건강보험 * RATE.care) / 10) * 10;
  const 고용보험 = Math.round((g * RATE.employment) / 10) * 10;
  const 소득세 = Math.round(incomeTaxApprox(g) / 10) * 10;
  const 지방소득세 = Math.round((소득세 * 0.1) / 10) * 10;
  const total = 국민연금 + 건강보험 + 장기요양 + 고용보험 + 소득세 + 지방소득세;
  return { 국민연금, 건강보험, 장기요양, 고용보험, 소득세, 지방소득세, total, net: g - total };
}
