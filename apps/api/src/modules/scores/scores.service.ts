import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { FilesService } from '../storage/files.service';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider, ScoreOcrResult } from '../llm/llm.types';

type ItemInput = { subject: string; score?: number | null; maxScore?: number | null; grade?: string | null };
type ManualInput = { studentId?: string; studentLoginId?: string; period: string; examType?: string; note?: string; reportFileId?: string; items: ItemInput[] };

const META_KEYS = ['아이디', '학생아이디', '로그인아이디', '이름', '학생', '기간', '시험', '시험유형', '메모', 'note', 'id', 'loginid'];

/** 성적 업로드 — 엑셀 일괄·수동·OCR + 미업로드 학생 조회(관리자/HR). */
@Injectable()
export class ScoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  private assertAdmin(actor: AuthUser) {
    if (actor.role !== AccountRole.ADMIN && actor.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 성적을 관리할 수 있습니다.');
    }
  }
  private isHq(actor: AuthUser) {
    return actor.role === AccountRole.ADMIN && !actor.centerId;
  }

  /** 학생 upsert 성적표 + 과목 교체(멱등). */
  private async upsertReport(actor: AuthUser, studentAccountId: string, centerId: string | null, input: Omit<ManualInput, 'studentId' | 'studentLoginId'>, source: string) {
    const items = (input.items ?? []).filter((i) => i.subject?.trim());
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.score_report.findUnique({ where: { student_id_period: { student_id: studentAccountId, period: input.period } } });
      const report = existing
        ? await tx.score_report.update({
            where: { id: existing.id },
            data: { exam_type: input.examType ?? null, note: input.note ?? null, source, report_file_id: input.reportFileId ?? existing.report_file_id, updated_at: new Date() },
          })
        : await tx.score_report.create({
            data: { student_id: studentAccountId, center_id: centerId, period: input.period, exam_type: input.examType ?? null, note: input.note ?? null, source, report_file_id: input.reportFileId ?? null, created_by: actor.id },
          });
      await tx.score_item.deleteMany({ where: { report_id: report.id } });
      if (items.length) {
        await tx.score_item.createMany({
          data: items.map((i) => ({ report_id: report.id, subject: i.subject.trim(), score: i.score ?? null, max_score: i.maxScore ?? 100, grade: i.grade ?? null })),
        });
      }
      return report;
    });
  }

  async createManual(actor: AuthUser, dto: ManualInput) {
    this.assertAdmin(actor);
    if (!dto.period?.trim()) throw new BadRequestException('기간(period)을 입력하세요.');
    const sp = await this.resolveStudent(actor, dto.studentId, dto.studentLoginId);
    const report = await this.upsertReport(actor, sp.account_id, sp.center_id, dto, 'manual');
    return { ok: true, reportId: report.id };
  }

  private async resolveStudent(actor: AuthUser, studentId?: string, loginId?: string) {
    const acc = studentId
      ? await this.prisma.account.findUnique({ where: { id: studentId }, select: { id: true } })
      : loginId
        ? await this.prisma.account.findUnique({ where: { login_id: loginId }, select: { id: true } })
        : null;
    if (!acc) throw new NotFoundException('학생을 찾을 수 없습니다.');
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: acc.id }, select: { account_id: true, center_id: true } });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');
    if (!this.isHq(actor) && sp.center_id !== actor.centerId) throw new ForbiddenException('다른 센터 학생입니다.');
    return sp;
  }

  /** 엑셀 일괄 업로드(가로형: 아이디·기간·시험 + 과목 컬럼). */
  async bulkExcel(actor: AuthUser, buffer: Buffer) {
    this.assertAdmin(actor);
    let rows: Record<string, unknown>[];
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    } catch { throw new BadRequestException('엑셀을 읽을 수 없습니다(.xlsx).'); }
    if (!rows.length) throw new BadRequestException('데이터가 없습니다.');

    const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const norm: Record<string, unknown> = {};
      for (const k of Object.keys(r)) norm[k.trim()] = r[k];
      const loginId = String(norm['아이디'] ?? norm['학생아이디'] ?? norm['로그인아이디'] ?? norm['id'] ?? '').trim();
      const period = String(norm['기간'] ?? '').trim();
      if (!loginId || !period) { result.skipped++; result.errors.push(`${i + 2}행: 아이디/기간 누락`); continue; }
      const items: ItemInput[] = [];
      for (const key of Object.keys(norm)) {
        if (META_KEYS.includes(key) || META_KEYS.includes(key.toLowerCase())) continue;
        const v = norm[key];
        if (v === null || v === '' || v === undefined) continue;
        const num = Number(v);
        if (Number.isNaN(num)) continue;
        items.push({ subject: key, score: num, maxScore: 100 });
      }
      try {
        const sp = await this.resolveStudent(actor, undefined, loginId);
        const existed = await this.prisma.score_report.findUnique({ where: { student_id_period: { student_id: sp.account_id, period } } });
        await this.upsertReport(actor, sp.account_id, sp.center_id, { period, examType: String(norm['시험'] ?? norm['시험유형'] ?? '') || undefined, items }, 'excel');
        existed ? result.updated++ : result.created++;
      } catch (e) { result.skipped++; result.errors.push(`${i + 2}행(${loginId}): ${(e as Error).message}`); }
    }
    return result;
  }

  /** 성적표 이미지 OCR → 과목·점수 추출(폼 프리필). */
  async ocr(actor: AuthUser, fileId: string): Promise<ScoreOcrResult & { fileId: string }> {
    this.assertAdmin(actor);
    const { data, contentType } = await this.files.readBytes(fileId);
    const res = await this.llm.extractScoreReport({ imageBase64: data.toString('base64'), mimeType: contentType });
    return { ...res, fileId };
  }

  async list(actor: AuthUser, period?: string, studentId?: string) {
    this.assertAdmin(actor);
    const rows = await this.prisma.score_report.findMany({
      where: {
        ...(this.isHq(actor) ? {} : { center_id: actor.centerId }),
        ...(period ? { period } : {}),
        ...(studentId ? { student_id: studentId } : {}),
      },
      include: { items: { orderBy: { subject: 'asc' } }, student: { include: { account: { select: { name: true, login_id: true } } } } },
      orderBy: [{ period: 'desc' }, { created_at: 'desc' }],
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id, studentId: r.student_id, studentName: r.student.account.name, loginId: r.student.account.login_id,
      period: r.period, examType: r.exam_type, source: r.source, reportFileId: r.report_file_id, note: r.note,
      createdAt: r.created_at,
      items: r.items.map((i) => ({ subject: i.subject, score: i.score ? Number(i.score) : null, maxScore: i.max_score ? Number(i.max_score) : null, grade: i.grade })),
      avg: (() => { const s = r.items.map((i) => (i.score ? Number(i.score) : null)).filter((x): x is number => x != null); return s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null; })(),
    }));
  }

  async periods(actor: AuthUser) {
    this.assertAdmin(actor);
    const rows = await this.prisma.score_report.findMany({
      where: this.isHq(actor) ? {} : { center_id: actor.centerId },
      distinct: ['period'], select: { period: true }, orderBy: { period: 'desc' },
    });
    return rows.map((r) => r.period);
  }

  /** 해당 기간 미업로드 학생 목록(정렬용). */
  async missing(actor: AuthUser, period: string) {
    this.assertAdmin(actor);
    if (!period?.trim()) throw new BadRequestException('기간을 지정하세요.');
    const students = await this.prisma.student_profile.findMany({
      where: {
        ...(this.isHq(actor) ? {} : { center_id: actor.centerId }),
        NOT: { score_report: { some: { period } } },
      },
      include: { account: { select: { name: true, login_id: true } }, center: { select: { name: true } } },
      orderBy: { account: { login_id: 'asc' } },
      take: 1000,
    });
    return {
      period,
      count: students.length,
      students: students.map((s) => ({ studentId: s.account_id, name: s.account.name, loginId: s.account.login_id, center: s.center?.name ?? null, schoolGrade: s.school_grade ?? null })),
    };
  }
}
