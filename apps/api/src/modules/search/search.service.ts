import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { LectureService } from '../lecture/lecture.service';
import { MaterialService } from '../material/material.service';
import { PeopleService } from '../people/people.service';
import { QnaService } from '../qna/qna.service';
import { SEARCH_HREFS } from './search.hrefs';

export type SearchHit = {
  type: 'lecture' | 'material' | 'community' | 'teacher';
  id: string;
  title: string;
  subtitle?: string | null;
  subject?: string | null;
  href: string;
};
export type SearchResult = {
  q: string;
  total: number;
  groups: Record<string, SearchHit[]>;
};

/**
 * 전역 통합검색 — 강좌·자료·커뮤니티·선생님을 한 번에. 각 도메인 서비스의 기존 조회
 * (권한·공개범위 로직 포함)를 재사용해 통합 결과로 정규화. 그룹별 상위 N만 노출.
 */
@Injectable()
export class SearchService {
  private static readonly PER_GROUP = 6;

  constructor(
    private readonly lecture: LectureService,
    private readonly material: MaterialService,
    private readonly people: PeopleService,
    private readonly qna: QnaService,
  ) {}

  async searchAll(user: AuthUser, q: string): Promise<SearchResult> {
    const term = (q ?? '').trim();
    if (term.length < 1) return { q: term, total: 0, groups: {} };
    const N = SearchService.PER_GROUP;

    const [lectures, materialsRes, community, teachers] = await Promise.all([
      this.lecture.catalog(user, undefined, term).catch(() => []),
      this.material
        .list(user, { q: term })
        .catch(() => ({ data: [] as Array<Record<string, unknown>> })),
      this.qna.listCommunity(user, { q: term }).catch(() => []),
      this.people
        .listTeachers({ q: term, page: 1, size: N }, user)
        .catch(() => ({ data: [] as Array<Record<string, unknown>> })),
    ]);
    const materials =
      (materialsRes as { data?: Array<Record<string, unknown>> }).data ?? [];

    const groups: Record<string, SearchHit[]> = {};
    const lectureHits: SearchHit[] = (
      lectures as Array<{
        id: string;
        title: string;
        subject: string | null;
        unit: string | null;
      }>
    )
      .slice(0, N)
      .map((l) => ({
        type: 'lecture',
        id: l.id,
        title: l.title,
        subtitle: l.unit,
        subject: l.subject,
        href: SEARCH_HREFS.lecture,
      }));
    const materialHits: SearchHit[] = (
      materials as Array<{
        id: string;
        title: string;
        subject: string | null;
        category?: string | null;
      }>
    )
      .slice(0, N)
      .map((m) => ({
        type: 'material',
        id: m.id,
        title: m.title,
        subtitle: m.category ?? null,
        subject: m.subject,
        href: SEARCH_HREFS.material,
      }));
    const communityHits: SearchHit[] = (
      community as Array<{
        id: string;
        body: string;
        subject: string | null;
        answerCount: number;
      }>
    )
      .slice(0, N)
      .map((p) => ({
        type: 'community',
        id: p.id,
        title: p.body.slice(0, 60) || '(내용 없음)',
        subtitle: `답변 ${p.answerCount}`,
        subject: p.subject,
        href: SEARCH_HREFS.community,
      }));
    const teacherRows =
      (
        teachers as {
          data?: Array<{
            id: string;
            name: string;
            subjects?: string[];
            grade?: string;
          }>;
        }
      ).data ?? [];
    const teacherHits: SearchHit[] = teacherRows.slice(0, N).map((t) => ({
      type: 'teacher',
      id: t.id,
      title: t.name,
      subtitle: (t.subjects ?? []).join('·') || null,
      subject: (t.subjects ?? [])[0] ?? null,
      href: SEARCH_HREFS.teacher,
    }));

    if (lectureHits.length) groups.lecture = lectureHits;
    if (materialHits.length) groups.material = materialHits;
    if (communityHits.length) groups.community = communityHits;
    if (teacherHits.length) groups.teacher = teacherHits;
    const total =
      lectureHits.length +
      materialHits.length +
      communityHits.length +
      teacherHits.length;
    return { q: term, total, groups };
  }
}
