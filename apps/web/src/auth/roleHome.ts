import type { Me } from '../api/types';

/** 로그인 후 역할별 시작 경로. */
export function roleHome(role: Me['role']): string {
  if (role === 'admin' || role === 'hr') return '/admin/dashboard';
  return '/app/bookings'; // teacher (학생·보호자는 mobile)
}
