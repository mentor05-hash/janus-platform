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
