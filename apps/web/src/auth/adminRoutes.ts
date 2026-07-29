import type { Me } from '../api/types';
import { isHq } from './roleHome';

/**
 * `/admin` 라우트·메뉴의 **단일 정본**(N36 → O128).
 *
 * 왜 테이블인가: 이전에는 nav 목록(AdminLayout)과 라우트 목록(App.tsx)이 **서로 모르는 두 개의
 * 손목록**이었다. nav 31개 중 21개가 `{isAdmin && ...}` 안이라 HR 에게 숨겨졌는데 라우트 가드는
 * `/admin` 부모 하나뿐이라, HR 이 URL 을 직접 치면 **20곳이 그대로 렌더**됐다(다수는 백엔드도
 * HR 을 허용해 실제로 동작했다). 숨김은 방어가 아니라 장식이었다.
 *
 * 이제 nav 와 라우트가 **둘 다 이 배열에서 생성**되므로 두 목록이 갈라지는 것이 구조적으로
 * 불가능하다. 화면을 추가할 때 여기 한 줄만 쓰면 되고, 빠뜨리면 라우트 자체가 생기지 않는다.
 *
 * **기본은 차단**이다(deny-by-default). `roles` 에 'hr' 를 넣는 것은 기능정의서 §1.1 이 정의한
 * HR 직무(등록·승인·명부 일괄등록)에 맞거나 문서에 명시 근거가 있을 때만이다.
 *
 * 이 표는 **웹의 도달 범위**를 정하는 동시에 백엔드 권한의 기대값이기도 하다(N37 → O182).
 * `apps/api/src/modules/iam/admin-roles-drift.spec.ts` 가 이 파일을 직접 읽어, HR 에게 열린
 * API 를 **그 API 를 부르는 화면**의 역할과 대조한다. 여기서 'hr' 를 빼면 백엔드도 함께
 * 좁혀야 CI 가 통과한다 — 두 쪽이 갈라지면 테스트가 먼저 깨진다.
 */
export type AdminRoute = {
  /** `/admin` 하위 경로. App.tsx 의 element 맵 키와 1:1 이다. */
  path: string;
  /** nav 라벨. 없으면 **메뉴에 안 나오고 라우트만** 생긴다(index 리다이렉트 등). */
  label?: string;
  /** 이 화면에 들어올 수 있는 역할. 기본 차단이므로 명시한 역할만 통과한다. */
  roles: Array<Me['role']>;
  /** 본사(admin + 센터 미소속) 전용 — 센터관리자에게 숨기고 막는다. */
  hqOnly?: boolean;
  /** 센터 소속 전용 — 본사에는 의미가 없어 숨긴다(상담실·차단 등 센터 단위 기능). */
  centerOnly?: boolean;
};

const ADMIN: Array<Me['role']> = ['admin'];
const ADMIN_HR: Array<Me['role']> = ['admin', 'hr'];

export const ADMIN_ROUTES: AdminRoute[] = [
  // ── HR 직무에 맞는 것(기능정의서 §1.1 · PPL-01~05 · PPL-10) ──
  // 대시보드는 HR 의 착지 화면이다(roleHome('hr') → /admin/dashboard). 막으면 로그인 직후
  // 리다이렉트가 순환한다 → 화면은 열되 급여 기준(payBasis)은 응답에서 뺀다(O128, ops.service).
  { path: 'dashboard', label: '대시보드', roles: ADMIN_HR },
  { path: 'students', label: '학생 등록·관리', roles: ADMIN_HR },      // PPL-01~03
  { path: 'hr-teachers', label: '선생님 등록·관리', roles: ADMIN_HR },  // PPL-04·05
  { path: 'hr-staff', label: '직원·권한', roles: ADMIN_HR },           // PPL-10 'HR·관리자'
  { path: 'member-types', label: '회원 분류', roles: ADMIN_HR },       // 명부 속성
  { path: 'academic', label: '학사일정', roles: ADMIN },
  // ⚠ academic 은 nav 에 HR 이 보였는데 백엔드가 @Roles('admin') 이라 눌러도 403 이었다(역방향 불일치).
  //   백엔드에 맞춰 닫는다.

  // ── 관리자 전용 ──
  // 보호자–자녀 연결 복구(O125·O126). 백엔드는 admin·hr 을 허용하지만 **표는 더 좁게** 둔다:
  //   ① 기능정의서 권한 매트릭스에 보호자 연결 행이 없다 — 명시 근거 없이 HR 을 넣지 않는다(O128 기본 차단).
  //   ② 강제 복구(`PATCH /guardian/links/:id/respond`)는 **학생 동의를 우회**한다. 연결이 서면
  //      보호자가 성적·리포트에 닿으므로, 등록·승인 직무보다 무거운 권한이다.
  // 백엔드도 좁혔다(N37 → O182): `PATCH /guardian/links/:id/respond` 에서 'hr' 를 뺐다.
  { path: 'guardian-links', label: '보호자 연결 복구', roles: ADMIN },
  { path: 'scores', label: '성적 업로드', roles: ADMIN },              // 성적=민감정보 전량 조회·수정
  { path: 'placement/hub', label: '배치표 허브', roles: ADMIN },        // 저작권 데이터(CLAUDE.md §4)
  { path: 'membership', label: '회원 등급·구독', roles: ADMIN },
  { path: 'entitlements', label: '상품 권한', roles: ADMIN },
  { path: 'reverse', label: '역상담 대상', roles: ADMIN, centerOnly: true },
  { path: 'policy', label: '정책 편집', roles: ADMIN },
  { path: 'ops', label: '운영 설정', roles: ADMIN },
  { path: 'rooms', label: '상담실 현황', roles: ADMIN, centerOnly: true },
  { path: 'block', label: '신청불가 시간', roles: ADMIN, centerOnly: true },
  { path: 'infra', label: '줌·상담실·차단', roles: ADMIN, centerOnly: true },
  { path: 'sr-guard', label: '생기부 가드', roles: ADMIN },
  { path: 'reports', label: '신고', roles: ADMIN },
  { path: 'announcements', label: '공지', roles: ADMIN },
  { path: 'schedules', label: '근무 일괄업로드', roles: ADMIN },
  { path: 'evaluation', label: '평가·순위', roles: ADMIN },
  { path: 'assignment', label: '자동배정', roles: ADMIN },
  { path: 'analytics', label: '센터 분석', roles: ADMIN },
  { path: 'stats', label: '지표 대시보드', roles: ADMIN },              // settleAmount(급여 집계) 포함
  { path: 'diagnostics', label: '진단 문항', roles: ADMIN },
  { path: 'payroll', label: '급여 정산', roles: ADMIN },                // O127
  { path: 'audit', label: '감사 로그', roles: ADMIN },                  // 급여 금액 원문 포함(O128)
  { path: 'org', label: '조직 관리', roles: ADMIN, hqOnly: true },
  { path: 'categories', label: '카테고리 관리', roles: ADMIN, hqOnly: true },

  // ── 전 역할 공통(본인 계정) ──
  { path: 'legal', label: '약관·개인정보', roles: ADMIN_HR },
];

/** 이 사용자가 실제로 들어갈 수 있는가 — 라우트 가드와 nav 노출이 **같은 함수**를 쓴다. */
export function canAccessAdminRoute(
  user: Pick<Me, 'role' | 'center_id'> | null | undefined,
  r: AdminRoute,
): boolean {
  if (!user || !r.roles.includes(user.role)) return false;
  const hq = isHq(user);
  if (r.hqOnly && !hq) return false;
  if (r.centerOnly && hq) return false;
  return true;
}

/** 사이드바에 그릴 항목(label 이 있는 것만). 순서가 곧 메뉴 순서다. */
export function visibleAdminNav(user: Pick<Me, 'role' | 'center_id'> | null | undefined): AdminRoute[] {
  return ADMIN_ROUTES.filter((r) => r.label && canAccessAdminRoute(user, r));
}
