/**
 * 서버가 주는 **웹 경로 → 모바일 목적지** 해석기.
 *
 * 왜 필요한가: 통합검색은 결과마다 `href` 를 실어 보낸다(API `search.hrefs.ts` — 스펙까지 있다).
 * 웹은 그 값을 그대로 쓰는데(`<Link to={h.href}>`) 모바일만 **자체 표**로 이동하고 있었고,
 * 그 표가 서버와 갈라져 4유형 중 2유형이 **다른 화면으로** 갔다:
 *   · 강좌(`/student/lectures`, 녹화 강의) → 실시간 수업(`/classes`) — 다른 도메인
 *     (그 뒤 O190 에서 이름을 갈랐고, O191 에서 모바일 강좌 화면이 생겨 이제 제자리로 간다)
 *   · 커뮤니티(`/student/community/board`) → 라운지(`/community/feed`)      — 다른 게시판
 *     (O192 에서 모바일 리그 Q&A 화면이 생겨 이제 제자리로 간다)
 * 서버 값을 버리고 자기 표를 들면 어긋나도 아무도 못 본다. 그래서 **해석만** 여기서 한다 —
 * 목적지의 정본은 계속 서버다.
 *
 * 없는 화면을 가장 비슷한 화면으로 보내지 않는다. 잘못 보내면 사용자는 "찾던 것이 없다"가 아니라
 * "이 앱이 이상하다"로 읽고, 그 편이 훨씬 나쁘다 — 없으면 없다고 말한다(`web-only`).
 */

/** 모바일 탭 키 — `App.tsx` 의 학생 탭·위성 화면 키와 같다. */
export type Resolution =
  /** `hub` 가 있으면 그 탭의 **허브 항목까지** 열어야 목적지에 닿는다(예: 처방 › 강좌). */
  | { kind: 'mobile'; tab: string; hub?: string; label: string }
  | { kind: 'web-only'; label: string; why: string }
  | { kind: 'unknown' };

/** 모바일에 대응 화면이 있는 경로. 값은 `App.tsx` 가 렌더하는 탭 키다. */
const TO_TAB: Record<string, { tab: string; hub?: string; label: string }> = {
  '/student': { tab: 'h', label: '홈' },
  '/student/diagnostic': { tab: 'dg', label: '진단' },
  '/student/qna': { tab: 'c', label: '질문' },
  '/student/community': { tab: 'f', label: '라운지' },
  '/student/materials': { tab: 'e', label: '자료실' },
  // 탭이 아니라 허브 하위 화면이다 — 탭만 주면 목록에서 한 번 더 찾아야 한다.
  '/student/lectures': { tab: 'rx', hub: 'lectures', label: '강좌' },
  '/student/community/board': { tab: 'b', hub: 'league', label: '리그 Q&A' },
  '/student/curriculum': { tab: 'rx', hub: 'curriculum', label: '학습 플랜' },
  '/student/automatch': { tab: 'b', hub: 'automatch', label: '30분 자동 매칭' },
  '/student/records': { tab: 'b', hub: 'records', label: '내 상담 기록' },
  '/student/classify': { tab: 'b', hub: 'classify', label: '선생님 분류' },
  '/student/placement/hub': { tab: 'dg', hub: 'placement', label: '배치표 허브' },
  '/student/search': { tab: 'a', label: '선생님 찾기' },
  '/student/academies': { tab: 'ac', label: '학원찾기' },
  '/student/bookings': { tab: 'b', label: '일정' },
};

/**
 * **웹에만 있는 화면** + 그 이유. 목록을 비워 두지 않는 것이 요점이다 —
 * 여기 없으면 `unknown` 이 되고, 그건 "표가 낡았다"는 신호로 읽어야 한다.
 */
const WEB_ONLY: Record<string, { label: string; why: string }> = {
};

/** 쿼리·해시를 떼고 끝 슬래시를 정리한다(서버가 붙여 보내도 표와 맞도록). */
function normalize(href: string): string {
  const path = href.split('?')[0].split('#')[0];
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

export function resolveWebPath(href: string | null | undefined): Resolution {
  if (!href) return { kind: 'unknown' };
  const path = normalize(href);
  const hit = TO_TAB[path];
  if (hit) return { kind: 'mobile', ...hit };
  const web = WEB_ONLY[path];
  if (web) return { kind: 'web-only', ...web };
  return { kind: 'unknown' };
}
