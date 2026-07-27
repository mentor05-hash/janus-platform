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
});
