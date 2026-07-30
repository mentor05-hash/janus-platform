/**
 * 모바일 탭·허브의 **데이터 정본** — 웹 사이드바(`roleNav.ts`)의 짝.
 *
 * 왜 패키지로 옮겼나(2026-07-30): 두 정본이 각 앱 안에 따로 있으면 **주석으로만 짝**이다.
 * 웹 테스트는 웹만 읽으므로 모바일이 갈라져도 초록이었고, 실제로 결손 24건·오연결 4건이
 * 그렇게 쌓였다(O186). 데이터를 한 패키지에 두면 **한 테스트가 양쪽을 대조**할 수 있다.
 *
 * 여기에는 **데이터와 순수 함수만** 둔다 — 화면 렌더(`useHub`·`HubMenu`)는 RN 의존이라
 * 앱(`apps/mobile/src/nav/hubMenu.tsx`)에 남는다.
 *
 * 축은 웹이 정한 것을 그대로 따른다:
 *   진단   내 위치를 아는 일 — 성적진단·격차·목표·내 성적·배치(+ 자료실)
 *   일정   시간을 쓰는 일 — 선생님 찾기·학원찾기·강의실·채팅·자동매칭·자동배정·할 일·기록·리포트
 *   내정보 계정에 관한 일 — 선생님 분류·약관(+ 구독·크레딧·알림은 MyScreen 본문)
 */

export type HubKey =
  | 'scoreInput' | 'gap' | 'goal' | 'scores'
  | 'chats' | 'automatch' | 'autoassign' | 'tasks' | 'records' | 'reports'
  | 'classify' | 'legal'
  // 아래 넷은 서브화면이 아니라 **다른 탭으로 보내는 항목**이다(`jump` 참조).
  | 'toSearch' | 'toAcademy' | 'toClassroom' | 'toMaterials';

/** 모바일 탭 키 — `App.tsx` 의 학생 탭과 같다(dg 진단 · b 일정 · d 내정보). */
export type HubTab = 'dg' | 'b' | 'd';

/** `jump` 가 있으면 하위 화면을 여는 대신 그 탭으로 이동한다. */
export type HubItem = { key: HubKey; tab: HubTab; icon: string; title: string; desc: string; jump?: string };

/**
 * **탭 밖 화면의 소속 탭**(위성 → 대항목).
 *
 * `App.tsx` 는 이 다섯을 렌더하지만 하단 탭 배열에는 없다 — 홈 바로가기·검색으로만 들어간다.
 * 그 결과 들어가면 하단 탭 활성 표시가 **전부 꺼져** 사용자가 자기 위치를 잃었다.
 * 웹에서는 다섯 모두 정식 사이드바 항목이므로, 웹이 정한 대항목을 그대로 소속으로 삼는다:
 *   선생님 찾기·학원찾기 → 일정(상담 잡기) · 자료실 → 진단(처방) · 라운지 → 질문
 * 강의실(실시간 수업)만 웹 학생 nav 에 짝이 없는데, 예약의 실행이므로 일정에 둔다.
 */
export const SATELLITE_PARENT: Record<string, string> = {
  a: 'b', ac: 'b', r: 'b', e: 'dg', f: 'c',
};

/** 하위 화면의 '뒤로' 라벨 — 어느 탭에서 들어왔는지 말해 준다. */
export const TAB_LABEL: Record<HubTab, string> = { dg: '진단', b: '일정', d: '내정보' };

/**
 * 순서가 곧 우선순위다. 성적 입력이 '진단' 맨 앞인 이유는 그대로다 —
 * 격차·목표·할 일이 **전부 성적에 의존**해서, 입력 경로가 없으면 그 화면들이 빈다.
 */
export const HUB_ITEMS: HubItem[] = [
  // ── 진단 — 내 위치를 아는 일 ──
  { key: 'scoreInput', tab: 'dg', icon: '📝', title: '성적진단', desc: '성적 한 번 입력 → 배치·격차·할 일 자동 반영' },
  { key: 'scores', tab: 'dg', icon: '📈', title: '내 성적·배치', desc: '성적 추이 + 예상 대학·학과 라인' },
  { key: 'gap', tab: 'dg', icon: '🎯', title: '격차 리포트', desc: '지금 위치 → 목표까지 과목별 격차와 처방' },
  { key: 'goal', tab: 'dg', icon: '🏁', title: '목표 설정', desc: '목표 대학·학과·평균 — 격차·할 일 기준' },
  { key: 'toMaterials', tab: 'dg', jump: 'e', icon: '▦', title: '자료실', desc: '진단 결과에 맞는 학습 자료' },

  // ── 일정 — 시간을 쓰는 일 ──
  { key: 'toSearch', tab: 'b', jump: 'a', icon: '◇', title: '선생님 찾기', desc: '상담·과외 1:1 매칭' },
  { key: 'toAcademy', tab: 'b', jump: 'ac', icon: '🏫', title: '학원찾기', desc: '동네·과목별 학원 비교' },
  { key: 'toClassroom', tab: 'b', jump: 'r', icon: '▶', title: '강의실', desc: '예약된 실시간 수업 입장' },
  { key: 'chats', tab: 'b', icon: '💬', title: '채팅', desc: '상담 대화 모아보기 — 안 읽은 메시지 확인' },
  { key: 'automatch', tab: 'b', icon: '⚡', title: '30분 자동 매칭', desc: '유형·방식만 고르면 7일 내 가장 빠른 30분' },
  { key: 'autoassign', tab: 'b', icon: '🗓', title: '자동배정 신청', desc: '시간 안 정해도 전임 선생님 근무시간에 배정' },
  { key: 'tasks', tab: 'b', icon: '✅', title: '할 일', desc: '약점·학사일정 자동 제안 + 직접 추가' },
  { key: 'records', tab: 'b', icon: '📝', title: '내 상담 기록', desc: '공개된 핵심요약·숙제·향후방향 확인' },
  { key: 'reports', tab: 'b', icon: '📋', title: '상담 리포트', desc: '녹음 동의 상담의 검수된 요약 리포트' },

  // ── 내정보 — 계정에 관한 일 ──
  { key: 'classify', tab: 'd', icon: '💚', title: '선생님 분류', desc: '나와 맞는 / 맞지 않는 선생님 관리' },
  { key: 'legal', tab: 'd', icon: '🔒', title: '약관·개인정보', desc: '약관·방침·동의·데이터 내보내기·회원 탈퇴' },
];

export const itemsOf = (tab: HubTab): HubItem[] => HUB_ITEMS.filter((i) => i.tab === tab);

/** 하위 화면이 아니라 다른 탭으로 보내는 항목인가. */
export const jumpOf = (key: HubKey): string | undefined => HUB_ITEMS.find((i) => i.key === key)?.jump;
