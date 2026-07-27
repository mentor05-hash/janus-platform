/**
 * @mentoring/guard-school-record — 생기부 가드(공용 모듈)
 *
 * 학교생활기록부(생기부) 업로드를 감지·차단한다.
 * 핵심 불변식(무취급): 판정 함수는 바이트를 받아 **boolean + 사유** 만 반환하며,
 * 원본·추출 텍스트를 파일·DB·로그 어떤 경로에도 영속화하지 않는다.
 */
export {
  inspectForSchoolRecord,
  inspectForSchoolRecordSync,
} from './guard';

export {
  DEFAULT_POLICY,
  DEFAULT_FILENAME_PATTERNS,
  SCHOOL_RECORD_KEYWORDS,
  resolvePolicy,
} from './policy';

export { REASON } from './reasons';
export type { ReasonCode, GuardStage } from './reasons';

export type {
  GuardInput,
  GuardVerdict,
  GuardDeps,
  SchoolRecordGuardPolicy,
  PartialSchoolRecordGuardPolicy,
  VisionClassifier,
  VisionProbe,
  VisionResult,
  VisionLabel,
} from './types';
