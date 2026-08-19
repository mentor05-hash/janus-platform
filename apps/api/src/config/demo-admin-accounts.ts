/**
 * 데모 계정 비밀번호 정책 — **관리자 콘솔 계열만 분리할 수 있는 탈출구**.
 *
 * 왜 필요한가: 공개 데모(Tailscale Funnel 고정 주소)에서 `/demo` 체험 입구는 관리자 계정의
 * **원터치 진입**만 막는다. 아이디·비번을 아는 사람은 로그인 폼으로 그대로 들어온다 —
 * 그런데 그 비번은 README·문서 여러 곳에 공개돼 있는 `dev-password!` 다.
 * 즉 공개 주소에서 관리자 콘솔이 사실상 열려 있었다(`apps/web/src/auth/demoAccounts.ts` 의
 * 주석이 "별도 조치가 필요하다"고 남겨둔 항목).
 *
 * 어떻게 막나: 시드가 관리자 계열 계정만 `JANUS_DEMO_ADMIN_PW` 값으로 해시한다.
 * **미설정이면 기존과 완전히 동일**(`dev-password!`) — CI·로컬 개발·기존 e2e 는 아무것도 바뀌지 않는다.
 * 공개 데모를 띄우는 쪽에서만 ENV 를 주면 된다.
 *
 *   JANUS_DEMO_ADMIN_PW='...' npm run seed
 *
 * ⚠ 시드는 `ON CONFLICT ... DO UPDATE SET pw_hash = EXCLUDED.pw_hash` 로 **비밀번호를 강제로
 *   덮어쓴다**. 그래서 DB 에서 손으로 바꿔 두면 다음 시드 한 번에 조용히 원복된다.
 *   반드시 이 ENV 로 막을 것 — 그래야 재시드해도 유지된다.
 */

/** 데모 계정 공통 비밀번호(로컬·CI 기본값). 관리자 계열도 ENV 미설정이면 이 값이다. */
export const DEMO_DEFAULT_PW = 'dev-password!';

/** 분리 대상 ENV 이름. */
export const DEMO_ADMIN_PW_ENV = 'JANUS_DEMO_ADMIN_PW';

/**
 * 관리자 콘솔(`/admin/*`)로 들어가는 계정 — 공개 데모에서 비밀번호를 분리할 대상.
 * HR 도 포함한다: roleHome 이 같은 콘솔로 보내므로 노출 범위가 관리자와 같다.
 *
 * 정본이다. 웹의 `apps/web/src/auth/demoAccounts.ts` 의 `RESTRICTED` 와 **같은 목록이어야 하며**,
 * 어긋나면 `demo-admin-accounts.spec.ts` 가 실패한다(한쪽만 고치고 끝나는 사고 방지).
 */
export const DEMO_ADMIN_LOGIN_IDS = [
  'admin01',
  'hq01',
  'master01',
  'hr01',
] as const;

export type DemoAdminLoginId = (typeof DEMO_ADMIN_LOGIN_IDS)[number];

export function isDemoAdminAccount(loginId: string): boolean {
  return (DEMO_ADMIN_LOGIN_IDS as readonly string[]).includes(loginId);
}

/** ENV 에 실제 값이 들어있을 때만 분리값을 돌려준다(빈 문자열·공백은 미설정으로 본다). */
export function demoAdminPassword(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env[DEMO_ADMIN_PW_ENV];
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v.length > 0 ? v : null;
}

/** 이 계정이 시드될 비밀번호. 관리자 계열 + ENV 설정 시에만 분리값, 그 외 전부 기본값. */
export function demoPasswordFor(
  loginId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const split = demoAdminPassword(env);
  return split && isDemoAdminAccount(loginId) ? split : DEMO_DEFAULT_PW;
}
