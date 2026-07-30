import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HUB_ITEMS,
  MOBILE_TABS,
  SATELLITE_PARENT,
  STUDENT_NAV,
  TAB_LABEL,
  itemsOf,
  leavesOf,
  resolveWebPath,
  type HubTab,
} from '@mentoring/nav';

/**
 * **모바일** 쪽 드리프트 검출 — `roleNav.test.ts` 의 짝.
 *
 * 왜 필요한가: O185 가 축을 맞춘 뒤에도 검사는 웹만 읽고 있었다. 그래서 모바일이 갈라져도
 * CI 는 초록이었고, 그 사이에 O186 의 결함 4건이 **조용히** 자랐다 —
 * 탭 배열 밖에서 렌더되는 화면 5개, 참조 0인 고아 화면, 서버 목적지와 어긋난 자체 표.
 * 규칙이 있었다면 그 넷 중 셋은 만들어진 날 잡혔다.
 *
 * ⚠ 이 파일이 `apps/web` 에 있는 이유는 **거기에만 테스트 러너가 있기 때문**이다(모바일은
 * expo tsc + expo export 만 돈다). 검사 대상은 `@mentoring/nav` 정본과 `apps/mobile/App.tsx`
 * 이고 웹 코드가 아니다 — 러너를 모바일에 새로 들이는 것보다 이 한 줄을 설명하는 편이 싸다.
 */

const MOBILE_APP = readFileSync(
  join(__dirname, '..', '..', '..', 'mobile', 'App.tsx'),
  'utf8',
);

/** `App.tsx` 의 학생 탭 배열 — `['h', 'c', 'dg', 'b', 'd']` 를 읽는다. */
function studentTabKeys(): string[] {
  const m = /:\s*\[((?:'[a-z]+',?\s*)+)\];?\s*\n\s*const guardianLabel/.exec(MOBILE_APP);
  const line = m ?? /\?\s*\[[^\]]*\]\s*:\s*\[[^\]]*\]\s*:\s*\[([^\]]*)\]/.exec(MOBILE_APP);
  if (!line) throw new Error('App.tsx 에서 학생 탭 배열을 찾지 못했다');
  return [...line[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
}

/** `App.tsx` 가 실제로 렌더하는 학생 탭 키 — `tab === 'x' ?` 분기에서 뽑는다. */
function renderedStudentKeys(): string[] {
  const at = MOBILE_APP.indexOf('{isStudent &&');
  const block = MOBILE_APP.slice(at, MOBILE_APP.indexOf('{isGuardian &&', at));
  return [...new Set([...block.matchAll(/tab === '([a-z]+)'/g)].map((m) => m[1]))];
}

describe('모바일 정본 — 탭·허브·경로', () => {
  it('학생 탭 배열이 MOBILE_TABS 와 같은 개수·순서다', () => {
    expect(studentTabKeys()).toHaveLength(MOBILE_TABS.student.length);
  });

  /**
   * O186-④ 가 이 규칙이 없어서 생겼다. 탭 배열 밖인데 렌더되는 화면은
   * 들어가는 순간 하단 탭 활성 표시가 전부 꺼져 사용자가 위치를 잃는다.
   */
  it('탭 밖에서 렌더되는 화면은 전부 소속 탭이 있다(위치 상실 금지)', () => {
    const tabs = new Set(studentTabKeys());
    const orphans = renderedStudentKeys()
      .filter((k) => !tabs.has(k))
      .filter((k) => !(k in SATELLITE_PARENT));
    expect(orphans).toEqual([]);
  });

  it('소속 탭은 실제 탭 배열 안의 키다(엉뚱한 곳에 소속시키지 않는다)', () => {
    const tabs = new Set(studentTabKeys());
    const bad = Object.entries(SATELLITE_PARENT).filter(([, parent]) => !tabs.has(parent));
    expect(bad).toEqual([]);
  });

  it('허브 항목의 탭 키는 전부 실제 탭이다', () => {
    const tabs = new Set(studentTabKeys());
    expect(HUB_ITEMS.filter((i) => !tabs.has(i.tab))).toEqual([]);
  });

  it('jump 항목은 실제로 렌더되는 화면을 가리킨다(죽은 이동 금지)', () => {
    const rendered = new Set([...renderedStudentKeys(), ...studentTabKeys()]);
    const dead = HUB_ITEMS.filter((i) => i.jump && !rendered.has(i.jump)).map((i) => i.key);
    expect(dead).toEqual([]);
  });

  it('허브 키·제목이 중복되지 않는다', () => {
    const keys = HUB_ITEMS.map((i) => i.key);
    const titles = HUB_ITEMS.map((i) => i.title);
    expect(keys.length).toBe(new Set(keys).size);
    expect(titles.length).toBe(new Set(titles).size);
  });

  it('허브가 있는 탭은 라벨을 갖는다(하위 화면 뒤로가기 문구의 출처)', () => {
    // O185 이후 하위 12화면의 '뒤로' 라벨이 전부 '‹ 마이' 로 남아 8개가 거짓말이었다(O186 곁가지).
    for (const tab of new Set(HUB_ITEMS.map((i) => i.tab))) {
      expect(TAB_LABEL[tab], `${tab} 탭 라벨 없음`).toBeTruthy();
      expect(itemsOf(tab).length).toBeGreaterThan(0);
    }
  });

  /**
   * 같은 이름의 대항목이 **같은 내용**을 담는지 — O185 가 맞추려던 것의 실체.
   * 웹의 각 대항목에 있는 기능이 모바일 어디에도 없으면 그건 결손이고, 알고 있어야 한다.
   */
  it('모바일 허브 항목은 전부 웹 사이드바에도 있다(모바일에만 있는 것은 목록으로 관리)', () => {
    const webLabels = new Set(leavesOf(STUDENT_NAV).map((l) => l.label));
    // 웹에 짝이 없는 항목 — O186 감사에서 확인된 '모바일에만 있는 기능'. 늘어나면 이 목록을 고쳐야 한다.
    //   · 30분 자동 매칭(`/match/auto`) · 내 상담 기록(`/me/notes`) · 선생님 분류(`/me/teacher-lists`)
    //     — 웹에 호출부가 0곳이다(웹 쪽 결손).
    //   · 격차 리포트 — 웹은 O102 고도 원칙대로 '과목별 점수 격차'/'목표 대학 격차' 두 이름으로 나뉘어 있다.
    //   · 강의실(`/classes`) — 웹에서는 **선생님 전용**(`/app/classes`)이고 학생 사이드바에는 없다.
    //     학생이 실시간 수업에 들어가는 경로가 웹에 없다는 뜻이라, 지우지 말고 결손으로 남긴다.
    const MOBILE_ONLY = new Set(['30분 자동 매칭', '내 상담 기록', '선생님 분류', '격차 리포트', '강의실']);
    const extra = HUB_ITEMS.map((i) => i.title).filter((t) => !webLabels.has(t) && !MOBILE_ONLY.has(t));
    expect(extra).toEqual([]);
  });

  it('허브 탭 키는 TAB_LABEL 이 아는 값만 쓴다', () => {
    const known: HubTab[] = ['dg', 'b', 'd'];
    expect(HUB_ITEMS.filter((i) => !known.includes(i.tab))).toEqual([]);
  });
});

describe('경로 해석 — 서버 href 가 정본', () => {
  it('웹 라우트로 해석되는 목적지는 실제 탭을 가리킨다', () => {
    const tabs = new Set([...studentTabKeys(), ...renderedStudentKeys()]);
    for (const path of ['/student', '/student/qna', '/student/materials', '/student/search', '/student/academies', '/student/bookings', '/student/diagnostic', '/student/community']) {
      const r = resolveWebPath(path);
      expect(r.kind, `${path} 해석 실패`).toBe('mobile');
      if (r.kind === 'mobile') expect(tabs.has(r.tab), `${path} → ${r.tab} 는 렌더되지 않는 탭`).toBe(true);
    }
  });

  it('모바일에 없는 화면은 이유와 함께 web-only 로 표시된다', () => {
    for (const path of ['/student/lectures', '/student/community/board']) {
      const r = resolveWebPath(path);
      expect(r.kind).toBe('web-only');
      if (r.kind === 'web-only') expect(r.why.length).toBeGreaterThan(15);
    }
  });

  it('쿼리·해시가 붙어도 같은 목적지로 해석된다', () => {
    expect(resolveWebPath('/student/materials?q=수학')).toEqual(resolveWebPath('/student/materials'));
    expect(resolveWebPath('/student/materials/')).toEqual(resolveWebPath('/student/materials'));
  });

  it('모르는 경로는 unknown 이다(조용히 아무 데나 보내지 않는다)', () => {
    expect(resolveWebPath('/student/그런거없음').kind).toBe('unknown');
    expect(resolveWebPath(undefined).kind).toBe('unknown');
  });
});
