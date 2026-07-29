import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { toJson } from '../../common/prisma/json';

/**
 * 진단 기반 매칭(PR-1 코어) — 학생의 진단·성적(읽기 전용)에서 적합 상담사 카드 N인을 추천.
 * 스코어 = 과목적합 · 품질(평점·경력) · 가용(근무중·응답속도). 가중치는 설정(🟡).
 * ⚠ janus_score/격차리포트 규약 변경 없음(읽기만). 연락처·외부 링크 미노출(거래 완결). 목표대학 실적 가중은 §8(필드 부재).
 */
@Injectable()
export class DiagnosticMatchService {
  constructor(private readonly prisma: PrismaService) {}

  // 🟡 설정값(실측 후 튜닝) — 과목적합 우선, 목표대학 실적·품질·가용 보조.
  private static readonly W = {
    subject: 0.4,
    target: 0.2,
    quality: 0.25,
    availability: 0.15,
  };
  private static readonly DEFAULT_N = 4;
  private static readonly COLD_START_SLOTS = 1; // 신규(실적 적은) 상담사 소량 노출

  /** 학생의 매칭 입력 과목 — 명시 subject > 최근 진단 과목 > 최근 성적 과목. 읽기 전용. */
  private async targetSubjects(
    studentId: string,
    subject?: string,
  ): Promise<string[]> {
    if (subject) return [subject];
    const attempt = await this.prisma.diagnostic_attempt.findFirst({
      where: {
        student_id: studentId,
        subject: { not: null },
        submitted_at: { not: null },
      },
      orderBy: { started_at: 'desc' },
      select: { subject: true },
    });
    if (attempt?.subject && attempt.subject !== '약점클리닉')
      return [attempt.subject];
    const report = await this.prisma.score_report.findFirst({
      where: { student_id: studentId },
      orderBy: { period: 'desc' },
      include: { items: { select: { subject: true } } },
    });
    const subs = [
      ...new Set((report?.items ?? []).map((i) => i.subject)),
    ].filter(Boolean);
    return subs.slice(0, 4);
  }

  async recommend(
    user: AuthUser,
    opts: { subject?: string; mode?: string; limit?: number },
  ) {
    const targets = await this.targetSubjects(user.id, opts.subject);
    const limit = Math.min(
      Math.max(opts.limit ?? DiagnosticMatchService.DEFAULT_N, 1),
      12,
    );
    // 학생 목표 라인(goal_tier, 읽기 전용) — 상담사 실적 tier 와 매칭.
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: user.id },
      select: { goal_tier: true },
    });
    const goalTier = sp?.goal_tier ?? null;

    // 후보 — 근무 제외(off) 상담사. 과목 태그가 있으면 겹치는 후보 우선(없어도 범용 포함).
    const cands = await this.prisma.teacher_profile.findMany({
      where: {
        work_status: { not: 'off' },
        ...(opts.mode ? { modes: { has: opts.mode } } : {}),
      },
      include: { account: { select: { name: true } } },
      take: 400,
    });

    const W = DiagnosticMatchService.W;
    const maxConsult = Math.max(1, ...cands.map((c) => c.total_consult ?? 0));
    const scored = cands.map((c) => {
      const subs = c.subjects ?? [];
      const hit = targets.length
        ? targets.filter(
            (s) =>
              subs.includes(s) ||
              (s === '탐구' && subs.some((x) => ['과학', '사회'].includes(x))),
          ).length
        : 0;
      const subjectFit = targets.length ? hit / targets.length : 0.5; // 타깃 없으면 중립
      const rating = Number(c.rating ?? 0) / 5; // 0~1
      const experience = Math.min(1, (c.total_consult ?? 0) / maxConsult);
      const quality = rating * 0.7 + experience * 0.3;
      const responsive =
        c.avg_response_min != null
          ? Math.max(0, 1 - Math.min(1, c.avg_response_min / 120))
          : 0.4;
      const available =
        (c.work_status === 'on' ? 1 : 0.5) * 0.6 + responsive * 0.4;
      // 목표대학 실적 — 학생 goal_tier 가 상담사 자기신고 실적 tier 에 있으면 적합. 검증분은 가중 상향(1.0), 자기신고만 0.5.
      const ach = Array.isArray(c.target_achievements)
        ? (c.target_achievements as Array<{ tier?: string }>)
        : [];
      const tierHit = !!goalTier && ach.some((a) => a?.tier === goalTier);
      const verified = c.target_achievements_verified === true;
      const targetFit = tierHit ? (verified ? 1 : 0.5) : 0;
      const score =
        W.subject * subjectFit +
        W.target * targetFit +
        W.quality * quality +
        W.availability * available;
      const reasons: string[] = [];
      if (hit > 0)
        reasons.push(
          `${targets.filter((s) => subs.includes(s) || (s === '탐구' && subs.some((x) => ['과학', '사회'].includes(x)))).join('·')} 담당`,
        );
      if (tierHit)
        reasons.push(`${goalTier} 라인 합격 실적${verified ? ' ✓검증' : ''}`);
      if (Number(c.rating ?? 0) >= 4)
        reasons.push(`평점 ${Number(c.rating).toFixed(1)}`);
      if (c.avg_response_min != null)
        reasons.push(`평균 응답 ${c.avg_response_min}분`);
      if ((c.total_consult ?? 0) >= 20)
        reasons.push(`누적 상담 ${c.total_consult}회`);
      return {
        c,
        score,
        subjectFit,
        targetFit,
        targetVerified: verified && tierHit,
        isNew: (c.total_consult ?? 0) < 3 && Number(c.rating ?? 0) === 0,
        reasons,
      };
    });

    // 과목 적합 후보 우선 정렬(적합 0 은 뒤로), 동점은 점수.
    scored.sort((a, b) => b.subjectFit - a.subjectFit || b.score - a.score);
    const primary = scored.filter((s) => s.subjectFit > 0).slice(0, limit);
    // 부족분은 범용(적합 0)에서 채우되 매칭 근거 표기 — 콜드스타트 신규는 소량 슬롯 보장.
    let picks = primary;
    if (picks.length < limit) {
      const rest = scored.filter((s) => !picks.includes(s));
      const news = rest
        .filter((s) => s.isNew)
        .slice(0, DiagnosticMatchService.COLD_START_SLOTS);
      const fill = rest
        .filter((s) => !news.includes(s))
        .slice(0, limit - picks.length - news.length);
      picks = [...picks, ...news, ...fill].slice(0, limit);
    }

    // 계측 — 노출(shown). studentId·과목·후보 id 만(성적 원자료 복제 금지).
    void this.recordFunnel('shown', {
      studentId: user.id,
      subjects: targets,
      counselorIds: picks.map((p) => p.c.account_id),
    });

    return {
      subjects: targets,
      weights: W,
      cards: picks.map((p, i) => ({
        counselorId: p.c.account_id,
        name: p.c.account.name,
        subjects: p.c.subjects ?? [],
        modes: p.c.modes ?? [],
        rating: Number(p.c.rating ?? 0),
        totalConsult: p.c.total_consult ?? 0,
        rank: i + 1,
        reasons: p.reasons.length ? p.reasons : ['프로필 보기'],
        targetVerified: p.targetVerified,
        isNew: p.isNew,
      })),
      note: targets.length
        ? undefined
        : '진단·성적 데이터가 없어 범용 추천이에요. 실력진단을 먼저 보면 더 정확해져요.',
    };
  }

  /** 카드 클릭 계측(학생 상세 열람·예약 진입 직전). */
  async recordClick(user: AuthUser, counselorId: string) {
    await this.recordFunnel('clicked', { studentId: user.id, counselorId });
    return { ok: true };
  }

  private async recordFunnel(event: string, meta: Record<string, unknown>) {
    try {
      await this.prisma.funnel_event.create({
        data: { page: 'diag_match', event, cta: event, meta: toJson(meta) },
      });
    } catch {
      /* 계측 실패 비차단 */
    }
  }
}
