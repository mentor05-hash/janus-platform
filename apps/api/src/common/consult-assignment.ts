/**
 * 상담 종류별 기본 상담시간(분) + 전임(풀타임) 선생님 판정.
 * - 기본시간은 본사 관리자가 system_setting('consult_duration_policy')로 조정.
 * - 전임 선생님은 근무시간 강제 배정 대상(학생신청·자동매칭·질문·최초상담).
 */
export const DEFAULT_CONSULT_DURATION: Record<string, number> = {
  담임: 30,
  교과: 40,
  입시: 60,
  심리: 50,
};

export const CONSULT_TYPES = ['담임', '교과', '입시', '심리'] as const;

/** 전임(풀타임) 고용형태 라벨 — employment_type 에 저장. */
export const FULL_TIME = '전임';
export const isFullTime = (employmentType?: string | null): boolean =>
  (employmentType ?? '').trim() === FULL_TIME;

/** 질문 답변블록 난이도 티어별 기본 길이(분) — 본사 조정. */
export const DEFAULT_QUESTION_DURATION: Record<string, number> = {
  기초: 10,
  중급: 20,
  심화: 30,
  기본: 15, // 난이도 미지정/미매핑
};
export const QUESTION_TIERS = ['기초', '중급', '심화', '기본'] as const;

/** 자유 텍스트 난이도 → 티어(기초/중급/심화/기본) 매핑. */
export function difficultyTier(d?: string | null): string {
  const t = (d ?? '').trim();
  if (['기초', '하', '쉬움'].includes(t)) return '기초';
  if (['중급', '보통', '중'].includes(t)) return '중급';
  if (['심화', '상', '어려움'].includes(t)) return '심화';
  return '기본';
}
