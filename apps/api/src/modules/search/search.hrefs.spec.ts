import { resolveWebPath } from '@mentoring/nav';
import { SEARCH_HREFS } from './search.hrefs';

// 통합검색 결과 링크는 실제 App.tsx 라우트를 가리켜야 함(회귀 방지 — 코드리뷰 발견).
describe('SEARCH_HREFS — 검색 결과 링크 경로', () => {
  it('선생님은 /student/teachers(미존재)가 아닌 /student/search 로', () => {
    expect(SEARCH_HREFS.teacher).toBe('/student/search');
    expect(SEARCH_HREFS.teacher).not.toBe('/student/teachers');
  });

  it('강좌·자료·커뮤니티 경로', () => {
    expect(SEARCH_HREFS.lecture).toBe('/student/lectures');
    expect(SEARCH_HREFS.material).toBe('/student/materials');
    expect(SEARCH_HREFS.community).toBe('/student/community/board');
  });

  it('4개 유형 모두 절대경로(/student 하위)', () => {
    for (const href of Object.values(SEARCH_HREFS)) {
      expect(href.startsWith('/student/')).toBe(true);
    }
  });

  /**
   * 소비처가 이 경로들을 **해석할 수 있어야** 한다.
   *
   * 실제로 갈라져 있었다(2026-07-30 발견): 모바일 검색은 서버 `href` 를 버리고 유형→탭 표를
   * 자체로 들고 있었고, 그 표가 낡아 강좌는 강의실(`/classes`), 커뮤니티는 라운지로 갔다 —
   * 둘 다 **다른 화면**이다. 서버만 고치면 웹은 맞고 모바일은 계속 틀린 채로 남는다.
   *
   * 이제 해석기가 `@mentoring/nav` 한 곳에 있으므로 **소스 텍스트가 아니라 함수를 부른다**.
   * 모바일에 화면이 없어도 된다 — `web-only` 로 이유와 함께 답하면 통과다.
   * 금지하는 것은 **아무 결정도 없는 상태**(`unknown`)다.
   */
  it('nav 정본이 4개 경로를 모두 해석한다', () => {
    const unknown = Object.values(SEARCH_HREFS).filter(
      (href) => resolveWebPath(href).kind === 'unknown',
    );
    expect(unknown).toEqual([]);
  });
});
