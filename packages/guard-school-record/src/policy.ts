import type {
  PartialSchoolRecordGuardPolicy,
  SchoolRecordGuardPolicy,
} from './types';

/**
 * 학교생활기록부(생기부) 서식 고유 섹션 표제어.
 *
 * 성적통지표·일반 학습자료에는 등장하지 않고 생기부 서식에만 나타나는 표제를 골랐다.
 * '교과'·'성적'처럼 흔한 단어는 오탐을 부르므로 넣지 않는다.
 * (가운뎃점/공백 변형은 매칭 시 정규화로 흡수한다 — normalize 참고.)
 */
export const SCHOOL_RECORD_KEYWORDS: readonly string[] = [
  '학교생활기록부',
  '학교생활세부사항기록부',
  '인적·학적사항',
  '학적사항',
  '출결상황',
  '수상경력',
  '자격증 및 인증 취득상황',
  '창의적 체험활동상황',
  '자율활동',
  '동아리활동',
  '진로활동',
  '봉사활동실적',
  '교과학습발달상황',
  '세부능력 및 특기사항',
  '독서활동상황',
  '행동특성 및 종합의견',
  '자유학기활동상황',
];

/** 파일명 매칭 기본 패턴(정규식 소스 문자열, 대소문자 무시 — §5 1단). */
export const DEFAULT_FILENAME_PATTERNS: readonly string[] = [
  '학교생활기록부',
  '학생생활기록부',
  '생활기록부',
  '생기부',
  '학생부',
  'school.?record',
];

/** 코드에 두는 안전한 기본 정책. 운영값은 서버 정책으로 덮어쓴다. */
export const DEFAULT_POLICY: SchoolRecordGuardPolicy = {
  enabled: true,
  filenamePatterns: [...DEFAULT_FILENAME_PATTERNS],
  keywordThreshold: 2,
  llmCheck: false,
};

/**
 * 부분 정책을 기본값 위에 병합하고 최소 유효성을 보장한다.
 * - keywordThreshold는 1 이상으로 클램프.
 * - filenamePatterns가 지정되면 그대로, 아니면 기본값 복제.
 */
export function resolvePolicy(
  partial?: PartialSchoolRecordGuardPolicy,
): SchoolRecordGuardPolicy {
  const merged: SchoolRecordGuardPolicy = {
    ...DEFAULT_POLICY,
    filenamePatterns: [...DEFAULT_POLICY.filenamePatterns],
    ...partial,
  };
  if (
    !Number.isFinite(merged.keywordThreshold) ||
    merged.keywordThreshold < 1
  ) {
    merged.keywordThreshold = 1;
  }
  merged.keywordThreshold = Math.floor(merged.keywordThreshold);
  if (!Array.isArray(merged.filenamePatterns)) {
    merged.filenamePatterns = [...DEFAULT_POLICY.filenamePatterns];
  }
  return merged;
}
