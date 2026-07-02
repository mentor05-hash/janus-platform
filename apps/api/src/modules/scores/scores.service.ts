import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { FilesService } from '../storage/files.service';
import { AuditService } from '../audit/audit.service';
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
    private readonly audit: AuditService,
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

  /** 업로드용 엑셀 템플릿(가로형: 아이디·기간·시험 + 과목 컬럼) 생성. */
  template(): Buffer {
    const sample = [
      { 아이디: 'student01', 기간: '2026-1학기 중간고사', 시험: '중간', 국어: 90, 수학: 85, 영어: 88, 과학: 77, 사회: 95 },
      { 아이디: 'student02', 기간: '2026-1학기 중간고사', 시험: '중간', 국어: 72, 수학: 99, 영어: 81, 과학: 88, 사회: 69 },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '성적');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
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
      placement: (r.placement as Record<string, unknown> | null) ?? null,
      createdAt: r.created_at,
      items: r.items.map((i) => ({ subject: i.subject, score: i.score ? Number(i.score) : null, maxScore: i.max_score ? Number(i.max_score) : null, grade: i.grade })),
      avg: (() => { const s = r.items.map((i) => (i.score ? Number(i.score) : null)).filter((x): x is number => x != null); return s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null; })(),
    }));
  }

  /** 배치 라인 저장 — 외부 배치표 서비스 결과 또는 관리자 입력. */
  async setPlacement(actor: AuthUser, reportId: string, placement: Record<string, unknown>) {
    this.assertAdmin(actor);
    const r = await this.prisma.score_report.findUnique({ where: { id: reportId }, select: { center_id: true } });
    if (!r) throw new NotFoundException('성적표를 찾을 수 없습니다.');
    if (!this.isHq(actor) && r.center_id !== actor.centerId) throw new ForbiddenException('다른 센터 성적입니다.');
    await this.prisma.score_report.update({
      where: { id: reportId },
      data: { placement: { ...placement, source: placement.source ?? 'manual', updatedAt: new Date().toISOString() } as object },
    });
    await this.audit.record(actor, { action: 'scores.placement', targetType: 'score_report', targetId: reportId, summary: `배치 라인 입력(${placement.tier ?? ''} ${placement.line ?? ''})`, meta: placement });
    return { ok: true };
  }

  /** 학생 목표(대학 라인/평균) 설정. */
  async setGoal(actor: AuthUser, studentLoginId: string, tier: string | null, avg: number | null) {
    this.assertAdmin(actor);
    const sp = await this.resolveStudent(actor, undefined, studentLoginId);
    await this.prisma.student_profile.update({ where: { account_id: sp.account_id }, data: { goal_tier: tier, goal_avg: avg } });
    await this.audit.record(actor, { action: 'scores.goal', targetType: 'student', targetId: sp.account_id, summary: `학생 목표 설정(${tier ?? '-'}·평균 ${avg ?? '-'})`, meta: { studentLoginId, tier, avg } });
    return { ok: true };
  }

  /** 데모 배치 추정 — 평균 → 등급/라인/샘플 대학·학과. 실 배치표 서비스가 덮어쓸 자리. */
  private static estimateLine(avg: number): { tier: string; line: string; universities: string[]; departments: string[] } {
    if (avg >= 95) return { tier: '최상위', line: '서울 최상위·의약학 라인', universities: ['서울대', '연세대', '고려대'], departments: ['의예', '컴퓨터공학', '경영'] };
    if (avg >= 90) return { tier: '상위', line: '서성한·중경외시 라인', universities: ['성균관대', '한양대', '중앙대'], departments: ['전자공학', '경제', '미디어'] };
    if (avg >= 85) return { tier: '중상위', line: '건동홍·국숭세단 라인', universities: ['홍익대', '국민대', '숭실대'], departments: ['소프트웨어', '건축', '경영'] };
    if (avg >= 80) return { tier: '중위', line: '인서울 하위·수도권 라인', universities: ['가천대', '명지대', '경기대'], departments: ['컴퓨터', '전기', '행정'] };
    if (avg >= 70) return { tier: '중하위', line: '수도권·지방 국립 라인', universities: ['한국공대', '충북대', '강원대'], departments: ['기계', '화학', '사회복지'] };
    return { tier: '기초', line: '지방권·전문대 라인', universities: ['지방 사립'], departments: ['보건', '실용'] };
  }

  async estimatePlacements(actor: AuthUser, period: string) {
    this.assertAdmin(actor);
    if (!period?.trim()) throw new BadRequestException('기간을 지정하세요.');
    const reports = await this.prisma.score_report.findMany({
      where: { period, ...(this.isHq(actor) ? {} : { center_id: actor.centerId }) },
      include: { items: { select: { score: true } } },
    });
    let updated = 0;
    for (const r of reports) {
      const s = r.items.map((i) => (i.score ? Number(i.score) : null)).filter((x): x is number => x != null);
      if (!s.length) continue;
      const avg = s.reduce((a, b) => a + b, 0) / s.length;
      const est = ScoresService.estimateLine(avg);
      await this.prisma.score_report.update({ where: { id: r.id }, data: { placement: { ...est, avg: Math.round(avg * 10) / 10, source: 'demo', updatedAt: new Date().toISOString() } as object } });
      updated++;
    }
    return { updated, note: '데모 추정입니다. 실제 배치표 서비스 결과가 있으면 덮어쓰세요.' };
  }

  /** 학생 성적 추이 + 배치 라인 변화(회차 순) — 공통 빌더. */
  private async buildTrend(studentAccountId: string, includePlacement: boolean) {
    const reports = await this.prisma.score_report.findMany({
      where: { student_id: studentAccountId },
      include: { items: { orderBy: { subject: 'asc' } } },
      orderBy: { created_at: 'asc' },
    });
    const student = await this.prisma.account.findUnique({ where: { id: studentAccountId }, select: { name: true, login_id: true } });
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: studentAccountId }, select: { goal_tier: true, goal_avg: true } });
    return {
      student: { name: student?.name, loginId: student?.login_id },
      goal: { tier: sp?.goal_tier ?? null, avg: sp?.goal_avg ?? null },
      points: reports.map((r) => {
        const s = r.items.map((i) => (i.score ? Number(i.score) : null)).filter((x): x is number => x != null);
        const avg = s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null;
        return {
          period: r.period, examType: r.exam_type, avg,
          subjects: r.items.map((i) => ({ subject: i.subject, score: i.score ? Number(i.score) : null })),
          placement: includePlacement ? ((r.placement as Record<string, unknown> | null) ?? null) : null,
        };
      }),
    };
  }

  async trend(actor: AuthUser, studentLoginId: string) {
    this.assertAdmin(actor);
    const sp = await this.resolveStudent(actor, undefined, studentLoginId);
    return this.buildTrend(sp.account_id, true); // 관리자는 배치 라인 항상 열람
  }

  /** 선생님: 같은 센터 학생 성적·배치 추이(내부 열람, 배치 포함). studentId=account uuid. */
  async teacherTrend(actor: AuthUser, studentId: string) {
    if (actor.role !== AccountRole.TEACHER) throw new ForbiddenException('선생님만 조회할 수 있습니다.');
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: studentId }, select: { account_id: true, center_id: true } });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');
    if (sp.center_id !== actor.centerId) throw new ForbiddenException('다른 센터 학생입니다.');
    return this.buildTrend(sp.account_id, true);
  }

  // ── 노출 정책(본사 마스터) ──
  private static readonly POLICY_KEY = 'score_visibility';
  private static readonly POLICY_DEFAULT = { student: true, guardian: true, placement: true };

  async getScorePolicy() {
    const row = await this.prisma.system_setting.findUnique({ where: { key: ScoresService.POLICY_KEY } });
    return { ...ScoresService.POLICY_DEFAULT, ...((row?.value as object) ?? {}) };
  }

  async setScorePolicy(actor: AuthUser, dto: { student?: boolean; guardian?: boolean; placement?: boolean }) {
    // 본사 마스터관리자(admin + 센터 미소속)만 전사 정책 변경
    if (!this.isHq(actor)) throw new ForbiddenException('전사 노출 정책은 본사 마스터관리자만 변경할 수 있습니다.');
    const next = { ...(await this.getScorePolicy()), ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: ScoresService.POLICY_KEY },
      create: { key: ScoresService.POLICY_KEY, value: next as object, updated_by: actor.id },
      update: { value: next as object, updated_by: actor.id, updated_at: new Date() },
    });
    await this.audit.record(actor, { action: 'scores.policy', targetType: 'system_setting', summary: `성적 노출 정책 변경(학생 ${next.student ? 'ON' : 'OFF'}·학부모 ${next.guardian ? 'ON' : 'OFF'}·배치 ${next.placement ? 'ON' : 'OFF'})`, meta: next });
    return next;
  }

  /** 학생/학부모 앱 접근 가능 여부(탭 표시용). */
  async access(user: AuthUser) {
    const p = await this.getScorePolicy();
    if (user.role === AccountRole.STUDENT) return { showTrend: !!p.student, showPlacement: !!p.student && !!p.placement };
    if (user.role === AccountRole.GUARDIAN) return { showTrend: !!p.guardian, showPlacement: !!p.guardian && !!p.placement };
    return { showTrend: true, showPlacement: true };
  }

  /** 학생 본인 성적·배치 추이(정책 게이트). */
  async selfTrend(user: AuthUser) {
    const p = await this.getScorePolicy();
    if (!p.student) throw new ForbiddenException('성적 조회가 비활성화되어 있습니다.');
    return this.buildTrend(user.id, !!p.placement);
  }

  /** 학부모 자녀 성적·배치 추이(연결·정책 게이트). */
  async guardianTrend(user: AuthUser, studentId: string) {
    const p = await this.getScorePolicy();
    if (!p.guardian) throw new ForbiddenException('성적 조회가 비활성화되어 있습니다.');
    const link = await this.prisma.guardian_student_link.findFirst({ where: { guardian_id: user.id, student_id: studentId } });
    if (!link) throw new ForbiddenException('연결된 자녀가 아닙니다.');
    return this.buildTrend(studentId, !!p.placement);
  }

  /** 성적 CSV(현 목록) — 아이디·이름·시험·과목별 점수·평균·배치. */
  async exportCsv(actor: AuthUser, period?: string): Promise<string> {
    const rows = await this.list(actor, period);
    const subjects = Array.from(new Set(rows.flatMap((r) => r.items.map((i) => i.subject))));
    const head = ['아이디', '이름', '기간', '시험', ...subjects, '평균', '배치'];
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [head.join(',')];
    for (const r of rows) {
      const byS = new Map(r.items.map((i) => [i.subject, i.score]));
      const cells = [r.loginId, r.studentName, r.period, r.examType ?? '', ...subjects.map((s) => byS.get(s) ?? ''), r.avg ?? '', r.placement ? `${r.placement.tier ?? ''} ${r.placement.line ?? ''}`.trim() : ''];
      lines.push(cells.map(esc).join(','));
    }
    return '﻿' + lines.join('\n'); // BOM(엑셀 한글)
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
