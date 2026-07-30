/**
 * 역할별 사이드바의 **단일 정본**.
 *
 * 왜 파일로 뺐나: O128 이 `/admin` 에서 배운 것과 같은 이유다 — nav 가 레이아웃 컴포넌트 안에
 * 배열 리터럴로 박혀 있으면 **라우트 목록과 갈라지는 것을 아무도 못 본다**. 실제로 갈라져 있었다:
 * `/student/league`(리더보드)·`/student/league/rules`(리그 규칙)은 라우트는 있는데 사이드바
 * 진입점이 **0개**였다(아래 `NAV_EXEMPT` 참조). 표를 파일로 두면 테스트가 읽어 대조할 수 있다.
 *
 * ── 대항목은 모바일 하단 탭과 같은 이름·순서다 ──────────────────────────────
 * 디자인 브리프 §2 가 모바일 탭을 5개로 못박았고(N30 으로 적용), 웹은 도메인 축으로 따로
 * 묶여 있어 두 플랫폼이 다른 말을 썼다. 이제 **대항목 = 모바일 탭**으로 맞춘다.
 *
 * ⚠ 라벨만 베끼지 않았다. 모바일 '진단' 탭은 실력진단 한 화면이고 '내정보' 탭은 12개 항목
 *   허브다 — 화면이 좁아 다섯으로 묶어야 했던 제약이다. 그대로 옮기면 웹 내정보에 15개가
 *   쏟아진다. 그래서 **이름·순서는 모바일과 같게, 각 대항목의 정의는 사용자 의도로 넓혀서**
 *   담고, 무거워지는 대항목만 소그룹을 둔다(데스크톱은 한 번에 더 보여줄 수 있다).
 *
 * 후속: 모바일 '내정보' 12개를 같은 축으로 슬림화해야 **같은 이름의 대항목이 같은 내용**을
 * 담는다(성적진단·격차·목표·할 일 → 진단 / 채팅·자동배정·자동매칭 → 일정).
 */

/** 실제 이동하는 항목. `flag` 는 정책으로 숨길 수 있는 항목(성적 노출). */
export type NavLeaf = {
  to: string;
  label: string;
  end?: boolean;
  flag?: 'scores';
};
/** 대항목 — 모바일 하단 탭과 1:1. 5개(학부모는 4개)를 넘기지 않는다. */
export type NavGroup = { group: string };
/** 소그룹 — 대항목이 무거울 때만. 대항목 수를 늘리지 않으려는 장치다. */
export type NavSub = { sub: string };
export type NavItem = NavLeaf | NavGroup | NavSub;

export const isLeaf = (n: NavItem): n is NavLeaf => 'to' in n;
export const isGroup = (n: NavItem): n is NavGroup => 'group' in n;
export const isSub = (n: NavItem): n is NavSub => 'sub' in n;

export const leavesOf = (nav: NavItem[]): NavLeaf[] => nav.filter(isLeaf);
export const groupsOf = (nav: NavItem[]): string[] =>
  nav.filter(isGroup).map((g) => g.group);

/**
 * 모바일 하단 탭 — `apps/mobile/App.tsx` 의 `tabs`·`*Label` 에서 옮긴 값.
 * 테스트가 이 값과 대항목을 대조하므로, 모바일 탭이 바뀌면 여기도 바뀌어야 한다(의도).
 */
export const MOBILE_TABS = {
  student: ['홈', '질문', '진단', '일정', '내정보'],
  teacher: ['인박스', '오늘', '상담', '기록', '마이'],
  /**
   * 모바일 학부모 탭도 4개로 맞췄다(2026-07-30). 이전에는 홈·상담·**멤버십·결제·충전** 5개로
   * 결제 계열이 3탭을 차지했는데, 웹에서 그 셋은 `결제·충전` **한 화면**이었다. 결제에 과대
   * 대표된 만큼 '동의·본인확인'이 탭에서 밀려나 **상담 탭 안에 묻혀** 있었다 — 미성년 자녀
   * 정보 전달의 법적 관문인데 상담 리포트를 보러 들어가야 만나는 위치였다.
   * → 모바일도 홈·상담·결제(충전·멤버십 흡수)·내정보(동의·본인확인)로 통일.
   */
  guardian: ['홈', '상담', '결제', '내정보'],
} as const;

// ────────────────────────────── 학생 ──────────────────────────────

export const STUDENT_NAV: NavItem[] = [
  { group: '홈' },
  { to: '/student', label: '나의 관문', end: true },

  { group: '질문' },
  { to: '/student/qna', label: '질문 게시판' },
  { to: '/student/community', label: '라운지', end: true },
  { to: '/student/community/board', label: '리그 Q&A' },

  { group: '진단' },
  { sub: '진단하기' },
  { to: '/student/diagnostic', label: '실력진단' },
  { to: '/student/scores/input', label: '성적진단' },
  { sub: '내 위치' },
  { to: '/student/scores', label: '내 성적·배치', flag: 'scores', end: true },
  // 이름은 **고도**를 드러낸다(O102) — 전략층(목표 대학 컷 대비)과 실행층(과목 점수 대비)은
  // 다른 화면이다. 두 이름이 '격차'만 공유하면 사용자가 무엇이 다른지 구분할 수 없다.
  { to: '/student/gap', label: '과목별 점수 격차' },
  // ⚠ flag 없이 둔다. 제품 전면(랜딩·홈)이 가장 많이 쓰는 이름인데 nav 진입점이 0개였고,
  //   '내 성적·배치'의 격차 탭은 flag:'scores' 라 성적 노출 정책이 OFF 면 유일한 경로마저 사라졌다.
  { to: '/student/placement/gap', label: '목표 대학 격차(격차 리포트)' },
  { to: '/student/placement/hub', label: '배치표 허브' },
  // 강좌·자료실이 '처방'에 있는 이유: 진단 결과로 **받는 학습 자원**이다.
  // (초안에서는 '일정 › 배우기'였다 — 상담처럼 시간을 쓰는 활동으로 봤다. 사용자 판단으로
  //  진단→처방 흐름 쪽으로 옮겼다: 무엇을 볼지는 격차·목표가 정하므로 그 옆에 있어야 한다.)
  { sub: '처방' },
  { to: '/student/goal', label: '목표 설정' },
  { to: '/student/curriculum', label: '학습 플랜' },
  { to: '/student/lectures', label: '강좌' },
  { to: '/student/materials', label: '자료실' },

  { group: '일정' },
  { sub: '상담 잡기' },
  { to: '/student/search', label: '선생님 찾기' },
  { to: '/student/academies', label: '학원찾기' },
  { to: '/student/auto-assign', label: '자동배정 신청' },
  { to: '/student/reverse', label: '역상담' },
  { sub: '내 일정' },
  { to: '/student/bookings', label: '내 예약·상담' },
  { to: '/student/academic', label: '학사일정' },
  { to: '/student/tasks', label: '할 일' },
  { sub: '상담 후' },
  { to: '/student/chats', label: '채팅' },
  { to: '/student/reports', label: '상담 리포트' },

  { group: '내정보' },
  { to: '/student/membership', label: '멤버십·결제' },
  { to: '/student/credits', label: '크레딧' },
  { to: '/student/notifications', label: '알림' },
  { to: '/student/legal', label: '약관·개인정보' },
];

// ────────────────────────────── 선생님 ──────────────────────────────

/** 이전에는 섹션 없는 평면 20개였다 — 대항목을 모바일 탭(인박스·오늘·상담·기록·마이)으로 도입. */
export const TEACHER_NAV: NavItem[] = [
  { group: '인박스' },
  { to: '/app/inbox', label: '인박스' },
  { to: '/app/qna', label: '질문 답변' },
  { to: '/app/community', label: '커뮤니티 Q&A' },

  { group: '오늘' },
  { to: '/app/dashboard', label: '대시보드' },
  { to: '/app/schedule', label: '근무·슬롯' },
  { to: '/app/classes', label: '강의실' },

  { group: '상담' },
  { to: '/app/bookings', label: '예약' },
  { to: '/app/chats', label: '채팅' },
  { to: '/app/reverse', label: '역상담 제안' },
  // 선생님에게 배치표는 결과물이 아니라 **상담 중에 펼쳐 보는 참고 도구**다.
  // '기록'에 두면 지난 것으로 읽힌다.
  { to: '/app/placement/hub', label: '배치표 허브' },

  { group: '기록' },
  { to: '/app/records', label: '상담 기록' },
  { to: '/app/reports', label: '상담 리포트' },
  { to: '/app/evaluations', label: '받은 평가' },

  { group: '마이' },
  { sub: '내 활동' },
  { to: '/app/lectures', label: '내 강좌' },
  { to: '/app/materials', label: '자료실' },
  { to: '/app/academy-manage', label: '학원 관리' },
  { sub: '정산' },
  { to: '/app/payroll', label: '예상급여' },
  { sub: '계정' },
  { to: '/app/profile', label: '내 프로필' },
  { to: '/app/notifications', label: '알림' },
  { to: '/app/legal', label: '약관·개인정보' },
];

// ────────────────────────────── 학부모 ──────────────────────────────

export const GUARDIAN_NAV: NavItem[] = [
  { group: '홈' },
  { to: '/guardian/report', label: '주간 리포트' },
  { to: '/guardian/plan', label: '자녀 계획' },
  { to: '/guardian/notifications', label: '알림' },

  { group: '상담' },
  { to: '/guardian/consult-reports', label: '상담 리포트' },
  { to: '/guardian/community', label: '커뮤니티 Q&A' },

  { group: '결제' },
  { to: '/guardian/pay', label: '결제·충전' },

  { group: '내정보' },
  { to: '/guardian/consent', label: '동의·본인확인' },
  // 2026-07-30 신설. 학부모는 **웹·모바일 양쪽 모두** 이 화면에 도달할 수 없었다 —
  // nav 누락이 아니라 라우트 자체가 없었다. 학생·선생님에는 있는데 학부모만 없어서
  // 개인정보 처리방침·데이터 내보내기·회원 탈퇴 경로가 없는 상태였다(O185 에서 갭으로 기록).
  { to: '/guardian/legal', label: '약관·개인정보' },
];

// ────────────────────────────── 예외 ──────────────────────────────

/**
 * **라우트는 있으나 사이드바에 두지 않는 경로** + 그 이유.
 *
 * 조용히 빠지는 것을 막기 위한 목록이다 — 여기 없는데 nav 에도 없으면 테스트가 실패한다.
 * "화면이 있는데 갈 길이 없다"가 O128 이 잡은 결함의 형태였고, 그건 목록이 없어서 안 보였다.
 */
export const NAV_EXEMPT: Record<string, string> = {
  '/student/search-all': '통합검색 결과 — 사이드바 검색 입력으로만 도달한다(질의가 있어야 의미가 있는 화면).',
  // ⚠ 발견(2026-07-30): 이 둘은 nav·페이지 어디에서도 링크되지 않아 URL 직접 입력 외에 길이 없었다.
  //   그런데 '리그 Q&A'(`/student/community/board`)가 순위표·승급 규칙을 **인라인으로 이미 보여준다**
  //   (`/qna/league/leaderboard`·`/qna/league/rules` 호출). 중복 항목을 nav 에 새로 만드는 대신
  //   여기 근거를 남긴다 — **삭제할지 인라인을 떼어낼지는 별도 결정**이다.
  '/student/league': '리그 순위표 — 리그 Q&A 안에 인라인으로 있다(중복). 존치/삭제는 후속 결정.',
  '/student/league/rules': '리그 승급 규칙 — 같은 이유. `/student/league` 에서만 링크된다.',
};

/** 상세·하위 화면은 목록에 둘 것이 아니다 — 부모 화면에서 진입한다. */
export const isDetailRoute = (path: string): boolean => path.includes(':');
