import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GUARDIAN_NAV,
  MOBILE_TABS,
  NAV_EXEMPT,
  STUDENT_NAV,
  TEACHER_NAV,
  groupsOf,
  isDetailRoute,
  leavesOf,
  type NavItem,
} from '@mentoring/nav';

/**
 * 사이드바 ↔ 라우트 ↔ 모바일 탭 **드리프트 검출**.
 *
 * O128 이 `/admin` 에서 겪은 일이 이 검사의 이유다: nav 목록과 라우트 목록이 서로를 모른 채
 * 갈라져, 메뉴에서 숨긴 화면 20곳이 URL 로는 그대로 열렸다. 반대 방향도 같은 병이다 —
 * **라우트는 있는데 갈 길이 없는 화면**. 실제로 학생 `/student/league`·`/student/league/rules`
 * 가 그 상태였고, 목록이 없어 아무도 보지 못했다.
 *
 * 그래서 세 가지를 고정한다:
 *   ① 대항목이 모바일 하단 탭과 같은 이름·순서인가 (동기화의 실체)
 *   ② 라우트가 전부 사이드바에서 도달 가능한가 (예외는 `NAV_EXEMPT` 에 이유와 함께)
 *   ③ 사이드바 항목이 전부 실제 라우트인가 (죽은 링크 금지)
 */

const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');

/** `App.tsx` 의 역할별 `<Route>` 블록에서 실제 경로를 뽑는다. */
function routesUnder(prefix: string): string[] {
  const at = APP.indexOf(`path="${prefix}"`);
  if (at < 0) throw new Error(`App.tsx 에 ${prefix} 라우트 블록이 없다`);
  const block = APP.slice(at, APP.indexOf('</Route>', at));
  const out = [...block.matchAll(/<Route (?:index )?path="([^"]*)"/g)].map(
    (m) => `${prefix}/${m[1]}`,
  );
  // index 라우트는 부모 경로 자체다(예: `/student` = 나의 관문).
  // 단 `<Navigate>` 인 index 는 **목적지가 아니라 리다이렉트**다(`/app` → dashboard,
  // `/guardian` → report). 화면이 아니므로 도달 대상에서 뺀다.
  const idx = /<Route index element=\{(<[A-Za-z]+)/.exec(block);
  if (idx && idx[1] !== '<Navigate') out.push(prefix);
  return [...new Set(out)];
}

const ROLES = [
  { name: 'student', prefix: '/student', nav: STUDENT_NAV, tabs: MOBILE_TABS.student },
  { name: 'teacher', prefix: '/app', nav: TEACHER_NAV, tabs: MOBILE_TABS.teacher },
  { name: 'guardian', prefix: '/guardian', nav: GUARDIAN_NAV, tabs: MOBILE_TABS.guardian },
] as const;

describe('사이드바 정본 — 모바일 탭과 축 통일', () => {
  it.each(ROLES)('$name — 대항목이 모바일 하단 탭과 같은 이름·순서다', ({ nav, tabs }) => {
    expect(groupsOf(nav)).toEqual([...tabs]);
  });

  it.each(ROLES)('$name — 대항목은 5개를 넘지 않는다', ({ nav }) => {
    // 5를 넘는 순간 모바일 탭으로 옮길 수 없는 축이 된다. 늘리려면 탭 정책부터 바꿔야 한다.
    expect(groupsOf(nav).length).toBeLessThanOrEqual(5);
  });

  it.each(ROLES)('$name — 모든 라우트가 사이드바에서 도달 가능하다', ({ prefix, nav }) => {
    const inNav = new Set(leavesOf(nav).map((l) => l.to));
    const unreachable = routesUnder(prefix)
      .filter((r) => !isDetailRoute(r)) // 상세·하위 화면은 부모에서 진입한다
      .filter((r) => !inNav.has(r))
      .filter((r) => !(r in NAV_EXEMPT)); // 예외는 이유와 함께 기록돼야 한다
    expect(unreachable).toEqual([]);
  });

  it.each(ROLES)('$name — 사이드바 항목은 전부 실제 라우트다(죽은 링크 금지)', ({ prefix, nav }) => {
    const routes = new Set(routesUnder(prefix));
    const dead = leavesOf(nav)
      .map((l) => l.to)
      .filter((t) => !routes.has(t));
    expect(dead).toEqual([]);
  });

  it.each(ROLES)('$name — 경로·라벨 중복이 없다', ({ nav }) => {
    const tos = leavesOf(nav).map((l) => l.to);
    const labels = leavesOf(nav).map((l) => l.label);
    expect(tos.length).toBe(new Set(tos).size);
    expect(labels.length).toBe(new Set(labels).size);
  });

  it.each(ROLES)('$name — 모든 항목이 대항목 아래에 있다(떠 있는 항목 금지)', ({ nav }) => {
    const orphans: string[] = [];
    let seenGroup = false;
    for (const n of nav as NavItem[]) {
      if ('group' in n) seenGroup = true;
      else if ('to' in n && !seenGroup) orphans.push(n.to);
    }
    expect(orphans).toEqual([]);
  });

  it('학생 재편으로 항목이 사라지지 않았다 — 27개가 그대로다', () => {
    // 재편은 **그룹핑만** 바꾼다(N30 의 기능 보존 원칙과 같은 태도).
    // 이 숫자가 줄면 어딘가에서 항목을 흘린 것이고, 늘면 근거 없이 추가한 것이다.
    expect(leavesOf(STUDENT_NAV)).toHaveLength(27);
    expect(leavesOf(TEACHER_NAV)).toHaveLength(20);
    expect(leavesOf(GUARDIAN_NAV)).toHaveLength(8); // 2026-07-30 약관·개인정보 신설(+1)
  });

  it('예외 목록은 이유를 적는다 — 조용히 빠지는 것을 막는다', () => {
    for (const [path, why] of Object.entries(NAV_EXEMPT)) {
      expect(why.length, `${path} 의 예외 이유가 너무 짧다`).toBeGreaterThan(15);
    }
  });

  it('무거운 대항목은 소그룹을 갖는다 — 6개 이상이 평면으로 쌓이지 않게', () => {
    const heavyFlat: string[] = [];
    for (const { name, nav } of ROLES) {
      let group = '';
      let count = 0;
      let hasSub = false;
      const flush = () => {
        if (group && count >= 6 && !hasSub) heavyFlat.push(`${name}/${group}(${count})`);
      };
      for (const n of nav as NavItem[]) {
        if ('group' in n) {
          flush();
          group = n.group;
          count = 0;
          hasSub = false;
        } else if ('sub' in n) hasSub = true;
        else count++;
      }
      flush();
    }
    expect(heavyFlat).toEqual([]);
  });
});
