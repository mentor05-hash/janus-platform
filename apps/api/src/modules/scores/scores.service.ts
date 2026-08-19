import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { FilesService } from '../storage/files.service';
import { AuditService } from '../audit/audit.service';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider, ScoreOcrResult } from '../llm/llm.types';
import { SchoolRecordGuardService } from '../guard/school-record-guard.service';
import { GuardianConsentService } from '../guardian-consent/guardian-consent.service';
import { assignSubjects, parseNb, toJanusScore } from './domain/janus-score';
import {
  convertRaw,
  GachaejeomError,
  RELATIVE_KEYS,
  ABSOLUTE_KEYS,
} from './domain/gachaejeom';
import type {
  ConvertedScores,
  GachaejeomTable,
  RawInput,
  SubjectKey,
} from './domain/gachaejeom';
import { toJson } from '../../common/prisma/json';
import { toText, toTrimmedText } from '../../common/text/to-text';
import {
  buildGapReport,
  type GapMode,
  type JanusReport,
} from './domain/gap-report';

type ItemInput = {
  subject: string;
  score?: number | null;
  maxScore?: number | null;
  grade?: string | null;
  subSubject?: string | null;
};
type ManualInput = {
  studentId?: string;
  studentLoginId?: string;
  period: string;
  examType?: string;
  note?: string;
  reportFileId?: string;
  items: ItemInput[];
  placement?: Record<string, unknown> | null;
};
type MyScoreInput = {
  period: string;
  examType?: string;
  note?: string;
  /** 'raw' = 가채점 원점수(O226) — 환산표로 추정 표준점수를 만들어 저장한다. */
  mode: 'std' | 'nb' | 'raw';
  gye?: '문과' | '이과' | null;
  nb?: number | null;
  items: ItemInput[];
};

const META_KEYS = [
  '아이디',
  '학생아이디',
  '로그인아이디',
  '이름',
  '학생',
  '기간',
  '시험',
  '시험유형',
  '메모',
  'note',
  'id',
  'loginid',
];

/** 성적 업로드 — 엑셀 일괄·수동·OCR + 미업로드 학생 조회(관리자/HR). */
@Injectable()
export class ScoresService {
  private readonly logger = new Logger(ScoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly audit: AuditService,
    private readonly guard: SchoolRecordGuardService,
    private readonly guardianConsent: GuardianConsentService,
    private readonly config: ConfigService,
  ) {}

  private assertAdmin(actor: AuthUser) {
    if (actor.role !== AccountRole.ADMIN && actor.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 성적을 관리할 수 있습니다.');
    }
  }
  private isHq(actor: AuthUser) {
    return actor.role === AccountRole.ADMIN && !actor.centerId;
  }

  /**
   * 가채점 환산표 로드 — `JANUS_GACHAEJEOM_TABLE`(P2 산출 JSON, JANUS_DATA_DIR 로컬 전용).
   *
   * 요청마다 mtime 을 보고 바뀌었을 때만 다시 읽는다. 수능 당일에는 표가 **갱신될 수 있다**
   * (19:15 검증 후 보정 계수를 고쳐 재생성). 기동 시 한 번만 읽으면 그 갱신이 반영되지 않고,
   * 그걸 20:00 에 알게 된다.
   *
   * 미설치면 null 을 돌려준다 — 호출부가 400 으로 **명시적으로 거절**한다. 조용히
   * 무보정 값으로 넘어가면 추정치가 실측처럼 저장된다.
   */
  private gachaejeomCache: { mtimeMs: number; table: GachaejeomTable } | null =
    null;

  private readGachaejeomTable(): GachaejeomTable | null {
    const file = this.config.get<string>('JANUS_GACHAEJEOM_TABLE');
    if (!file) return null;
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
      return null; // 미배치 환경(개발·CI)
    }
    if (this.gachaejeomCache && this.gachaejeomCache.mtimeMs === mtimeMs) {
      return this.gachaejeomCache.table;
    }
    try {
      const table = JSON.parse(
        fs.readFileSync(file, 'utf8'),
      ) as GachaejeomTable;
      this.gachaejeomCache = { mtimeMs, table };
      return table;
    } catch (e) {
      this.logger.error(
        `가채점 환산표를 읽지 못했습니다(${file}): ${String(e)}`,
      );
      return null;
    }
  }

  /**
   * 가채점 원점수 → 저장할 항목·placement.
   *
   * 원점수를 **버리지 않고** placement.raw 에 남긴다. 12/11 실채점 표가 오면 같은 원점수로
   * 다시 환산해야 하는데, 표준점수만 남기면 그때 되돌릴 수 없다.
   */
  private convertGachaejeom(
    items: ItemInput[],
    gye: '문과' | '이과' | null | undefined,
  ) {
    const table = this.readGachaejeomTable();
    if (!table) {
      throw new BadRequestException({
        code: 'GACHAEJEOM_TABLE_UNAVAILABLE',
        message:
          '가채점 환산표가 준비되지 않았습니다. 표준점수·전국누백으로 입력하거나 잠시 후 다시 시도하세요.',
      });
    }
    const assigned = assignSubjects(
      items.map((i) => ({
        subject: String(i.subject ?? ''),
        score: i.score == null ? null : Number(i.score),
        grade: i.grade ?? null,
      })),
    );
    const raw: RawInput = {};
    for (const k of [...RELATIVE_KEYS, ...ABSOLUTE_KEYS] as SubjectKey[]) {
      const it = assigned[k];
      if (it && it.score != null) raw[k] = it.score;
    }
    if (!Object.keys(raw).length) {
      throw new BadRequestException({
        code: 'GACHAEJEOM_NO_RAW',
        message: '가채점 원점수가 없습니다. 과목별 원점수를 입력하세요.',
      });
    }

    let converted: ConvertedScores;
    try {
      converted = convertRaw(table, raw);
    } catch (e) {
      if (e instanceof GachaejeomError) {
        throw new BadRequestException({
          code: 'GACHAEJEOM_CONVERT_FAILED',
          message: e.message,
        });
      }
      throw e;
    }

    // 저장 항목: 상대평가는 추정 표준점수, 절대평가는 추정 등급. 이름은 입력 그대로 둔다.
    const outItems: ItemInput[] = [];
    for (const k of RELATIVE_KEYS) {
      const c = converted.subjects[k];
      const src = assigned[k];
      if (!c || !src) continue;
      outItems.push({
        subject: src.subject,
        score: c.std ?? null,
        maxScore: 200,
      });
    }
    for (const k of ABSOLUTE_KEYS) {
      const c = converted.subjects[k];
      const src = assigned[k];
      if (!c || !src) continue;
      outItems.push({
        subject: src.subject,
        score: null,
        grade: c.grade == null ? null : String(c.grade),
      });
    }

    const placement: Record<string, unknown> = {
      gye: gye ?? null,
      source: 'self',
      est: 'gachaejeom',
      raw,
      disclaimer: converted.disclaimer,
    };
    if (converted.uncorrected.length)
      placement.uncorrected = converted.uncorrected;

    return { items: outItems, placement, converted };
  }

  /** 학생 upsert 성적표 + 과목 교체(멱등). */
  private async upsertReport(
    actor: AuthUser,
    studentAccountId: string,
    centerId: string | null,
    input: Omit<ManualInput, 'studentId' | 'studentLoginId'>,
    source: string,
  ) {
    const items = (input.items ?? []).filter((i) => i.subject?.trim());
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.score_report.findUnique({
        where: {
          student_id_period: {
            student_id: studentAccountId,
            period: input.period,
          },
        },
      });
      const report = existing
        ? await tx.score_report.update({
            where: { id: existing.id },
            data: {
              exam_type: input.examType ?? null,
              note: input.note ?? null,
              source,
              report_file_id: input.reportFileId ?? existing.report_file_id,
              updated_at: new Date(),
              ...(input.placement
                ? { placement: toJson(input.placement) }
                : {}),
            },
          })
        : await tx.score_report.create({
            data: {
              student_id: studentAccountId,
              center_id: centerId,
              period: input.period,
              exam_type: input.examType ?? null,
              note: input.note ?? null,
              source,
              report_file_id: input.reportFileId ?? null,
              created_by: actor.id,
              ...(input.placement
                ? { placement: toJson(input.placement) }
                : {}),
            },
          });
      await tx.score_item.deleteMany({ where: { report_id: report.id } });
      if (items.length) {
        await tx.score_item.createMany({
          data: items.map((i) => ({
            report_id: report.id,
            subject: i.subject.trim(),
            score: i.score ?? null,
            max_score: i.maxScore ?? 100,
            grade: i.grade ?? null,
            sub_subject: i.subSubject ?? null,
          })),
        });
      }
      return report;
    });
  }

  async createManual(actor: AuthUser, dto: ManualInput) {
    this.assertAdmin(actor);
    if (!dto.period?.trim())
      throw new BadRequestException('기간(period)을 입력하세요.');
    const sp = await this.resolveStudent(
      actor,
      dto.studentId,
      dto.studentLoginId,
    );
    const report = await this.upsertReport(
      actor,
      sp.account_id,
      sp.center_id,
      dto,
      'manual',
    );
    return { ok: true, reportId: report.id };
  }

  /**
   * 학생 자가 성적 입력(수능) → 배치표·격차 자동 반영(C1 단일 소스).
   * 표점 모드(std): 국어·수학·탐구1·탐구2 표점 + 영어·한국사 등급. 누백 모드(nb): 전국누백 + 영어·한국사 등급.
   * 세부과목·제2외국어는 메타 저장(브리지 무시). 계열(gye)·nb 는 placement 에.
   */
  async saveMyScore(user: AuthUser, dto: MyScoreInput) {
    if (user.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 자가 입력할 수 있습니다.');
    if (!dto.period?.trim())
      throw new BadRequestException(
        '기간을 입력하세요(예: 2026-9월 모의고사).',
      );
    let placement: Record<string, unknown> = {
      gye: dto.gye ?? null,
      source: 'self',
    };
    let items = dto.items;
    let estimated: {
      complete: boolean;
      disclaimer: string;
      uncorrected: SubjectKey[];
    } | null = null;

    if (dto.mode === 'raw') {
      // 가채점(O226) — 원점수를 추정 표준점수로 바꿔 저장하고, 원점수는 placement.raw 에 남긴다.
      const c = this.convertGachaejeom(dto.items, dto.gye);
      items = c.items;
      placement = c.placement;
      estimated = {
        complete: c.converted.complete,
        disclaimer: c.converted.disclaimer,
        uncorrected: c.converted.uncorrected,
      };
    } else if (dto.mode === 'nb' && dto.nb != null) {
      placement.nb = dto.nb;
    }

    const report = await this.upsertReport(
      user,
      user.id,
      user.centerId ?? null,
      {
        period: dto.period,
        examType: dto.examType ?? '수능/모의',
        note: dto.note,
        items,
        placement,
      },
      'self',
    );
    // 저장 즉시 배치표 연동 가능 여부 확인(표점 4종 또는 nb + 필수 충족).
    let linkable = false;
    try {
      await this.janusScore(user);
      linkable = true;
    } catch {
      linkable = false;
    }
    return {
      ok: true,
      reportId: report.id,
      linkable,
      ...(estimated ? { estimated } : {}),
    };
  }

  /** 학생 자가 입력 프리필 — 최신 자가 리포트(모드·계열·과목·세부과목). */
  async myScore(user: AuthUser) {
    if (user.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 사용할 수 있습니다.');
    const report = await this.prisma.score_report.findFirst({
      where: { student_id: user.id },
      orderBy: { period: 'desc' },
      include: { items: true },
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
      items: report.items.map((i) => ({
        subject: i.subject,
        subSubject: i.sub_subject,
        score: i.score == null ? null : Number(i.score),
        grade: i.grade,
      })),
    };
  }

  private async resolveStudent(
    actor: AuthUser,
    studentId?: string,
    loginId?: string,
  ) {
    const acc = studentId
      ? await this.prisma.account.findUnique({
          where: { id: studentId },
          select: { id: true },
        })
      : loginId
        ? await this.prisma.account.findUnique({
            where: { login_id: loginId },
            select: { id: true },
          })
        : null;
    if (!acc) throw new NotFoundException('학생을 찾을 수 없습니다.');
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: acc.id },
      select: { account_id: true, center_id: true },
    });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');
    if (!this.isHq(actor) && sp.center_id !== actor.centerId)
      throw new ForbiddenException('다른 센터 학생입니다.');
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
    } catch {
      throw new BadRequestException('엑셀을 읽을 수 없습니다(.xlsx).');
    }
    if (!rows.length) throw new BadRequestException('데이터가 없습니다.');

    const result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const norm: Record<string, unknown> = {};
      for (const k of Object.keys(r)) norm[k.trim()] = r[k];
      const loginId = toTrimmedText(
        norm['아이디'] ??
          norm['학생아이디'] ??
          norm['로그인아이디'] ??
          norm['id'] ??
          '',
      );
      const period = toTrimmedText(norm['기간'] ?? '');
      if (!loginId || !period) {
        result.skipped++;
        result.errors.push(`${i + 2}행: 아이디/기간 누락`);
        continue;
      }
      const items: ItemInput[] = [];
      for (const key of Object.keys(norm)) {
        if (META_KEYS.includes(key) || META_KEYS.includes(key.toLowerCase()))
          continue;
        const v = norm[key];
        if (v === null || v === '' || v === undefined) continue;
        const num = Number(v);
        if (Number.isNaN(num)) continue;
        items.push({ subject: key, score: num, maxScore: 100 });
      }
      try {
        const sp = await this.resolveStudent(actor, undefined, loginId);
        const existed = await this.prisma.score_report.findUnique({
          where: { student_id_period: { student_id: sp.account_id, period } },
        });
        await this.upsertReport(
          actor,
          sp.account_id,
          sp.center_id,
          {
            period,
            examType:
              toText(norm['시험'] ?? norm['시험유형'] ?? '') || undefined,
            items,
          },
          'excel',
        );
        if (existed) result.updated++;
        else result.created++;
      } catch (e) {
        result.skipped++;
        result.errors.push(`${i + 2}행(${loginId}): ${(e as Error).message}`);
      }
    }
    return result;
  }

  /** 업로드용 엑셀 템플릿(가로형: 아이디·기간·시험 + 과목 컬럼) 생성. */
  template(): Buffer {
    const sample = [
      {
        아이디: 'student01',
        기간: '2026-1학기 중간고사',
        시험: '중간',
        국어: 90,
        수학: 85,
        영어: 88,
        과학: 77,
        사회: 95,
      },
      {
        아이디: 'student02',
        기간: '2026-1학기 중간고사',
        시험: '중간',
        국어: 72,
        수학: 99,
        영어: 81,
        과학: 88,
        사회: 69,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 22 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '성적');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** 성적표 이미지 OCR → 과목·점수 추출(폼 프리필). */
  async ocr(
    actor: AuthUser,
    fileId: string,
  ): Promise<ScoreOcrResult & { fileId: string }> {
    this.assertAdmin(actor);
    const { data, contentType, filename } = await this.files.readBytes(fileId);
    // 생기부 가드(§5 3단 비전) — 성적표는 허용, 생기부 사진은 차단. OCR·저장 전 판정.
    // forceVision: 이미 비전 LLM 을 호출하는 경로이므로 정책 llmCheck 와 무관하게 비전 판정.
    await this.guard.assertUploadAllowed(
      {
        buffer: Buffer.from(data),
        mimetype: contentType,
        originalname: filename,
      },
      {
        forceVision: true,
        surface: 'scores_ocr',
        actorId: actor.id,
        actorRole: actor.role,
      },
    );
    const res = await this.llm.extractScoreReport({
      imageBase64: data.toString('base64'),
      mimeType: contentType,
    });
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
      include: {
        items: { orderBy: { subject: 'asc' } },
        student: {
          include: { account: { select: { name: true, login_id: true } } },
        },
      },
      orderBy: [{ period: 'desc' }, { created_at: 'desc' }],
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      studentName: r.student.account.name,
      loginId: r.student.account.login_id,
      period: r.period,
      examType: r.exam_type,
      source: r.source,
      reportFileId: r.report_file_id,
      note: r.note,
      placement: (r.placement as Record<string, unknown> | null) ?? null,
      createdAt: r.created_at,
      items: r.items.map((i) => ({
        subject: i.subject,
        score: i.score ? Number(i.score) : null,
        maxScore: i.max_score ? Number(i.max_score) : null,
        grade: i.grade,
      })),
      avg: (() => {
        const s = r.items
          .map((i) => (i.score ? Number(i.score) : null))
          .filter((x): x is number => x != null);
        return s.length
          ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10
          : null;
      })(),
    }));
  }

  /** 배치 라인 저장 — 외부 배치표 서비스 결과 또는 관리자 입력. */
  async setPlacement(
    actor: AuthUser,
    reportId: string,
    placement: Record<string, unknown>,
  ) {
    this.assertAdmin(actor);
    const r = await this.prisma.score_report.findUnique({
      where: { id: reportId },
      select: { center_id: true },
    });
    if (!r) throw new NotFoundException('성적표를 찾을 수 없습니다.');
    if (!this.isHq(actor) && r.center_id !== actor.centerId)
      throw new ForbiddenException('다른 센터 성적입니다.');
    await this.prisma.score_report.update({
      where: { id: reportId },
      data: {
        placement: toJson({
          ...placement,
          source: placement.source ?? 'manual',
          updatedAt: new Date().toISOString(),
        }),
      },
    });
    await this.audit.record(actor, {
      action: 'scores.placement',
      targetType: 'score_report',
      targetId: reportId,
      summary: `배치 라인 입력(${toText(placement.tier)} ${toText(placement.line)})`,
      meta: placement,
    });
    return { ok: true };
  }

  /** 학생 목표(대학 라인/평균) 설정. */
  async setGoal(
    actor: AuthUser,
    studentLoginId: string,
    tier: string | null,
    avg: number | null,
  ) {
    this.assertAdmin(actor);
    const sp = await this.resolveStudent(actor, undefined, studentLoginId);
    await this.prisma.student_profile.update({
      where: { account_id: sp.account_id },
      data: { goal_tier: tier, goal_avg: avg },
    });
    await this.audit.record(actor, {
      action: 'scores.goal',
      targetType: 'student',
      targetId: sp.account_id,
      summary: `학생 목표 설정(${tier ?? '-'}·평균 ${avg ?? '-'})`,
      meta: { studentLoginId, tier, avg },
    });
    return { ok: true };
  }

  /** 학생 본인 목표 조회(janus_goal 규약). */
  async getMyGoal(user: AuthUser) {
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: user.id },
      select: {
        goal_tier: true,
        goal_avg: true,
        goal_university: true,
        goal_department: true,
      },
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
  async setMyGoal(
    user: AuthUser,
    goal: {
      tier?: string | null;
      avg?: number | null;
      university?: string | null;
      department?: string | null;
    },
  ) {
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: user.id },
      select: { account_id: true },
    });
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

  // ── 목표 후보 ──
  // 기준 목표(goal_*) 는 그대로 두고, 비교용 후보를 몇 개 등록해 같은 성적으로 밴드를 나란히 본다.
  // 후보는 **학생이 직접 등록**한 것만(본인만 조회 — 학부모·선생님 노출은 별도 결정 전까지 하지 않는다).
  // 하지 않는 것: 자동 제안(실컷 데이터·정시 cut 의미 확정 선행) · 조합 추천 · 종합 합격확률(N28 미결·착수금지).
  // 상한 3 — 응답 크기·가독성 + '조합 최적화'로 흘러가지 않도록 코드 레벨 제약(N28 침범 방지).
  private static readonly CANDIDATE_MAX = 3;

  async listGoalCandidates(user: AuthUser, mode?: GapMode) {
    const rows = await this.prisma.student_goal_candidate.findMany({
      where: { student_id: user.id, ...(mode ? { mode } : {}) },
      orderBy: [{ mode: 'asc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
    });
    return rows.map((r) => ({ ...r, cut: Number(r.cut) }));
  }

  async addGoalCandidate(
    user: AuthUser,
    dto: {
      mode: GapMode;
      univ: string;
      dept: string;
      cut: number;
      track?: string | null;
      note?: string | null;
      cutSource?: 'targets_file' | 'manual';
    },
  ) {
    const count = await this.prisma.student_goal_candidate.count({
      where: { student_id: user.id, mode: dto.mode },
    });
    if (count >= ScoresService.CANDIDATE_MAX) {
      throw new BadRequestException(
        `후보는 모드별 최대 ${ScoresService.CANDIDATE_MAX}개까지 등록할 수 있습니다.`,
      );
    }
    const created = await this.prisma.student_goal_candidate
      .create({
        data: {
          student_id: user.id,
          mode: dto.mode,
          univ: dto.univ.trim(),
          dept: dto.dept.trim(),
          cut: dto.cut,
          cut_source: dto.cutSource ?? 'manual',
          track: dto.track?.trim() || null,
          note: dto.note?.trim() || null,
          sort_order: count,
        },
      })
      .catch(() => {
        throw new BadRequestException('이미 등록한 대학·학과입니다.');
      });
    return { ...created, cut: Number(created.cut) };
  }

  async removeGoalCandidate(user: AuthUser, id: string) {
    const row = await this.prisma.student_goal_candidate.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('후보를 찾을 수 없습니다.');
    if (row.student_id !== user.id)
      throw new ForbiddenException('본인 후보만 삭제할 수 있습니다.');
    await this.prisma.student_goal_candidate.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** 이력 통계의 창 — 누백이 기록된 최근 회차 수. 두 소비 경로(변동성 판정·후보 비교)가 같은 값을 봐야 한다. */
  private static readonly NB_WINDOW = 12;

  /**
   * 누백 이력 — **누백이 기록된 최근 12회, 오래된 순**(마지막이 최신 = janusScore 가 고른 값).
   * 변동성 판정(O108)과 후보 비교 헤더가 **같은 창**을 쓰도록 단일화한 유일한 조달 지점이다.
   * 저장값만 읽는다 — 예측·환산은 하지 않는다(O65).
   *
   * ⚠ 이전 구현은 `orderBy asc + take 12` 라 '최근 12회'가 아니라 **가장 오래된 12회**를 읽었다.
   *   회차가 13개 이상이면 점 판정(gap.band)의 근거인 최신 회차가 창에서 **확정적으로** 빠져
   *   'best~worst' 밖의 밴드가 그 옆에 표시되는 모순이 생긴다(janusScore 도 같은 period 정렬을 쓴다).
   * ⚠ `period` 문자열 정렬이 실제 시간순이 아닌 문제(periodSortKey 참조)는 여기서 고치지 않는다 —
   *   janusScore·myScore·archiveReport 가 모두 같은 키를 쓰므로 **창과 '최신' 선정이 같은 정렬을 공유**하는 것이
   *   지금은 정합에 더 중요하다(정렬 키 통일은 별건).
   */
  private async recentNbValues(studentId: string): Promise<number[]> {
    // 누백이 없는 회차(표점 모드 등)가 섞이므로 넉넉히 읽고 nb 보유분만 12개까지 채운다 — 창 크기가 '누백 회차' 기준이 되게.
    const rows = await this.prisma.score_report.findMany({
      where: { student_id: studentId },
      orderBy: { period: 'desc' },
      select: { placement: true },
      take: ScoresService.NB_WINDOW * 4,
    });
    const vals: number[] = [];
    for (const r of rows) {
      const nb = parseNb((r.placement as Record<string, unknown> | null)?.nb);
      if (nb != null) vals.push(nb);
      if (vals.length >= ScoresService.NB_WINDOW) break;
    }
    return vals.reverse(); // 최신→오래된 순으로 읽었으니 계약(오래된 순)으로 되돌린다
  }

  /**
   * 후보 목록 헤더용 회차 분포 — 후보(컷)와 **무관한** '내가 얼마나 흔들리나' 요약.
   * 후보별 '이 컷에서 판정이 뒤집히나'는 volatility 가 담당한다(역할이 다르므로 둘 다 있다).
   * 같은 recent 배열에서 파생시켜 헤더의 '최근 N회 a~b' 와 후보 판정이 어긋나지 않게 한다.
   */
  private static nbSpread(recent: number[]) {
    if (recent.length < 2) return null;
    const best = Math.min(...recent); // 누백은 낮을수록 상위
    const worst = Math.max(...recent);
    return {
      count: recent.length,
      best,
      worst,
      spread: Math.round((worst - best) * 100) / 100,
    };
  }

  /**
   * 목표 후보 비교 — 같은 내 성적으로 후보별 밴드·격차를 나란히 산출.
   * gap-report 정본(buildGapReport)을 후보 수만큼 순수 호출한다(O102 — 엔진 무변경).
   * evidence·disclaimer 는 후보마다 동일하므로 한 번만 실어 중복·오해를 줄인다.
   */
  async goalCandidateReport(user: AuthUser, mode: GapMode, myGrade?: number) {
    const candidates = await this.listGoalCandidates(user, mode);
    let myValue: number;
    // 가채점 추정치 여부(O226) — 있으면 리포트가 면책을 함께 낸다.
    let est: 'gachaejeom' | null = null;
    let gye: '이과' | '문과' | null = null;
    if (mode === 'susi') {
      if (myGrade == null)
        throw new BadRequestException({
          code: 'NO_GRADE',
          message: '내신 평균등급이 필요합니다(1~9).',
        });
      myValue = myGrade;
      try {
        const js = await this.janusScore(user);
        gye = js.gye;
        est = js.est ?? null;
      } catch {
        /* 성적 없어도 진행 */
      }
    } else {
      const js = await this.janusScore(user); // 성적 없으면 NO_SCORE
      est = js.est ?? null;
      if (js.nb == null)
        throw new BadRequestException({
          code: 'NO_NB',
          message:
            '전국누백이 필요합니다 — 배치표에서 점수를 적용하면 자동 계산됩니다.',
        });
      myValue = js.nb;
      gye = js.gye;
    }
    // 회차 이력은 후보와 무관한 학생 단위 값 → **루프 밖에서 1회** 조회해 모든 후보에 같은 배열을 넘긴다(쿼리 순증 0).
    // 수시는 등급이 매 요청 입력이라 비교할 이력이 없다.
    const recent = mode === 'jeongsi' ? await this.recentNbValues(user.id) : [];
    let anyAdmitHint = false;
    // 방향(improving|worsening|mixed)은 회차 계열만의 함수라 **후보 불변값**이다 → 목록 레벨로 올린다.
    // 서비스에서 다시 계산하지 않고 정본 산출물에서 들어올린다(임계값 '3회 이상' 규칙이 갈라지지 않게).
    let direction: NonNullable<JanusReport['volatility']>['direction'] = null;
    const reports = candidates.map((c) => {
      const r = buildGapReport({
        mode,
        gye,
        myValue,
        target: {
          univ: c.univ,
          dept: c.dept,
          cut: c.cut,
          track: c.track ?? undefined,
        },
        recent: recent.length ? recent : undefined,
      });
      // admitProbHint(정시 컷근접 37%)는 **후보별로 싣지 않는다** — 컷이 촘촘하면 인접 후보 전부에 같은 37% 가 붙어
      // "세 대학 합격률이 같다"로 오독된다. 집단 백테스트 상수이므로 목록 수준에서 1회만 안내한다.
      const { admitProbHint, ...gap } = r.gap;
      if (admitProbHint != null) anyAdmitHint = true;
      // volatility 는 **컷에 종속된 3키만** 투영한다 — count·best·worst·spread·smallSample·message 는 후보 불변값이라
      // 후보 3개에 똑같은 문장이 3번 실린다(admitProbHint 를 목록 1회로 올린 것과 같은 판단). 범위·표본은 목록 레벨이 담당.
      const v = r.volatility;
      direction ??= v?.direction ?? null;
      const volatility = v
        ? {
            bestBand: v.bestBand,
            worstBand: v.worstBand,
            consistent: v.consistent,
          }
        : null;
      return {
        id: c.id,
        univ: c.univ,
        dept: c.dept,
        track: c.track,
        cutSource: c.cut_source,
        note: c.note,
        cut: c.cut,
        ...gap,
        volatility,
      };
    });
    // 격차 작은 순(안정 → 상향)으로 정렬해 포트폴리오 균형이 한눈에 보이도록.
    // 기준은 **최신 회차 점 판정(delta)** 이다 — 범위를 함께 보여주면 '최선/최악 중 무엇 기준인가'가 열리므로
    // 정렬을 바꾸지 않고 sortKey·라벨로 답한다.
    reports.sort((a, b) => a.delta - b.delta);
    const sample = candidates.length
      ? buildGapReport({
          mode,
          gye,
          myValue,
          target: {
            univ: candidates[0].univ,
            dept: candidates[0].dept,
            cut: candidates[0].cut,
          },
        })
      : null;
    const spread = mode === 'jeongsi' ? ScoresService.nbSpread(recent) : null;
    return {
      mode,
      myValue,
      gye,
      /**
       * 가채점 추정치 표시(O226 · 계약 §9). 실채점이면 null 이라 기존 화면은 그대로다.
       * 추정치를 실측처럼 보이게 두지 않는다 — 수능 당일 이 리포트가 지원 판단에 쓰인다.
       */
      est,
      estNotice:
        est === 'gachaejeom'
          ? '가채점 기반 추정치입니다. 실채점 결과와 차이가 있을 수 있습니다.'
          : null,
      unit:
        sample?.unit ??
        (mode === 'susi'
          ? { label: '내신 등급', suffix: '등급' }
          : { label: '전국누백', suffix: '%' }),
      // 정시만 이력 분포 제공(수시 등급은 사용자 입력이라 이력이 없다).
      spread,
      /** 표본 과소 판정은 정본(buildVolatility)에서 들어올린다 — 클라마다 `count < 3` 을 재구현하면 임계값이 드리프트한다. */
      smallSample: spread ? spread.count < 3 : null,
      /** 판정이 뒤집히는 후보 수 — 0이면 '흔들렸지만 순서는 그대로'로 안내해 불필요한 불안을 만들지 않는다. */
      flipCount: reports.filter((r) => r.volatility && !r.volatility.consistent)
        .length,
      /**
       * 회차 방향(3회 이상에서만). **꾸준히 향상한 학생에게 '회차에 따라 갈려요'만 보여주면
       * 향상을 운·변동으로 잘못 프레이밍한다** — 도메인 message 에서 이미 분기한 것과 같은 이유로
       * 목록 카피도 여기서 분기해야 한다(후보 화면은 도메인 message 를 쓰지 않는다).
       */
      direction,
      /** 정렬 기준 — 화면 라벨('안전한 순서')이 최선/최악 기준으로 오독되지 않게 이름으로 못박는다. */
      sortKey: 'delta' as const,
      /** 수시에 변동 표시가 없는 **사유**(침묵하면 '수시는 더 확실하다'로 오독된다). 사실 진술만 — 지원 약속 금지. */
      volatilityNote:
        mode === 'susi'
          ? '내신 평균등급은 매번 직접 입력하는 값이라 회차 이력이 없어 변동 판정을 제공하지 않아요.'
          : null,
      candidates: reports,
      // 컷 근접 후보가 하나라도 있을 때만, 목록 전체에 1회 표기(후보별 확률로 오독되지 않도록 문구를 고정).
      admitHintNote: anyAdmitHint
        ? '컷 근접 구간 참고 — 작년 70%컷 지원자 집단의 실제 합격률은 약 37%였습니다(집단 백테스트 상수이며 개별 학과 합격률이 아닙니다).'
        : null,
      evidence: sample?.evidence ?? [],
      disclaimer: sample?.disclaimer ?? '',
    };
  }

  /** 데모 배치 추정 — 평균 → 등급/라인/샘플 대학·학과. 실 배치표 서비스가 덮어쓸 자리. */
  private static estimateLine(avg: number): {
    tier: string;
    line: string;
    universities: string[];
    departments: string[];
  } {
    if (avg >= 95)
      return {
        tier: '최상위',
        line: '서울 최상위·의약학 라인',
        universities: ['서울대', '연세대', '고려대'],
        departments: ['의예', '컴퓨터공학', '경영'],
      };
    if (avg >= 90)
      return {
        tier: '상위',
        line: '서성한·중경외시 라인',
        universities: ['성균관대', '한양대', '중앙대'],
        departments: ['전자공학', '경제', '미디어'],
      };
    if (avg >= 85)
      return {
        tier: '중상위',
        line: '건동홍·국숭세단 라인',
        universities: ['홍익대', '국민대', '숭실대'],
        departments: ['소프트웨어', '건축', '경영'],
      };
    if (avg >= 80)
      return {
        tier: '중위',
        line: '인서울 하위·수도권 라인',
        universities: ['가천대', '명지대', '경기대'],
        departments: ['컴퓨터', '전기', '행정'],
      };
    if (avg >= 70)
      return {
        tier: '중하위',
        line: '수도권·지방 국립 라인',
        universities: ['한국공대', '충북대', '강원대'],
        departments: ['기계', '화학', '사회복지'],
      };
    return {
      tier: '기초',
      line: '지방권·전문대 라인',
      universities: ['지방 사립'],
      departments: ['보건', '실용'],
    };
  }

  async estimatePlacements(actor: AuthUser, period: string) {
    this.assertAdmin(actor);
    if (!period?.trim()) throw new BadRequestException('기간을 지정하세요.');
    const reports = await this.prisma.score_report.findMany({
      where: {
        period,
        ...(this.isHq(actor) ? {} : { center_id: actor.centerId }),
      },
      include: { items: { select: { score: true } } },
    });
    let updated = 0;
    for (const r of reports) {
      const s = r.items
        .map((i) => (i.score ? Number(i.score) : null))
        .filter((x): x is number => x != null);
      if (!s.length) continue;
      const avg = s.reduce((a, b) => a + b, 0) / s.length;
      const est = ScoresService.estimateLine(avg);
      await this.prisma.score_report.update({
        where: { id: r.id },
        data: {
          placement: toJson({
            ...est,
            avg: Math.round(avg * 10) / 10,
            source: 'demo',
            updatedAt: new Date().toISOString(),
          }),
        },
      });
      updated++;
    }
    return {
      updated,
      note: '데모 추정입니다. 실제 배치표 서비스 결과가 있으면 덮어쓰세요.',
    };
  }

  /** 학생 성적 추이 + 배치 라인 변화(회차 순) — 공통 빌더. */
  private async buildTrend(
    studentAccountId: string,
    includePlacement: boolean,
  ) {
    const reports = await this.prisma.score_report.findMany({
      where: { student_id: studentAccountId },
      include: { items: { orderBy: { subject: 'asc' } } },
      orderBy: { created_at: 'asc' },
    });
    const student = await this.prisma.account.findUnique({
      where: { id: studentAccountId },
      select: { name: true, login_id: true },
    });
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentAccountId },
      select: {
        goal_tier: true,
        goal_avg: true,
        goal_university: true,
        goal_department: true,
      },
    });
    return {
      student: { name: student?.name, loginId: student?.login_id },
      // janus_goal 규약 — 격차 리포트(과목별 바·목표 라벨)가 대학·학과까지 소비.
      goal: {
        tier: sp?.goal_tier ?? null,
        avg: sp?.goal_avg ?? null,
        university: sp?.goal_university ?? null,
        department: sp?.goal_department ?? null,
      },
      points: reports.map((r) => {
        const s = r.items
          .map((i) => (i.score ? Number(i.score) : null))
          .filter((x): x is number => x != null);
        const avg = s.length
          ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10
          : null;
        const pl = r.placement as Record<string, unknown> | null;
        // 누백 모드는 과목별 표점이 없어 avg=null → placement.nb(전국 누백)를 추이 지표로 노출.
        const nb = pl && typeof pl.nb === 'number' ? pl.nb : null;
        return {
          period: r.period,
          examType: r.exam_type,
          avg,
          nb,
          subjects: r.items.map((i) => ({
            subject: i.subject,
            score: i.score ? Number(i.score) : null,
          })),
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
  /**
   * **선생님↔학생 관계 게이트**(O107) — 지도 관계가 있는 선생님만 학생 데이터를 본다.
   *   ①선생님 역할 ②같은 센터 ③**담임이거나 상담 이력(booking)이 있음**
   * 학부모(O105)와 달리 연령이 권한을 주지 않는다 — 직업적 관계가 근거다.
   * 관례 정합: consultation 은 이미 '본인 담당 + 타 교사 FINAL·마스킹'의 관계 기반 모델을 쓴다.
   */
  private async assertTeacherStudentAccess(actor: AuthUser, studentId: string) {
    if (actor.role !== AccountRole.TEACHER)
      throw new ForbiddenException('선생님만 조회할 수 있습니다.');
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
      select: { account_id: true, center_id: true, homeroom_teacher_id: true },
    });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');
    if (sp.center_id !== actor.centerId)
      throw new ForbiddenException('다른 센터 학생입니다.');
    if (sp.homeroom_teacher_id === actor.id) return sp; // 담임
    const booked = await this.prisma.booking.findFirst({
      where: { student_id: studentId, teacher_id: actor.id },
      select: { id: true },
    });
    if (!booked) {
      throw new ForbiddenException({
        code: 'NO_TEACHING_RELATION',
        message: '담임이거나 상담을 진행한 학생만 조회할 수 있습니다.',
      });
    }
    return sp;
  }

  /** 선생님 성적·배치 추이 — 관계 게이트(O107) + 배치 노출은 전사 정책을 따른다. */
  async teacherTrend(actor: AuthUser, studentId: string) {
    const sp = await this.assertTeacherStudentAccess(actor, studentId);
    // 배치 라인은 학생·학부모와 동일하게 정책(p.placement)을 따른다 — 선생님만 우회하던 비대칭 제거(O107).
    const p = await this.getScorePolicy();
    return this.buildTrend(sp.account_id, !!p.placement);
  }

  /**
   * 학생 산출물 이력(선생님) — 관계 게이트(O107) 통과 시에만. 지도 목적의 최소 열람.
   * 학부모 경로(O105)와 게이트가 다르다: 여기서는 연령·동의가 아니라 **지도 관계**가 근거다.
   */
  async listStudentReportsForTeacher(
    actor: AuthUser,
    studentId: string,
    kind = 'gap',
    limit = 20,
  ) {
    await this.assertTeacherStudentAccess(actor, studentId);
    return this.prisma.janus_report.findMany({
      where: { student_id: studentId, kind },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
      select: {
        id: true,
        kind: true,
        status: true,
        created_at: true,
        payload: true,
      },
    });
  }

  // ── 노출 정책(본사 마스터) ──
  private static readonly POLICY_KEY = 'score_visibility';
  private static readonly POLICY_DEFAULT = {
    student: true,
    guardian: true,
    placement: true,
  };

  async getScorePolicy() {
    const row = await this.prisma.system_setting.findUnique({
      where: { key: ScoresService.POLICY_KEY },
    });
    return {
      ...ScoresService.POLICY_DEFAULT,
      ...((row?.value as object) ?? {}),
    };
  }

  async setScorePolicy(
    actor: AuthUser,
    dto: { student?: boolean; guardian?: boolean; placement?: boolean },
  ) {
    // 본사 마스터관리자(admin + 센터 미소속)만 전사 정책 변경
    if (!this.isHq(actor))
      throw new ForbiddenException(
        '전사 노출 정책은 본사 마스터관리자만 변경할 수 있습니다.',
      );
    const next = { ...(await this.getScorePolicy()), ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: ScoresService.POLICY_KEY },
      create: {
        key: ScoresService.POLICY_KEY,
        value: toJson(next),
        updated_by: actor.id,
      },
      update: {
        value: toJson(next),
        updated_by: actor.id,
        updated_at: new Date(),
      },
    });
    await this.audit.record(actor, {
      action: 'scores.policy',
      targetType: 'system_setting',
      summary: `성적 노출 정책 변경(학생 ${next.student ? 'ON' : 'OFF'}·학부모 ${next.guardian ? 'ON' : 'OFF'}·배치 ${next.placement ? 'ON' : 'OFF'})`,
      meta: next,
    });
    return next;
  }

  /** 학생/학부모 앱 접근 가능 여부(탭 표시용). */
  async access(user: AuthUser) {
    const p = await this.getScorePolicy();
    if (user.role === AccountRole.STUDENT)
      return {
        showTrend: !!p.student,
        showPlacement: !!p.student && !!p.placement,
      };
    if (user.role === AccountRole.GUARDIAN)
      return {
        showTrend: !!p.guardian,
        showPlacement: !!p.guardian && !!p.placement,
      };
    return { showTrend: true, showPlacement: true };
  }

  /** 학생 본인 성적·배치 추이(정책 게이트). */
  async selfTrend(user: AuthUser) {
    const p = await this.getScorePolicy();
    if (!p.student)
      throw new ForbiddenException('성적 조회가 비활성화되어 있습니다.');
    return this.buildTrend(user.id, !!p.placement);
  }

  /** janus_score export(O43·C1) — 최신 리포트를 배치표 규약으로. 성적 없으면 404 NO_SCORE. */
  async janusScore(actor: AuthUser, studentId?: string) {
    let targetId = actor.id;
    if (actor.role === AccountRole.GUARDIAN) {
      if (!studentId) throw new BadRequestException('studentId 가 필요합니다.');
      const link = await this.prisma.guardian_student_link.findFirst({
        where: {
          guardian_id: actor.id,
          student_id: studentId,
          status: 'approved',
        },
      });
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
        items: report.items.map((i) => ({
          subject: i.subject,
          score: i.score == null ? null : Number(i.score),
          grade: i.grade,
        })),
      },
    );
    if (!js)
      throw new NotFoundException({
        code: 'NO_SCORE',
        message: '연동할 성적이 없습니다 — 배치표에서 직접 입력하세요.',
      });
    return js;
  }

  /**
   * 격차 리포트 대상 학생 확정 — **이후 모든 경로가 이 반환값만 쓴다**(opts.studentId 재사용 금지).
   *
   * 왜 별도 단계인가(IDOR 이력): janusScore 는 **학생 액터에게 studentId 를 조용히 무시**한다(예외 없음).
   * 그래서 '게이트를 통과했다'고 착각한 채 이력 조회·적재가 opts.studentId 를 그대로 써서
   * 타인의 누백 이력 통계를 읽고(volatility) 타인 이력에 행을 쓸 수 있었다.
   * 보호자도 승인 연결만으로는 부족하다 — 자녀 데이터 열람은 O105 연령별 동의 게이트를 통과해야 한다
   * (listChildReports 와 같은 게이트). 여기만 빠져 있으면 '이력 조회'는 막히는데 '새로 생성'으로 우회된다.
   */
  private async resolveGapTarget(
    actor: AuthUser,
    studentId?: string,
  ): Promise<string> {
    if (actor.role === AccountRole.GUARDIAN) {
      if (!studentId) throw new BadRequestException('studentId 가 필요합니다.');
      await this.guardianConsent.assertChildDataAccess(
        actor,
        studentId,
        'report',
      );
      return studentId;
    }
    if (actor.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생·학부모만 사용할 수 있습니다.');
    // 조용히 무시하지 않고 **거절**한다 — 무시하면 호출자가 성공으로 오해하고, 같은 실수가 재발한다.
    if (studentId && studentId !== actor.id)
      throw new ForbiddenException('본인 리포트만 조회할 수 있습니다.');
    return actor.id;
  }

  /** 격차 리포트(janus_report v1·C5) — 정시(누백)/수시(내신등급) + 목표 컷 → 격차·근거·처방. */
  async gapReport(
    actor: AuthUser,
    opts: {
      mode: GapMode;
      univ: string;
      dept: string;
      cut: number;
      track?: string;
      myGrade?: number;
      studentId?: string;
    },
  ): Promise<JanusReport> {
    const target = {
      univ: opts.univ,
      dept: opts.dept,
      cut: opts.cut,
      track: opts.track,
    };
    const targetId = await this.resolveGapTarget(actor, opts.studentId);
    if (opts.mode === 'susi') {
      if (opts.myGrade == null) {
        throw new BadRequestException({
          code: 'NO_GRADE',
          message: '내신 평균등급이 필요합니다(1~9).',
        });
      }
      // 수시는 내신 등급 입력으로 진행 — 계열(gye)만 성적에서 가져오되 없으면 null.
      let gye: '이과' | '문과' | null = null;
      let est: 'gachaejeom' | null = null;
      // catch 는 **성적 부재(NO_SCORE)만** 삼킨다 — 인가 실패를 함께 뭉개면 게이트가 조용히 사라진다.
      try {
        const js = await this.janusScore(actor, targetId);
        gye = js.gye;
        est = js.est ?? null;
      } catch (e) {
        if (!(e instanceof NotFoundException)) throw e;
      }
      const susi = this.markEstimated(
        buildGapReport({
          mode: 'susi',
          gye,
          myValue: opts.myGrade,
          target,
        }),
        est,
      );
      await this.archiveReport(targetId, susi);
      return susi;
    }
    // 정시: janus_score.nb 필요
    const js = await this.janusScore(actor, targetId); // 성적 없으면 NO_SCORE throw
    if (js.nb == null) {
      throw new BadRequestException({
        code: 'NO_NB',
        message:
          '전국누백이 필요합니다 — 배치표에서 점수를 적용하면 자동 계산됩니다.',
      });
    }
    // 회차 변동성(O108) — 정시만. 수시 등급은 매 요청 입력값이라 비교할 이력이 없다.
    const recent = await this.recentNbValues(targetId);
    const jeongsi = this.markEstimated(
      buildGapReport({
        mode: 'jeongsi',
        gye: js.gye,
        myValue: js.nb,
        target,
        recent,
      }),
      js.est,
    );
    await this.archiveReport(targetId, jeongsi);
    return jeongsi;
  }

  /** 가채점 산출이면 리포트에 표시를 얹는다(O226). 엔진은 성적의 출처를 모르므로 서비스가 붙인다. */
  private markEstimated<T extends { est?: 'gachaejeom'; estNotice?: string }>(
    report: T,
    est: 'gachaejeom' | null | undefined,
  ): T {
    if (est !== 'gachaejeom') return report;
    return {
      ...report,
      est,
      estNotice:
        '가채점 기반 추정치입니다. 실채점 결과와 차이가 있을 수 있습니다.',
    };
  }

  // ── janus_report 이력(append-only) ──
  // '무엇을 언제 산출해 보여줬나'의 재현용. 리포트는 조회 시마다 다시 계산되므로 **동일 산출은 적재하지 않는다**
  // (같은 목표·같은 내 위치 → 행 폭증 방지). 조회 접근 감사는 audit_log 가 담당하므로 여기엔 actor 를 남기지 않는다.

  /** 산출물 동일성 서명 — 모드·목표(대학·학과·컷)·내 위치·밴드가 같으면 같은 산출로 본다. */
  private static reportSig(r: JanusReport): string {
    return [
      r.kind,
      r.mode,
      r.target.univ,
      r.target.dept,
      r.target.cut,
      r.generatedFor.value,
      r.gap.band,
      r.gap.delta,
    ].join('|');
  }

  /** 이력 적재(변경분만). 실패가 리포트 응답을 막지 않도록 격리한다. */
  private async archiveReport(
    studentId: string,
    report: JanusReport,
  ): Promise<void> {
    try {
      const latest = await this.prisma.janus_report.findFirst({
        where: { student_id: studentId, kind: report.kind },
        orderBy: { created_at: 'desc' },
        select: { payload: true },
      });
      const prev = latest?.payload as unknown as JanusReport | null;
      if (
        prev &&
        ScoresService.reportSig(prev) === ScoresService.reportSig(report)
      )
        return; // 동일 산출 → skip
      // 근거 성적(있으면) 연결 — 정시는 최신 회차의 누백을 썼다.
      const src = await this.prisma.score_report.findFirst({
        where: { student_id: studentId },
        orderBy: { period: 'desc' },
        select: { id: true },
      });
      await this.prisma.janus_report.create({
        data: {
          student_id: studentId,
          kind: report.kind,
          status: 'final',
          payload: toJson(report),
          score_report_id: src?.id ?? null,
        },
      });
    } catch (e) {
      // 학생 프로필 미존재(FK)·DB 오류 등은 무해하게 넘긴다 — 이력은 부가 기능이고 리포트가 본선이다.
      this.logger.warn(
        `janus_report 적재 실패(student=${studentId}): ${(e as Error).message}`,
      );
    }
  }

  /**
   * 자녀 산출물 이력(보호자) — **연령별 동의 게이트 통과 시에만**(O105).
   * 미성년: 보호자 본인확인+전달동의 / 성인: 학생 본인의 공유 동의. 미충족이면 403(코드로 사유 구분).
   */
  async listChildReports(
    guardian: AuthUser,
    studentId: string,
    kind = 'gap',
    limit = 20,
  ) {
    await this.guardianConsent.assertChildDataAccess(
      guardian,
      studentId,
      'report',
    );
    return this.prisma.janus_report.findMany({
      where: { student_id: studentId, kind },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
      select: {
        id: true,
        kind: true,
        status: true,
        created_at: true,
        payload: true,
      },
    });
  }

  /** 내 산출물 이력(최신순) — 학생 본인. */
  async listMyReports(user: AuthUser, kind = 'gap', limit = 20) {
    const rows = await this.prisma.janus_report.findMany({
      where: { student_id: user.id, kind },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
      select: {
        id: true,
        kind: true,
        status: true,
        created_at: true,
        payload: true,
      },
    });
    return rows;
  }

  /** 학부모 자녀 성적·배치 추이(연결·정책 게이트). */
  async guardianTrend(user: AuthUser, studentId: string) {
    const p = await this.getScorePolicy();
    if (!p.guardian)
      throw new ForbiddenException('성적 조회가 비활성화되어 있습니다.');
    const link = await this.prisma.guardian_student_link.findFirst({
      where: {
        guardian_id: user.id,
        student_id: studentId,
        status: 'approved',
      },
    });
    if (!link) throw new ForbiddenException('연결된 자녀가 아닙니다.');
    return this.buildTrend(studentId, !!p.placement);
  }

  /** 성적 CSV(현 목록) — 아이디·이름·시험·과목별 점수·평균·배치. */
  async exportCsv(actor: AuthUser, period?: string): Promise<string> {
    const rows = await this.list(actor, period);
    const subjects = Array.from(
      new Set(rows.flatMap((r) => r.items.map((i) => i.subject))),
    );
    const head = [
      '아이디',
      '이름',
      '기간',
      '시험',
      ...subjects,
      '평균',
      '배치',
    ];
    const esc = (v: unknown) => {
      const s = toText(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head.join(',')];
    for (const r of rows) {
      const byS = new Map(r.items.map((i) => [i.subject, i.score]));
      const cells = [
        r.loginId,
        r.studentName,
        r.period,
        r.examType ?? '',
        ...subjects.map((s) => byS.get(s) ?? ''),
        r.avg ?? '',
        r.placement
          ? `${toText(r.placement.tier)} ${toText(r.placement.line)}`.trim()
          : '',
      ];
      lines.push(cells.map(esc).join(','));
    }
    return '﻿' + lines.join('\n'); // BOM(엑셀 한글)
  }

  /** 기간 문자열의 시간순 정렬키(연도→학기→시험차수). 문자열 정렬은 중간>기말 로 역전되므로 별도 계산. */
  private periodSortKey(period: string): number {
    const year = Number(period.match(/(\d{4})/)?.[1] ?? 0);
    const sem = Number(period.match(/(\d)\s*학기/)?.[1] ?? 1);
    const examRank = /기말/.test(period)
      ? 3
      : /중간/.test(period)
        ? 2
        : /모의|진단/.test(period)
          ? 1
          : 0;
    return year * 1000 + sem * 10 + examRank;
  }

  async periods(actor: AuthUser) {
    this.assertAdmin(actor);
    const rows = await this.prisma.score_report.findMany({
      where: this.isHq(actor) ? {} : { center_id: actor.centerId },
      distinct: ['period'],
      select: { period: true },
    });
    // 최신 기간이 앞(내림차순) — 시간순 정렬키 기준.
    return rows
      .map((r) => r.period)
      .sort((a, b) => this.periodSortKey(b) - this.periodSortKey(a));
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
      include: {
        account: { select: { name: true, login_id: true } },
        center: { select: { name: true } },
      },
      orderBy: { account: { login_id: 'asc' } },
      take: 1000,
    });
    return {
      period,
      count: students.length,
      students: students.map((s) => ({
        studentId: s.account_id,
        name: s.account.name,
        loginId: s.account.login_id,
        center: s.center?.name ?? null,
        schoolGrade: s.school_grade ?? null,
      })),
    };
  }

  /** 관리자 대시보드 성적 통계(기간별): 분포·과목평균·배치 티어·업로드 커버리지·직전 대비 향상/하락. */
  async statistics(actor: AuthUser, period?: string) {
    this.assertAdmin(actor);
    const scope = this.isHq(actor) ? {} : { center_id: actor.centerId };
    const periods = await this.periods(actor); // desc
    const target = period && periods.includes(period) ? period : periods[0];
    const empty = {
      period: null as string | null,
      periods,
      totalStudents: 0,
      uploaded: 0,
      coverage: 0,
      avgMean: null as number | null,
      goalMet: 0,
      goalTotal: 0,
      distribution: [] as { bucket: string; count: number }[],
      subjects: [] as { subject: string; avg: number; count: number }[],
      tiers: [] as { tier: string; count: number }[],
      movement: {
        prevPeriod: null as string | null,
        improved: 0,
        declined: 0,
        same: 0,
        avgDelta: null as number | null,
      },
    };
    if (!target) return empty;

    const reports = await this.prisma.score_report.findMany({
      where: { ...scope, period: target },
      include: { items: { select: { subject: true, score: true } } },
    });
    const totalStudents = await this.prisma.student_profile.count({
      where: scope,
    });

    const avgOf = (items: { score: unknown }[]) => {
      const s = items
        .map((i) => (i.score == null ? null : Number(i.score)))
        .filter((x): x is number => x != null);
      return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
    };
    const perStudent = new Map<string, number>(); // studentId → avg(target)
    const avgs: number[] = [];
    for (const r of reports) {
      const a = avgOf(r.items);
      if (a != null) {
        perStudent.set(r.student_id, a);
        avgs.push(a);
      }
    }
    const avgMean = avgs.length
      ? Math.round((avgs.reduce((x, y) => x + y, 0) / avgs.length) * 10) / 10
      : null;

    // 평균 분포(구간)
    const buckets = [
      { bucket: '90+', min: 90, max: 101 },
      { bucket: '80–89', min: 80, max: 90 },
      { bucket: '70–79', min: 70, max: 80 },
      { bucket: '60–69', min: 60, max: 70 },
      { bucket: '60 미만', min: -1, max: 60 },
    ];
    const distribution = buckets.map((b) => ({
      bucket: b.bucket,
      count: avgs.filter((a) => a >= b.min && a < b.max).length,
    }));

    // 과목별 평균
    const subjMap = new Map<string, { sum: number; n: number }>();
    for (const r of reports)
      for (const i of r.items) {
        if (i.score == null) continue;
        const cur = subjMap.get(i.subject) ?? { sum: 0, n: 0 };
        cur.sum += Number(i.score);
        cur.n += 1;
        subjMap.set(i.subject, cur);
      }
    const subjects = [...subjMap.entries()]
      .map(([subject, v]) => ({
        subject,
        avg: Math.round((v.sum / v.n) * 10) / 10,
        count: v.n,
      }))
      .sort((a, b) => b.avg - a.avg);

    // 배치 티어 분포
    const tierMap = new Map<string, number>();
    for (const r of reports) {
      const tier = (r.placement as { tier?: string } | null)?.tier;
      if (tier) tierMap.set(tier, (tierMap.get(tier) ?? 0) + 1);
    }
    const tiers = [...tierMap.entries()]
      .map(([tier, count]) => ({ tier, count }))
      .sort((a, b) => b.count - a.count);

    // 목표 달성(goal_avg 대비 target 평균)
    const goalStudents = await this.prisma.student_profile.findMany({
      where: { ...scope, goal_avg: { not: null } },
      select: { account_id: true, goal_avg: true },
    });
    let goalMet = 0;
    for (const g of goalStudents) {
      const a = perStudent.get(g.account_id);
      if (a != null && g.goal_avg != null && a >= Number(g.goal_avg))
        goalMet += 1;
    }

    // 직전 기간 대비 향상/하락
    const idx = periods.indexOf(target);
    const prevPeriod =
      idx >= 0 && idx + 1 < periods.length ? periods[idx + 1] : null;
    let improved = 0,
      declined = 0,
      same = 0;
    const deltas: number[] = [];
    if (prevPeriod) {
      const prev = await this.prisma.score_report.findMany({
        where: { ...scope, period: prevPeriod },
        include: { items: { select: { score: true } } },
      });
      const prevAvg = new Map<string, number>();
      for (const r of prev) {
        const a = avgOf(r.items);
        if (a != null) prevAvg.set(r.student_id, a);
      }
      for (const [sid, cur] of perStudent) {
        const p = prevAvg.get(sid);
        if (p == null) continue;
        const d = Math.round((cur - p) * 10) / 10;
        deltas.push(d);
        if (d > 0.05) improved += 1;
        else if (d < -0.05) declined += 1;
        else same += 1;
      }
    }
    const avgDelta = deltas.length
      ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) /
        10
      : null;

    return {
      period: target,
      periods,
      totalStudents,
      uploaded: perStudent.size,
      coverage: totalStudents
        ? Math.round((perStudent.size / totalStudents) * 100)
        : 0,
      avgMean,
      goalMet,
      goalTotal: goalStudents.length,
      distribution,
      subjects,
      tiers,
      movement: { prevPeriod, improved, declined, same, avgDelta },
    };
  }
}
