import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';

/**
 * 커뮤니티 라운지 — 기관 내 공개 활동을 읽기 전용으로 큐레이션(소셜 작성 기능 없음).
 * 데이터 원천: 공개 Q&A(채택 답변)·인기 자료·우수 후기. 학생/보호자 비식별.
 * 센터 스코프: 소속 센터(HQ 관리자는 전사).
 */
@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  private excerpt(s: string | null | undefined, n = 120): string {
    const t = (s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n)}…` : t;
  }

  private reviewAvg(r: {
    rating_attitude: number | null;
    rating_content: number | null;
    rating_skill: number | null;
    rating_again: number | null;
  }): number {
    const xs = [
      r.rating_attitude,
      r.rating_content,
      r.rating_skill,
      r.rating_again,
    ].filter((v): v is number => typeof v === 'number');
    if (!xs.length) return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  /** 센터 필터: HQ 관리자(admin+센터 미소속)는 전사, 그 외는 소속 센터. */
  private centerScope(user: AuthUser): string | undefined {
    const isHq = user.role === AccountRole.ADMIN && !user.centerId;
    return isHq ? undefined : (user.centerId ?? undefined);
  }

  async feed(user: AuthUser) {
    const centerId = this.centerScope(user);
    const teacherName = { include: { account: { select: { name: true } } } };

    // ── 인기 질문: 공개(open)·채택 답변 보유. 답변 많은 순 → 최신. 질문자 비식별.
    const posts = await this.prisma.qna_post.findMany({
      where: {
        scope: 'open',
        qna_answer: { some: { accepted: true } },
        ...(centerId ? { student_profile: { center_id: centerId } } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 40,
      include: {
        qna_answer: {
          where: { accepted: true },
          include: { teacher_profile: teacherName },
        },
      },
    });
    const questions = posts
      .map((p) => {
        const a = p.qna_answer[0];
        return {
          id: p.id,
          subject: p.subject ?? '기타',
          difficulty: p.difficulty ?? null,
          question: this.excerpt(p.body, 90),
          answerExcerpt: this.excerpt(a?.body, 140),
          answeredBy: a?.teacher_profile?.account?.name ?? '선생님',
          answerCount: p.qna_answer.length,
          createdAt: p.created_at,
        };
      })
      .slice(0, 8);

    // ── 인기 자료: 공개/센터 자료 조회수 상위.
    const mats = await this.prisma.material.findMany({
      where: {
        visibility: { in: ['public', 'center'] },
        ...(centerId
          ? { OR: [{ center_id: centerId }, { visibility: 'public' }] }
          : {}),
      },
      orderBy: [{ view_count: 'desc' }, { created_at: 'desc' }],
      take: 8,
      include: { teacher: teacherName },
    });
    const materials = mats.map((m) => ({
      id: m.id,
      title: m.title,
      subject: m.subject ?? '기타',
      category: m.category ?? null,
      teacherName: m.teacher?.account?.name ?? '선생님',
      viewCount: m.view_count,
      createdAt: m.created_at,
    }));

    // ── 우수 후기: 텍스트 有·평균 4.0↑·미신고. 최신순. 작성자 비식별.
    const revs = await this.prisma.review.findMany({
      where: {
        text: { not: null },
        reported: { not: true },
        ...(centerId ? { teacher_profile: { center_id: centerId } } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 60,
      include: { teacher_profile: teacherName },
    });
    const reviews = revs
      .map((r) => ({
        id: r.id,
        teacherName: r.teacher_profile?.account?.name ?? '선생님',
        rating: Math.round(this.reviewAvg(r) * 10) / 10,
        text: this.excerpt(r.text, 140),
        createdAt: r.created_at,
      }))
      .filter((r) => r.rating >= 4 && r.text.length > 0)
      .slice(0, 8);

    return { questions, materials, reviews };
  }
}
