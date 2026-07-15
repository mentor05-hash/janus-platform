import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { prescribe, weaknessByUnit, scorePct, type Graded } from './domain/diagnostic';

/**
 * 수준진단 v1 — 문항 풀이 → 채점 → 유형별 약점 → 처방.
 * 문제은행은 diagnostic_question(데모=합성, 후속 kice 주입). 정답은 제출 시에만 사용(응시 중 미노출).
 */
@Injectable()
export class DiagnosticService {
  private static readonly DEFAULT_COUNT = 8;

  constructor(private readonly prisma: PrismaService) {}

  private assertStudent(user: AuthUser) {
    if (user.role !== AccountRole.STUDENT) throw new ForbiddenException('학생만 진단을 볼 수 있습니다.');
  }

  /** 진단 시작 — 문항 서빙(정답 제외) + attempt 생성. subject 미지정=전과목. */
  async start(user: AuthUser, subject?: string, count = DiagnosticService.DEFAULT_COUNT) {
    this.assertStudent(user);
    const where = { active: true, ...(subject ? { subject } : {}) };
    const pool = await this.prisma.diagnostic_question.findMany({ where, take: Math.min(30, Math.max(1, count)) });
    if (pool.length === 0) throw new NotFoundException('출제할 문항이 없습니다(문제은행 준비 중).');
    const attempt = await this.prisma.diagnostic_attempt.create({
      data: { student_id: user.id, subject: subject ?? null, total: pool.length },
    });
    return {
      attemptId: attempt.id,
      subject: subject ?? null,
      questions: pool.map((q) => ({ id: q.id, subject: q.subject, unit: q.unit, difficulty: q.difficulty, stem: q.stem, choices: q.choices as string[] })),
    };
  }

  /** 제출 — 채점·응답 저장·약점/처방 반환. */
  async submit(user: AuthUser, attemptId: string, answers: { questionId: string; chosen: number | null }[]) {
    this.assertStudent(user);
    const attempt = await this.prisma.diagnostic_attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.student_id !== user.id) throw new NotFoundException('진단 시도를 찾을 수 없습니다.');
    if (attempt.submitted_at) throw new BadRequestException('이미 제출된 진단입니다.');
    const qids = answers.map((a) => a.questionId);
    const qs = await this.prisma.diagnostic_question.findMany({ where: { id: { in: qids } } });
    const qmap = new Map(qs.map((q) => [q.id, q]));

    const graded: Graded[] = [];
    const responseData: { attempt_id: string; question_id: string; chosen: number | null; is_correct: boolean }[] = [];
    for (const a of answers) {
      const q = qmap.get(a.questionId);
      if (!q) continue;
      const correct = a.chosen != null && a.chosen === q.answer;
      graded.push({ questionId: q.id, unit: q.unit, subject: q.subject, correct });
      responseData.push({ attempt_id: attemptId, question_id: q.id, chosen: a.chosen, is_correct: correct });
    }
    const correct = graded.filter((g) => g.correct).length;
    const total = graded.length;
    const score = scorePct(correct, total);

    await this.prisma.$transaction([
      this.prisma.diagnostic_response.createMany({ data: responseData }),
      this.prisma.diagnostic_attempt.update({ where: { id: attemptId }, data: { total, correct, score, submitted_at: new Date() } }),
    ]);

    const stats = weaknessByUnit(graded);
    return { attemptId, total, correct, score, units: stats, prescriptions: prescribe(stats) };
  }

  /** 내 진단 이력(최근순) + 최근 결과 요약. */
  async myHistory(user: AuthUser) {
    this.assertStudent(user);
    const attempts = await this.prisma.diagnostic_attempt.findMany({
      where: { student_id: user.id, submitted_at: { not: null } },
      orderBy: { started_at: 'desc' }, take: 20,
      select: { id: true, subject: true, total: true, correct: true, score: true, submitted_at: true },
    });
    return { attempts };
  }

  /** 특정 시도 상세(약점·처방 재계산). */
  async detail(user: AuthUser, attemptId: string) {
    this.assertStudent(user);
    const attempt = await this.prisma.diagnostic_attempt.findUnique({ where: { id: attemptId }, include: { responses: true } });
    if (!attempt || attempt.student_id !== user.id) throw new NotFoundException('진단 시도를 찾을 수 없습니다.');
    const qids = attempt.responses.map((r) => r.question_id);
    const qs = await this.prisma.diagnostic_question.findMany({ where: { id: { in: qids } } });
    const qmap = new Map(qs.map((q) => [q.id, q]));
    const graded: Graded[] = attempt.responses.map((r) => {
      const q = qmap.get(r.question_id);
      return { questionId: r.question_id, unit: q?.unit ?? '기타', subject: q?.subject ?? '기타', correct: r.is_correct };
    });
    const stats = weaknessByUnit(graded);
    return { attemptId, subject: attempt.subject, total: attempt.total, correct: attempt.correct, score: attempt.score, units: stats, prescriptions: prescribe(stats) };
  }
}
