import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_ROUTES, canAccessAdminRoute, visibleAdminNav } from './adminRoutes';
import type { Me } from '../api/types';

/**
 * N36(→O128) 회귀 방지. 고정하는 것은 '어떤 화면이 열리는가'가 아니라 **두 목록이 갈라지지 않는가**다.
 *
 * 이전 상태: nav(AdminLayout)와 라우트(App.tsx)가 서로 모르는 두 손목록이라 nav 에서 숨긴 20곳이
 * URL 직접 입력으로 그대로 열렸다. 숨김은 방어가 아니었다. 이제 둘 다 ADMIN_ROUTES 에서 나온다.
 */
const user = (role: Me['role'], center: string | null = 'c1') =>
  ({ role, center_id: center }) as Pick<Me, 'role' | 'center_id'>;

const admin = user('admin');
const hqAdmin = user('admin', null);
const hr = user('hr');

describe('ADMIN_ROUTES — 단일 정본', () => {
  it('경로가 중복되지 않는다(중복이면 뒤엣것이 조용히 죽는다)', () => {
    const paths = ADMIN_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('App.tsx 의 ADMIN_ELEMENTS 와 키가 1:1 이다 — 표에만 있으면 빈 화면, 맵에만 있으면 죽은 코드', () => {
    // App.tsx 를 파싱하는 이유: 표와 화면 맵이 갈라지는 것이 정확히 N36 이 만든 결함이라,
    // 사람 눈이 아니라 테스트가 잡아야 한다.
    const src = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    const block = src.slice(src.indexOf('const ADMIN_ELEMENTS'), src.indexOf('function AdminGuard'));
    const keys = [...block.matchAll(/^\s{2}'?([\w/-]+)'?:\s/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    expect([...keys].sort()).toEqual(ADMIN_ROUTES.map((r) => r.path).sort());
  });

  it('HR 에게 열린 화면은 직무(등록·승인·명부)에 한정된다 — 기본은 차단이다', () => {
    const hrPaths = ADMIN_ROUTES.filter((r) => canAccessAdminRoute(hr, r)).map((r) => r.path).sort();
    // 이 목록을 넓히려면 기능정의서 권한 매트릭스도 함께 고쳐야 한다(O127 이 겪은 3중 불일치 방지).
    expect(hrPaths).toEqual(
      ['dashboard', 'hr-staff', 'hr-teachers', 'legal', 'member-types', 'students'].sort(),
    );
  });

  it('급여·감사·지표는 HR 에게 닫혀 있다(O127·O128 — 급여 금액이 새던 경로)', () => {
    for (const p of ['payroll', 'audit', 'stats']) {
      const r = ADMIN_ROUTES.find((x) => x.path === p)!;
      expect(canAccessAdminRoute(hr, r), p).toBe(false);
      expect(canAccessAdminRoute(admin, r), p).toBe(true);
    }
  });

  it('HR 의 착지 화면(dashboard)은 반드시 열려 있다 — 막히면 로그인 직후 리다이렉트가 순환한다', () => {
    const dash = ADMIN_ROUTES.find((r) => r.path === 'dashboard')!;
    expect(canAccessAdminRoute(hr, dash)).toBe(true);
  });

  it('hqOnly 는 센터관리자에게, centerOnly 는 본사에게 닫힌다', () => {
    const org = ADMIN_ROUTES.find((r) => r.path === 'org')!;
    expect(canAccessAdminRoute(hqAdmin, org)).toBe(true);
    expect(canAccessAdminRoute(admin, org)).toBe(false);

    const rooms = ADMIN_ROUTES.find((r) => r.path === 'rooms')!;
    expect(canAccessAdminRoute(admin, rooms)).toBe(true);
    expect(canAccessAdminRoute(hqAdmin, rooms)).toBe(false);
  });

  it('메뉴에 보이는 것과 들어갈 수 있는 것이 같다 — 이 등식이 깨진 것이 N36 이었다', () => {
    for (const u of [admin, hqAdmin, hr]) {
      const nav = visibleAdminNav(u).map((r) => r.path);
      const reachable = ADMIN_ROUTES.filter((r) => r.label && canAccessAdminRoute(u, r)).map((r) => r.path);
      expect(nav).toEqual(reachable);
      // 반대 방향: 메뉴에 없는데 들어갈 수 있는 label 화면이 있으면 안 된다.
      const hidden = ADMIN_ROUTES.filter((r) => r.label && !nav.includes(r.path));
      for (const r of hidden) expect(canAccessAdminRoute(u, r), `${r.path} 숨김인데 접근 가능`).toBe(false);
    }
  });

  it('학생·선생님·보호자는 어떤 관리자 화면에도 못 들어간다', () => {
    for (const role of ['student', 'teacher', 'guardian'] as const) {
      const blocked = ADMIN_ROUTES.filter((r) => canAccessAdminRoute(user(role), r));
      expect(blocked.map((r) => r.path)).toEqual([]);
    }
  });
});
