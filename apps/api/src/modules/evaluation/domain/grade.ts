import { TeacherGrade } from '../../../config/enums';

/**
 * 평가·등급 도메인 (CLAUDE.md §6 Phase 3).
 * 평점 평균(소수 1자리) + 등급 산정(S/A/B).
 */
export function averageRating(values: Array<number | null | undefined>): number {
  const v = values.filter((x): x is number => typeof x === 'number');
  if (v.length === 0) return 0;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

/** 등급 컷: S(평점≥4.5·상담≥10) / A(평점≥4.0) / B(그 외). */
export function computeGrade(avgRating: number, totalConsult: number): TeacherGrade {
  if (avgRating >= 4.5 && totalConsult >= 10) return TeacherGrade.S;
  if (avgRating >= 4.0) return TeacherGrade.A;
  return TeacherGrade.B;
}
