import type { Me } from '../api/types';

/** 로그인 후 역할별 시작 경로. */
export function roleHome(role: Me['role']): string {
  if (role === 'admin' || role === 'hr') return '/admin/dashboard';
  if (role === 'student') return '/student'; // 학생 웹 — "나의 관문" 대시보드
  if (role === 'guardian') return '/guardian/report'; // 학부모 — 자녀 주간 통합 리포트(웹 진입점)
  return '/app/bookings'; // teacher (보호자 주 사용은 mobile)
}

/** 본사(HQ) 슈퍼관리자 = admin + 센터 미소속(center_id NULL). */
export function isHq(user: Pick<Me, 'role' | 'center_id'> | null | undefined): boolean {
  return !!user && user.role === 'admin' && !user.center_id;
}
