import type { SsoTier } from './token';

/**
 * SSO 서비스 레지스트리 — 설계 §3(`sso_service` 테이블)의 코드 시드.
 * v1 은 정적 상수(신규 서비스 추가 = 이 배열에 항목 1개). W3 후속에서 DB 테이블 +
 * 관리자 CRUD 로 승격(그때 이 시드가 초기 행). aud/min_tier/scope/redirect_origins 는
 * 그대로 컬럼 대응.
 */

const TIER_RANK: Record<SsoTier, number> = { free: 0, member: 1, paid: 2, consultant: 3 };

export type SsoServiceDef = {
  id: string; // aud 값
  name: string; // 표시명
  allowedScopes: string[]; // 발급 가능 상한
  minTier: SsoTier; // 진입 최소 티어
  epoch: number; // 일괄 폐기 카운터
  /** 토큰 전달 허용 origin(오픈 리다이렉트 방지). */
  redirectOrigins: string[];
  /** `?sso=<token>` 를 붙일 진입 URL(origin 은 redirectOrigins 중 하나여야 함). */
  launchUrl: string;
};

/** 티어 게이트: actor 티어가 서비스 최소 티어 이상인가. */
export const tierMeets = (actual: SsoTier, min: SsoTier): boolean => TIER_RANK[actual] >= TIER_RANK[min];

/**
 * 파트너 허브 연계 서비스(설계 §3 + `apps/web/src/pages/SitePage.tsx` SLUGS).
 * 학습 플래너(planner)는 현재 "파트너 모집" 단계 → 로그인 사용자 누구나 진입 가능하도록 minTier='free'.
 * 배치표·입결 등 데이터 서비스는 회원 게이트(minTier='member').
 * origin 은 ENV(SSO_REDIRECT_ORIGIN)로 오버라이드 가능(기본 로컬).
 */
export function buildRegistry(origin: string): Record<string, SsoServiceDef> {
  const defs: SsoServiceDef[] = [
    { id: 'planner', name: '학습 플래너', allowedScopes: ['view', 'sync-plan'], minTier: 'free', epoch: 1, redirectOrigins: [origin], launchUrl: `${origin}/site/svc-planner.html` },
    { id: 'baechipyo', name: '대학 배치표', allowedScopes: ['view', 'ingest-score'], minTier: 'member', epoch: 1, redirectOrigins: [origin], launchUrl: `${origin}/site/svc-baechi.html` },
    { id: 'ipgyeol', name: '입결·경쟁률', allowedScopes: ['view'], minTier: 'member', epoch: 1, redirectOrigins: [origin], launchUrl: `${origin}/site/svc-ipgyeol.html` },
    { id: 'mock', name: '모의고사·성적', allowedScopes: ['view', 'ingest-score'], minTier: 'member', epoch: 1, redirectOrigins: [origin], launchUrl: `${origin}/site/svc-mock.html` },
    { id: 'jaso', name: '자소서·면접', allowedScopes: ['view'], minTier: 'free', epoch: 1, redirectOrigins: [origin], launchUrl: `${origin}/site/svc-jaso.html` },
  ];
  return Object.fromEntries(defs.map((d) => [d.id, d]));
}

/** launchUrl 의 origin 이 redirectOrigins 화이트리스트에 있는지(오픈 리다이렉트 방지). */
export function isAllowedRedirect(def: SsoServiceDef): boolean {
  try {
    return def.redirectOrigins.includes(new URL(def.launchUrl).origin);
  } catch {
    return false;
  }
}
