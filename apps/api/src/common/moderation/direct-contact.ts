/**
 * 직거래·연락처 교환 감지(C1 — 큐브류 플랫폼 공통 운영 정책).
 * 정책: 차단하지 않는다 — 발신자 경고 + audit_log 기록(관리자 신호)만. 오탐이 사용자 경험을
 * 해치지 않도록 "감지·기록 우선" 설계. 패턴 보수적 유지(확장은 운영 데이터 기반).
 */
export type ContactKind =
  'phone' | 'kakao' | 'sns' | 'email' | 'account' | 'direct';

const PATTERNS: Array<[ContactKind, RegExp]> = [
  ['phone', /01[016789][ .\-]?\d{3,4}[ .\-]?\d{4}/],
  ['email', /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ['kakao', /(카톡|카카오\s?톡|kakao\s?talk)/i],
  ['sns', /(텔레그램|인스타\s?(그램)?\s?(아이디|디엠|dm))/i],
  [
    'account',
    /(국민|신한|우리|하나|농협|기업|카카오뱅크|토스)\s?(은행)?[^\n]{0,10}\d{6,}/,
  ],
  [
    'direct',
    /((직접|개인적으로|따로)\s*(연락|거래|만나|수업))|수수료\s*없이|(계좌|입금)\s*번호/,
  ],
];

/** 텍스트에서 직거래·연락처 패턴 감지 — 발견된 종류 목록(비어 있으면 정상). */
export function detectDirectContact(
  text: string | null | undefined,
): ContactKind[] {
  if (!text) return [];
  const kinds: ContactKind[] = [];
  for (const [kind, re] of PATTERNS) {
    if (re.test(text)) kinds.push(kind);
  }
  return kinds;
}

/** 발신자 경고 문구(공통) — 감지 종류와 무관하게 동일 문구(과잉 특정으로 회피 유도 방지). */
export const DIRECT_CONTACT_WARNING =
  '연락처 교환·외부 거래 관련 표현이 감지되었습니다. 야누스 밖 직거래는 분쟁 시 보호받을 수 없으며, 반복 시 이용이 제한될 수 있어요.';
