/**
 * 데모 계정 공통 상수 — 체험 입구(/demo)와 로그인 화면이 같은 판정을 쓰도록 한 곳에 모은다.
 *
 * ⚠ 여기서 막는 건 **화면 편의 동선**이지 인증이 아니다. 아이디·비번을 직접 아는 사람은
 *   로그인 폼으로 여전히 들어온다(관리자 본인이 들어와야 하므로 그게 맞다).
 *   공개 링크에서 관리자 콘솔을 실제로 차단하는 건 **시드 쪽 조치**다 —
 *   `JANUS_DEMO_ADMIN_PW` 를 주고 시드하면 아래 목록의 계정만 공개값이 아닌 비번으로 심긴다
 *   (`apps/api/src/config/demo-admin-accounts.ts`). 이 파일의 목록과 그쪽 정본이 어긋나면
 *   api 유닛테스트(`demo-admin-accounts.spec.ts`)가 실패한다 — 한쪽만 고치지 말 것.
 */
export const DEMO_PW = 'dev-password!';

/** 체험 입구에서 원터치 진입을 막을 계정 — 관리자 콘솔(/admin/*)로 들어가는 역할. */
const RESTRICTED = new Set(['admin01', 'hq01', 'master01', 'hr01']);

/** HR 도 포함 — roleHome 이 /admin/dashboard 로 보내는 같은 콘솔이라 관리자와 노출 범위가 같다. */
export function isDemoRestricted(loginId: string): boolean {
  return RESTRICTED.has(loginId);
}

export const DEMO_RESTRICTED_MSG = '관리자만 접근할 수 있습니다';
