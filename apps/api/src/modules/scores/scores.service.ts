import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { FilesService } from '../storage/files.service';
import { AuditService } from '../audit/audit.service';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider, ScoreOcrResult } from '../llm/llm.types';
import { SchoolRecordGuardService } from '../guard/school-record-guard.service';
import { toJanusScore } from './domain/janus-score';
import { buildGapReport, type GapMode, type JanusReport } from './domain/gap-report';

type ItemInput = { subject: string; score?: number | null; maxScore?: number | null; grade?: string | null; subSubject?: string | null };
type ManualInput = { studentId?: string; studentLoginId?: string; period: string; examType?: string; note?: string; reportFileId?: string; items: ItemInput[]; placement?: Record<string, unknown> | null };
type MyScoreInput = { period: string; examType?: string; note?: string; mode: 'std' | 'nb'; gye?: '문과' | '이과' | null; nb?: number | null; items: ItemInput[] };

const META_KEYS = ['아이디', '학생아이디', '로그인아이디', '이름', '학생', '기간', '시험', '시험유형', '메모', 'note', 'id', 'loginid'];

/** 성적 업로드 — 엑셀 일괄·수동·OCR + 미업로드 학생 조회(관리자/HR). */
@Injectable()
export class ScoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly audit: AuditService,
    private readonly guard: SchoolRecordGuardService,
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
            data: { exam_type: input.examType ?? null, note: input.note ?? null, source, report_file_id: input.reportFileId ?? existing.report_file_id, updated_at: new Date(), ...(input.placement ? { placement: input.placement as object } : {}) },
          })
        : await tx.score_report.create({
            data: { student_id: studentAccountId, center_id: centerId, period: input.period, exam_type: input.examType ?? null, note: input.note ?? null, source, report_file_id: input.reportFileId ?? null, created_by: actor.id, ...(input.placement ? { placement: input.placement as object } : {}) },
          });
      await tx.score_item.deleteMany({ where: { report_id: report.id } });
      if (items.length) {
        await tx.score_item.createMany({
          data: items.map((i) => ({ report_id: report.id, subject: i.subject.trim(), score: i.score ?? null, max_score: i.maxScore ?? 100, grade: i.grade ?? null, sub_subject: i.subSubject ?? null })),
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

  /**
   * 학생 자가 성적 입력(수능) → 배치표·격차 자동 반영(C1 단일 소스).
   * 표점 모드(std): 국어·수학·탐구1·탐구2 표점 + 영어·한국사 등급. 누백 모드(nb): 전국누백 + 영어·한국사 등급.
   * 세부과목·제2외국어는 메타 저장(브리지 무시). 계열(gye)·nb 는 placement 에.
   */
  async saveMyScore(user: AuthUser, dto: MyScoreInput) {
    if (user.role !== AccountRole.STUDENT) throw new ForbiddenException('학생만 자가 입력할 수 있습니다.');
    if (!dto.period?.trim()) throw new BadRequestException('기간을 입력하세요(예: 2026-9월 모의고사).');
    const placement: Record<string, unknown> = { gye: dto.gye ?? null, source: 'self' };
    if (dto.mode === 'nb' && dto.nb != null) placement.nb = dto.nb;
    const report = await this.upsertReport(
      user, user.id, user.centerId ?? null,
      { period: dto.period, examType: dto.examType ?? '수능/모의', note: dto.note, items: dto.items, placement },
      'self',
    );
    // 저장 즉시 배치표 연동 가능 여부 확인(표점 4종 또는 nb + 필수 충족).
    let linkable = false;
    try { await this.janusScore(user); linkable = true; } catch { linkable = false; }
    return { ok: true, reportId: report.id, linkable };
  }

  /** 학생 자가 입력 프리필 — 최신 자가 리포트(모드·계열·과목·세부과목). */
  async myScore(user: AuthUser) {
    if (user.role !== AccountRole.STUDENT) throw new ForbiddenException('학생만 사용할 수 있습니다.');
    const report = await this.prisma.score_report.findFirst({
      where: { student_id: user.id }, orderBy: { period: 'desc' }, include: { items: true },
    });
    if (!report) return { exists: false };
    const pl = (report.placement as Record<string, unknown> | null) ?? {};
    const nb = pl.nb;
    return {
      exists: true,
      period: report.period,
      mode: typeof nb === 'number' ? 'nb' : 'std',
      gye: (pl.gye as string | null) ?? null,
      nb: typeof nb === 'number' ? nb : null,
      items: report.items.map((i) => ({ subject: i.subject, subSubject: i.sub_subject, score: i.score == null ? null : Number(i.score), grade: i.grade })),
    };
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
    const { data, contentType, filename } = await this.files.readBytes(fileId);
    // 생기부 가드(§5 3단 비전) — 성적표는 허용, 생기부 사진은 차단. OCR·저장 전 판정.
    // forceVision: 이미 비전 LLM 을 호출하는 경로이므로 정책 llmCheck 와 무관하게 비전 판정.
    await this.guard.assertUploadAllowed(
      { buffer: Buffer.from(data), mimetype: contentType, originalname: filename },
      { forceVision: true, surface: 'scores_ocr', actorId: actor.id, actorRole: actor.role },
    );
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

  /** 학생 본인 목표 조회(janus_goal 규약). */
  async getMyGoal(user: AuthUser) {
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: user.id },
      select: { goal_tier: true, goal_avg: true, goal_university: true, goal_department: true },
    });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');
    return {
      tier: sp.goal_tier ?? null,
      avg: sp.goal_avg ?? null,
      university: sp.goal_university ?? null,
      department: sp.goal_department ?? null,
    };
  }

  /** 학생 본인 목표 설정(자기 목표만 — 격차 리포트·대시보드 반영). PUT 시맨틱: 미지정 필드는 null 로 초기화. */
  async setMyGoal(user: AuthUser, goal: { tier?: string | null; avg?: number | null; university?: string | null; department?: string | null }) {
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: user.id }, select: { account_id: true } });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');
    await this.prisma.student_profile.update({
      where: { account_id: user.id },
      data: {
        goal_tier: goal.tier ?? null,
        goal_avg: goal.avg ?? null,
        goal_university: goal.university ?? null,
        goal_department: goal.department ?? null,
      },
    });
    return this.getMyGoal(user);
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
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: studentAccountId }, select: { goal_tier: true, goal_avg: true, goal_university: true, goal_department: true } });
    return {
      student: { name: student?.name, loginId: student?.login_id },
      // janus_goal 규약 — 격차 리포트(과목별 바·목표 라벨)가 대학·학과까지 소비.
      goal: { tier: sp?.goal_tier ?? null, avg: sp?.goal_avg ?? null, university: sp?.goal_university ?? null, department: sp?.goal_department ?? null },
      points: reports.map((r) => {
        const s = r.items.map((i) => (i.score ? Number(i.score) : null)).filter((x): x is number => x != null);
        const avg = s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null;
        const pl = r.placement as Record<string, unknown> | null;
        // 누백 모드는 과목별 표점이 없어 avg=null → placement.nb(전국 누백)를 추이 지표로 노출.
        const nb = pl && typeof pl.nb === 'number' ? (pl.nb as number) : null;
        return {
          period: r.period, examType: r.exam_type, avg, nb,
          subjects: r.items.map((i) => ({ subject: i.subject, score: i.score ? Number(i.score) : null })),
          placement: includePlacement ? (pl ?? null) : null,
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

  /** janus_score export(O43·C1) — 최신 리포트를 배치표 규약으로. 성적 없으면 404 NO_SCORE. */
  async janusScore(actor: AuthUser, studentId?: string) {
    let targetId = actor.id;
    if (actor.role === AccountRole.GUARDIAN) {
      if (!studentId) throw new BadRequestException('studentId 가 필요합니다.');
      const link = await this.prisma.guardian_student_link.findFirst({ where: { guardian_id: actor.id, student_id: studentId, status: 'approved' } });
      if (!link) throw new ForbiddenException('연결된 자녀가 아닙니다.');
      targetId = studentId;
    } else if (actor.role !== AccountRole.STUDENT) {
      throw new ForbiddenException('학생·학부모만 사용할 수 있습니다.');
    }
    const report = await this.prisma.score_report.findFirst({
      where: { student_id: targetId },
      orderBy: { period: 'desc' },
      include: { items: true },
    });
    const js = toJanusScore(
      report && {
        period: report.period,
        source: report.source,
        placement: (report.placement as Record<string, unknown> | null) ?? null,
        items: report.items.map((i) => ({ subject: i.subject, score: i.score == null ? null : Number(i.score), grade: i.grade })),
      },
    );
    if (!js) throw new NotFoundException({ code: 'NO_SCORE', message: '연동할 성적이 없습니다 — 배치표에서 직접 입력하세요.' });
    return js;
  }

  /** 격차 리포트(janus_report v1·C5) — 정시(누백)/수시(내신등급) + 목표 컷 → 격차·근거·처방. */
  async gapReport(
    actor: AuthUser,
    opts: { mode: GapMode; univ: string; dept: string; cut: number; track?: string; myGrade?: number; studentId?: string },
  ): Promise<JanusReport> {
    const target = { univ: opts.univ, dept: opts.dept, cut: opts.cut, track: opts.track };
    if (opts.mode === 'susi') {
      if (opts.myGrade == null) {
        throw new BadRequestException({ code: 'NO_GRADE', message: '내신 평균등급이 필요합니다(1~9).' });
      }
      // 수시는 내신 등급 입력으로 진행 — 계열(gye)만 성적에서 가져오되 없으면 null.
      let gye: '이과' | '문과' | null = null;
      try { gye = (await this.janusScore(actor, opts.studentId)).gye; } catch { /* 성적 없어도 진행 */ }
      return buildGapReport({ mode: 'susi', gye, myValue: opts.myGrade, target });
    }
    // 정시: janus_score.nb 필요
    const js = await this.janusScore(actor, opts.studentId); // 성적 없으면 NO_SCORE throw
    if (js.nb == null) {
      throw new BadRequestException({ code: 'NO_NB', message: '전국누백이 필요합니다 — 배치표에서 점수를 적용하면 자동 계산됩니다.' });
    }
    return buildGapReport({ mode: 'jeongsi', gye: js.gye, myValue: js.nb, target });
  }

  /** 학부모 자녀 성적·배치 추이(연결·정책 게이트). */
  async guardianTrend(user: AuthUser, studentId: string) {
    const p = await this.getScorePolicy();
    if (!p.guardian) throw new ForbiddenException('성적 조회가 비활성화되어 있습니다.');
    const link = await this.prisma.guardian_student_link.findFirst({ where: { guardian_id: user.id, student_id: studentId, status: 'approved' } });
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

  /** 기간 문자열의 시간순 정렬키(연도→학기→시험차수). 문자열 정렬은 중간>기말 로 역전되므로 별도 계산. */
  private periodSortKey(period: string): number {
    const year = Number(period.match(/(\d{4})/)?.[1] ?? 0);
    const sem = Number(period.match(/(\d)\s*학기/)?.[1] ?? 1);
    const examRank = /기말/.test(period) ? 3 : /중간/.test(period) ? 2 : /모의|진단/.test(period) ? 1 : 0;
    return year * 1000 + sem * 10 + examRank;
  }

  async periods(actor: AuthUser) {
    this.assertAdmin(actor);
    const rows = await this.prisma.score_report.findMany({
      where: this.isHq(actor) ? {} : { center_id: actor.centerId },
      distinct: ['period'], select: { period: true },
    });
    // 최신 기간이 앞(내림차순) — 시간순 정렬키 기준.
    return rows.map((r) => r.period).sort((a, b) => this.periodSortKey(b) - this.periodSortKey(a));
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

  /** 관리자 대시보드 성적 통계(기간별): 분포·과목평균·배치 티어·업로드 커버리지·직전 대비 향상/하락. */
  async statistics(actor: AuthUser, period?: string) {
    this.assertAdmin(actor);
    const scope = this.isHq(actor) ? {} : { center_id: actor.centerId };
    const periods = await this.periods(actor); // desc
    const target = period && periods.includes(period) ? period : periods[0];
    const empty = { period: null as string | null, periods, totalStudents: 0, uploaded: 0, coverage: 0, avgMean: null as number | null, goalMet: 0, goalTotal: 0, distribution: [] as { bucket: string; count: number }[], subjects: [] as { subject: string; avg: number; count: number }[], tiers: [] as { tier: string; count: number }[], movement: { prevPeriod: null as string | null, improved: 0, declined: 0, same: 0, avgDelta: null as number | null } };
    if (!target) return empty;

    const reports = await this.prisma.score_report.findMany({
      where: { ...scope, period: target },
      include: { items: { select: { subject: true, score: true } } },
    });
    const totalStudents = await this.prisma.student_profile.count({ where: scope });

    const avgOf = (items: { score: unknown }[]) => {
      const s = items.map((i) => (i.score == null ? null : Number(i.score))).filter((x): x is number => x != null);
      return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
    };
    const perStudent = new Map<string, number>(); // studentId → avg(target)
    const avgs: number[] = [];
    for (const r of reports) {
      const a = avgOf(r.items);
      if (a != null) { perStudent.set(r.student_id, a); avgs.push(a); }
    }
    const avgMean = avgs.length ? Math.round((avgs.reduce((x, y) => x + y, 0) / avgs.length) * 10) / 10 : null;

    // 평균 분포(구간)
    const buckets = [{ bucket: '90+', min: 90, max: 101 }, { bucket: '80–89', min: 80, max: 90 }, { bucket: '70–79', min: 70, max: 80 }, { bucket: '60–69', min: 60, max: 70 }, { bucket: '60 미만', min: -1, max: 60 }];
    const distribution = buckets.map((b) => ({ bucket: b.bucket, count: avgs.filter((a) => a >= b.min && a < b.max).length }));

    // 과목별 평균
    const subjMap = new Map<string, { sum: number; n: number }>();
    for (const r of reports) for (const i of r.items) {
      if (i.score == null) continue;
      const cur = subjMap.get(i.subject) ?? { sum: 0, n: 0 };
      cur.sum += Number(i.score); cur.n += 1; subjMap.set(i.subject, cur);
    }
    const subjects = [...subjMap.entries()].map(([subject, v]) => ({ subject, avg: Math.round((v.sum / v.n) * 10) / 10, count: v.n })).sort((a, b) => b.avg - a.avg);

    // 배치 티어 분포
    const tierMap = new Map<string, number>();
    for (const r of reports) {
      const tier = (r.placement as { tier?: string } | null)?.tier;
      if (tier) tierMap.set(tier, (tierMap.get(tier) ?? 0) + 1);
    }
    const tiers = [...tierMap.entries()].map(([tier, count]) => ({ tier, count })).sort((a, b) => b.count - a.count);

    // 목표 달성(goal_avg 대비 target 평균)
    const goalStudents = await this.prisma.student_profile.findMany({ where: { ...scope, goal_avg: { not: null } }, select: { account_id: true, goal_avg: true } });
    let goalMet = 0;
    for (const g of goalStudents) { const a = perStudent.get(g.account_id); if (a != null && g.goal_avg != null && a >= Number(g.goal_avg)) goalMet += 1; }

    // 직전 기간 대비 향상/하락
    const idx = periods.indexOf(target);
    const prevPeriod = idx >= 0 && idx + 1 < periods.length ? periods[idx + 1] : null;
    let improved = 0, declined = 0, same = 0; const deltas: number[] = [];
    if (prevPeriod) {
      const prev = await this.prisma.score_report.findMany({ where: { ...scope, period: prevPeriod }, include: { items: { select: { score: true } } } });
      const prevAvg = new Map<string, number>();
      for (const r of prev) { const a = avgOf(r.items); if (a != null) prevAvg.set(r.student_id, a); }
      for (const [sid, cur] of perStudent) {
        const p = prevAvg.get(sid); if (p == null) continue;
        const d = Math.round((cur - p) * 10) / 10; deltas.push(d);
        if (d > 0.05) improved += 1; else if (d < -0.05) declined += 1; else same += 1;
      }
    }
    const avgDelta = deltas.length ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10 : null;

    return {
      period: target, periods, totalStudents, uploaded: perStudent.size,
      coverage: totalStudents ? Math.round((perStudent.size / totalStudents) * 100) : 0,
      avgMean, goalMet, goalTotal: goalStudents.length,
      distribution, subjects, tiers,
      movement: { prevPeriod, improved, declined, same, avgDelta },
    };
  }
}
