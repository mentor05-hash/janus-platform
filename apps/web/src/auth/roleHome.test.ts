import { describe, it, expect } from 'vitest';
import { isHq, roleHome } from './roleHome';

describe('roleHome (역할별 시작 경로)', () => {
  it('admin·hr → 관리자 대시보드', () => {
    expect(roleHome('admin')).toBe('/admin/dashboard');
    expect(roleHome('hr')).toBe('/admin/dashboard');
  });

  it('teacher → 예약 화면', () => {
    expect(roleHome('teacher')).toBe('/app/bookings');
  });

  it('student → 나의 관문 홈 (O44)', () => {
    expect(roleHome('student')).toBe('/student/home');
  });
});

describe('isHq (본사 슈퍼관리자 = admin + 센터 미소속)', () => {
  it('admin + center_id 없음 → HQ', () => {
    expect(isHq({ role: 'admin', center_id: null })).toBe(true);
  });

  it('admin + 센터 소속 → 일반 관리자', () => {
    expect(isHq({ role: 'admin', center_id: 'c1' })).toBe(false);
  });

  it('admin 이 아니면 HQ 아님', () => {
    expect(isHq({ role: 'teacher', center_id: null })).toBe(false);
  });

  it('null/undefined → false', () => {
    expect(isHq(null)).toBe(false);
    expect(isHq(undefined)).toBe(false);
  });
});
