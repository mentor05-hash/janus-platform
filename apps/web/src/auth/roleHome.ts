import type { Me } from '../api/types';

/** 로그인 후 역할별 시작 경로. */
export function roleHome(role: Me['role']): string {
  if (role === 'admin' || role === 'hr') return '/admin/dashboard';
  if (role === 'student') return '/student/home'; // 학생 웹 — "나의 관문" 홈(O44)
  return '/app/bookings'; // teacher (보호자는 mobile)
}

/** 본사(HQ) 슈퍼관리자 = admin + 센터 미소속(center_id NULL). */
export function isHq(user: Pick<Me, 'role' | 'center_id'> | null | undefined): boolean {
  return !!user && user.role === 'admin' && !user.center_id;
}
