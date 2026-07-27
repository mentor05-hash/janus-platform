import { REASON } from '@mentoring/guard-school-record';
import type { ReasonCode } from '@mentoring/guard-school-record';

/**
 * 생기부 가드 차단 응답 메시지(§4-b) — 서버측 단일 출처.
 * 조문 표기("제25조의2")는 지시서 §4 주석대로 법률 자문 후 확정 치환 대상.
 * 리치 모달(제목·대안·문의 링크)은 웹의 §4-b 컴포넌트가 사유 코드(SR_*)로 렌더한다.
 */
const BASE =
  '첨부하신 파일에서 학교생활기록부로 판단되는 내용이 확인되었습니다. ' +
  '관련 법령(제25조의2)에 따라 저희 서비스는 생활기록부를 제공받을 수 없으며, ' +
  '해당 파일은 저장되지 않고 즉시 삭제되었습니다. ' +
  '필요한 정보가 성적·과목이라면 직접 입력 또는 성적표(모의고사·내신 성적통지표) 업로드를 이용해 주세요.';

const UNSURE =
  '첨부하신 파일이 학교생활기록부일 가능성이 있어 보수적으로 차단되었습니다. ' +
  '관련 법령(제25조의2)에 따라 생활기록부는 제공받을 수 없으며, 해당 파일은 저장되지 않았습니다. ' +
  '생활기록부가 아니라면 [문의하기]로 알려주세요. 확인 후 도와드리겠습니다.';

const MESSAGES: Record<ReasonCode, string> = {
  [REASON.FILENAME]: BASE,
  [REASON.KEYWORD]: BASE,
  [REASON.VISION]: BASE,
  [REASON.UNSURE]: UNSURE,
};

/** 사유 코드 → 사용자 고지 문구(§4-b). */
export function messageFor(reason: ReasonCode): string {
  return MESSAGES[reason] ?? BASE;
}
