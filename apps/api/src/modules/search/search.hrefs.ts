import type { SearchHit } from './search.service';

/**
 * 통합검색 결과 유형별 웹 라우트(실경로) — App.tsx 라우트와 정합 유지.
 * teacher 는 선생님 찾기(/student/search), 커뮤니티는 게시판 목록.
 */
export const SEARCH_HREFS: Record<SearchHit['type'], string> = {
  lecture: '/student/lectures',
  material: '/student/materials',
  community: '/student/community/board',
  teacher: '/student/search',
};
