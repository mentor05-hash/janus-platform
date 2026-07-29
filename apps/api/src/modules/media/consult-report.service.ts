import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountRole } from '../../config/enums';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { ConsultSummaryResult, LlmProvider } from '../llm/llm.types';
import { NotifyService } from '../notification/notify.service';
import { GuardianConsentService } from '../guardian-consent/guardian-consent.service';
import { STT_PROVIDER } from './stt.types';
import type { SttProvider } from './stt.types';
import { toJson } from '../../common/prisma/json';

type ReportBody = {
  covered: string[];
  diagnosis: string;
  next_actions: string[];
  demo?: boolean;
  source?: 'audio' | 'fallback';
};
type StudentViewBody = {
  covered: string[];
  reviewPoints: string[];
  nextLearning: string[];
  demo?: boolean;
};
type GuardianViewBody = {
  progress: string;
  recommendedActions: string[];
  effort: string;
  demo?: boolean;
};
type Audience = 'student' | 'guardian';

/**
 * R2~R5 상담 요약 파이프라인 — egress 산출(stored) → STT(전사) → LLM 요약 초안 → 전건 검수 → 발송.
 * 게이트: consult_recording.sttEnabled 플래그(기본 OFF) + sttAllowed(보호자 동의 — 본부 결정 O86).
 * 민감 산출물 접근은 media_access_log 에 감사 기록(R5).
 */
@Injectable()
export class ConsultReportService {
  private readonly logger = new Logger('ConsultReport');
  private static readonly FLAG_KEY = 'consult_recording';
  private static readonly FLAG_DEFAULT = {
    enabled: false,
    sttEnabled: false,
    retentionDays: 30,
    policyVersion: 'v1',
    sttRequiresGuardianConsent: true,
  };
  private static readonly RETRY_MS = [30_000, 120_000, 600_000]; // 재시도 백오프(3회)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STT_PROVIDER) private readonly stt: SttProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Optional() private readonly notify?: NotifyService,
    @Optional() private readonly guardianConsent?: GuardianConsentService,
  ) {}

  private async flags() {
    const row = await this.prisma.system_setting.findUnique({
      where: { key: ConsultReportService.FLAG_KEY },
    });
    return {
      ...ConsultReportService.FLAG_DEFAULT,
      ...((row?.value as object) ?? {}),
    };
  }

  /** 민감 산출물 접근 감사(R5) — 실패해도 본 작업 비차단. */
  private async logAccess(
    targetType: string,
    targetId: string,
    actorId: string | null,
    action: string,
  ) {
    try {
      await this.prisma.media_access_log.create({
        data: {
          target_type: targetType,
          target_id: targetId,
          actor_id: actorId,
          action,
        },
      });
    } catch {
      /* 감사 실패는 삼킨다 */
    }
  }

  // ── 파이프라인(서버 전용) ─────────────────────────────────────────────

  /** egress stored 후 호출 — 전사·요약 초안 생성. 실패 시 백오프 재시도(3회). */
  async process(recordingId: string, attempt = 0): Promise<void> {
    try {
      const f = await this.flags();
      if (!f.enabled || !f.sttEnabled) return; // 플래그 OFF — 조용히 종료(수동 rebuild 로 재개 가능)
      const r = await this.prisma.consult_recording.findUnique({
        where: { id: recordingId },
      });
      if (!r || r.status !== 'stored' || !r.s3_key) return;
      const b = await this.prisma.booking.findUnique({
        where: { id: r.booking_id },
        select: {
          id: true,
          student_id: true,
          teacher_id: true,
          consult_type: true,
          sub_type: true,
        },
      });
      if (!b?.student_id) return;

      // 보호자 동의 게이트(O86) — 녹음 시점 스탬프 우선, 없으면 현재 동의 상태로 재확인.
      if (f.sttRequiresGuardianConsent && !r.consent_guardian_at) {
        const g = await this.prisma.consent_grant.findUnique({
          where: {
            student_id_kind: {
              student_id: b.student_id,
              kind: 'recording_stt',
            },
          },
        });
        if (!(g && g.revoked_at == null)) {
          this.logger.log(
            `보호자 동의 없음 — STT 제외(수동 메모 리포트 폴백) booking=${r.booking_id}`,
          );
          return;
        }
      }

      // 기존 리포트가 이미 검수 진행(approved/sent)이면 초안을 덮지 않는다.
      const existing = await this.prisma.consult_report.findUnique({
        where: { booking_id: r.booking_id },
      });
      if (existing && existing.status !== 'draft') return;

      // ① 오디오 취득(S3) — 접근 감사
      await this.logAccess('recording', r.id, null, 'stt_read');
      const audio = await this.readObject(r.s3_key);

      // ② 전사(STT)
      const mime = r.s3_key.endsWith('.ogg')
        ? 'audio/ogg'
        : r.s3_key.endsWith('.mp4')
          ? 'audio/mp4'
          : 'audio/ogg';
      const tr = await this.stt.transcribe({
        audio,
        mime,
        lang: 'ko',
        durationSec: r.duration_sec, // 분 단위 상한의 입력(추정 폴백을 피한다)
      });
      const transcript = await this.prisma.consult_transcript.upsert({
        where: { recording_id: r.id },
        create: {
          recording_id: r.id,
          engine: tr.engine,
          lang: tr.lang,
          text: tr.text,
        },
        update: {
          engine: tr.engine,
          lang: tr.lang,
          text: tr.text,
          created_at: new Date(),
        },
      });

      // ③ 요약 초안(LLM — 가드레일 프롬프트는 provider 내 상수)
      const s = await this.llm.consultSummary({
        transcript: tr.text,
        durationSec: r.duration_sec,
        subject: b.sub_type ?? String(b.consult_type ?? ''),
        scoreHint: null, // janus_score 요지 직결은 후속(scores 모듈 결합 없이 v1 출시 — 기획 §5 주석)
      });
      await this.saveDraft(
        r.booking_id,
        transcript.id,
        s,
        tr.demo === true || s.demo === true,
      );
      this.logger.log(
        `요약 초안 생성 완료 booking=${r.booking_id} (engine=${tr.engine})`,
      );
    } catch (e) {
      this.logger.warn(
        `파이프라인 실패(booking recording=${recordingId}, 시도 ${attempt + 1}): ${(e as Error).message}`,
      );
      const delay = ConsultReportService.RETRY_MS[attempt];
      if (delay != null) {
        const t = setTimeout(
          () => void this.process(recordingId, attempt + 1),
          delay,
        );
        if (typeof t.unref === 'function') t.unref();
      }
    }
  }

  private async saveDraft(
    bookingId: string,
    transcriptId: string,
    s: ConsultSummaryResult,
    demo: boolean,
  ) {
    const body: ReportBody = {
      covered: s.covered,
      diagnosis: s.diagnosis,
      next_actions: s.nextActions,
      ...(demo ? { demo: true } : {}),
    };
    await this.prisma.consult_report.upsert({
      where: { booking_id: bookingId },
      create: { booking_id: bookingId, transcript_id: transcriptId, body },
      update: {
        transcript_id: transcriptId,
        body,
        status: 'draft',
        updated_at: new Date(),
      },
    });
  }

  /** egress S3 자격으로 산출물 읽기(STT 입력). */
  private async readObject(key: string): Promise<Buffer> {
    const raw = this.config.get<string>('LIVEKIT_EGRESS_S3');
    if (!raw)
      throw new Error('LIVEKIT_EGRESS_S3 미설정 — 오디오를 읽을 수 없습니다.');
    const s3cfg = JSON.parse(raw) as {
      access_key: string;
      secret: string;
      bucket: string;
      region?: string;
      endpoint?: string;
    };
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: s3cfg.region ?? 'auto',
      ...(s3cfg.endpoint ? { endpoint: s3cfg.endpoint } : {}),
      credentials: {
        accessKeyId: s3cfg.access_key,
        secretAccessKey: s3cfg.secret,
      },
    });
    const res = await client.send(
      new GetObjectCommand({ Bucket: s3cfg.bucket, Key: key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes?.length) throw new Error('오디오 산출물이 비어 있습니다.');
    return Buffer.from(bytes);
  }

  // ── 검수·발송(선생님) / 열람(학생) ───────────────────────────────────

  private async assertBooking(user: AuthUser, bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, student_id: true, teacher_id: true, start_at: true },
    });
    if (!b) throw new NotFoundException('예약을 찾을 수 없습니다.');
    const isTeacher =
      b.teacher_id === user.id || user.role === AccountRole.ADMIN;
    const isStudent = b.student_id === user.id;
    if (!isTeacher && !isStudent)
      throw new ForbiddenException('이 상담의 참여자가 아닙니다.');
    return { b, isTeacher, isStudent };
  }

  /** 선생님 — 내 상담 리포트 목록(검수함). 리포트가 아직 없어도 상담 기록(final)만 있으면 status='note'로 노출(폴백 2뷰 생성 진입점). */
  async listMine(user: AuthUser) {
    if (user.role !== AccountRole.TEACHER && user.role !== AccountRole.ADMIN)
      throw new ForbiddenException('선생님만 조회할 수 있습니다.');
    const rows = await this.prisma.$queryRaw<
      Array<{
        booking_id: string;
        status: string;
        updated_at: Date;
        sent_at: Date | null;
        opened_at: Date | null;
        start_at: Date | null;
        student_name: string | null;
        category: string | null;
        demo: boolean | null;
        has_views: boolean;
      }>
    >`
      SELECT cr.booking_id, cr.status, cr.updated_at, cr.sent_at, cr.opened_at, b.start_at, a.name AS student_name, b.sub_type AS category,
             (cr.body ->> 'demo')::boolean AS demo,
             EXISTS (SELECT 1 FROM consult_report_view v WHERE v.report_id = cr.id) AS has_views
      FROM consult_report cr
      JOIN booking b ON b.id = cr.booking_id
      LEFT JOIN account a ON a.id = b.student_id
      WHERE b.teacher_id = ${user.id}::uuid
      UNION ALL
      SELECT cn.booking_id, 'note' AS status, cn.updated_at, NULL, NULL, b.start_at, a.name AS student_name, b.sub_type AS category,
             NULL::boolean AS demo, false AS has_views
      FROM consultation_note cn
      JOIN booking b ON b.id = cn.booking_id
      LEFT JOIN account a ON a.id = b.student_id
      WHERE b.teacher_id = ${user.id}::uuid AND cn.save_state = 'final'
        AND NOT EXISTS (SELECT 1 FROM consult_report cr2 WHERE cr2.booking_id = cn.booking_id)
      ORDER BY updated_at DESC
      LIMIT 100`;
    return rows.map((r) => ({
      bookingId: r.booking_id,
      status: r.status,
      updatedAt: r.updated_at,
      sentAt: r.sent_at,
      openedAt: r.opened_at,
      startAt: r.start_at,
      studentName: r.student_name,
      category: r.category,
      demo: r.demo === true,
      hasViews: r.has_views === true,
    }));
  }

  /** 학생 — 발송된 내 리포트 목록. */
  async listStudent(user: AuthUser) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        booking_id: string;
        sent_at: Date | null;
        opened_at: Date | null;
        start_at: Date | null;
        teacher_name: string | null;
        category: string | null;
      }>
    >`
      SELECT cr.booking_id, cr.sent_at, cr.opened_at, b.start_at, a.name AS teacher_name, b.sub_type AS category
      FROM consult_report cr
      JOIN booking b ON b.id = cr.booking_id
      LEFT JOIN account a ON a.id = b.teacher_id
      WHERE b.student_id = ${user.id}::uuid AND cr.status = 'sent'
      ORDER BY cr.sent_at DESC
      LIMIT 100`;
    return rows.map((r) => ({
      bookingId: r.booking_id,
      sentAt: r.sent_at,
      openedAt: r.opened_at,
      startAt: r.start_at,
      teacherName: r.teacher_name,
      category: r.category,
    }));
  }

  /**
   * 미열람 리포트 리마인더 — 발송 후 REMINDER_DAYS 지나도 학생이 안 연 리포트에 1회 알림.
   * 멱등: 알림 원장(type+bookingId)으로 중복 방지(마이그레이션 불요). 발송·정산 무개입.
   */
  @Cron('0 10 * * *', { timeZone: 'Asia/Seoul' })
  async remindUnopenedReports() {
    const REMINDER_DAYS = 3; // 정책값 — 발송 후 3일 미열람 시 1회 리마인드
    const cutoff = new Date(Date.now() - REMINDER_DAYS * 86_400_000);
    const rows = await this.prisma.$queryRaw<
      Array<{ booking_id: string; student_id: string | null }>
    >`
      SELECT cr.booking_id, b.student_id
      FROM consult_report cr JOIN booking b ON b.id = cr.booking_id
      WHERE cr.status = 'sent' AND cr.opened_at IS NULL AND cr.sent_at < ${cutoff}
      LIMIT 200`;
    for (const r of rows) {
      if (!r.student_id) continue;
      const already = await this.prisma.notification.findFirst({
        where: {
          type: 'consult_report_reminder',
          payload: { path: ['bookingId'], equals: r.booking_id },
        },
        select: { id: true },
      });
      if (already) continue; // 같은 리포트 리마인더는 1회만
      await this.notify?.notify(r.student_id, 'consult_report_reminder', {
        bookingId: r.booking_id,
      });
    }
  }

  /** 상세 — 선생님: 전 상태+전사문 / 학생: sent 만(첫 열람 시 opened_at 스탬프). */
  async detail(user: AuthUser, bookingId: string) {
    const { isTeacher, isStudent } = await this.assertBooking(user, bookingId);
    const report = await this.prisma.consult_report.findUnique({
      where: { booking_id: bookingId },
    });
    if (!report) throw new NotFoundException('리포트가 아직 없습니다.');
    if (isStudent && !isTeacher) {
      if (report.status !== 'sent')
        throw new NotFoundException('리포트가 아직 없습니다.');
      if (!report.opened_at) {
        await this.prisma.consult_report.update({
          where: { id: report.id },
          data: { opened_at: new Date() },
        });
        report.opened_at = new Date();
      }
      await this.logAccess('report', report.id, user.id, 'read');
      return this.shape(report, null);
    }
    // 선생님 — 전사문 열람은 감사 기록
    let transcriptText: string | null = null;
    if (report.transcript_id) {
      const t = await this.prisma.consult_transcript.findUnique({
        where: { id: report.transcript_id },
      });
      if (t) {
        transcriptText = t.text;
        await this.logAccess('transcript', t.id, user.id, 'read');
      }
    }
    await this.logAccess('report', report.id, user.id, 'read');
    return this.shape(report, transcriptText);
  }

  private shape(
    r: {
      booking_id: string;
      body: unknown;
      status: string;
      sent_at: Date | null;
      opened_at: Date | null;
      updated_at: Date;
    },
    transcript: string | null,
  ) {
    const body = (r.body ?? {}) as ReportBody;
    return {
      bookingId: r.booking_id,
      status: r.status,
      sentAt: r.sent_at,
      openedAt: r.opened_at,
      updatedAt: r.updated_at,
      covered: body.covered ?? [],
      diagnosis: body.diagnosis ?? '',
      nextActions: body.next_actions ?? [],
      demo: body.demo === true,
      transcript,
    };
  }

  /** 검수 편집(선생님) — sent 전까지 수정 가능. 수정하면 demo 마크 해제(사람 확인 완료). */
  async update(
    user: AuthUser,
    bookingId: string,
    dto: { covered?: string[]; diagnosis?: string; nextActions?: string[] },
  ) {
    const { isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher)
      throw new ForbiddenException('담당 선생님만 수정할 수 있습니다.');
    const report = await this.prisma.consult_report.findUnique({
      where: { booking_id: bookingId },
    });
    if (!report) throw new NotFoundException('리포트가 없습니다.');
    if (report.status === 'sent')
      throw new ForbiddenException('발송된 리포트는 수정할 수 없습니다.');
    const prev = (report.body ?? {}) as ReportBody;
    const body: ReportBody = {
      covered: dto.covered ?? prev.covered ?? [],
      diagnosis: dto.diagnosis ?? prev.diagnosis ?? '',
      next_actions: dto.nextActions ?? prev.next_actions ?? [],
    };
    await this.prisma.consult_report.update({
      where: { id: report.id },
      data: { body, updated_at: new Date() },
    });
    return { ok: true };
  }

  /** 승인(선생님) — 전건 검수 원칙(브리핑 §8-5 기본값). */
  async approve(user: AuthUser, bookingId: string) {
    const { isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher)
      throw new ForbiddenException('담당 선생님만 승인할 수 있습니다.');
    const report = await this.prisma.consult_report.findUnique({
      where: { booking_id: bookingId },
    });
    if (!report || report.status === 'sent')
      throw new ForbiddenException('승인할 초안이 없습니다.');
    await this.prisma.consult_report.update({
      where: { id: report.id },
      data: {
        status: 'approved',
        approved_by: user.id,
        updated_at: new Date(),
      },
    });
    return { ok: true, status: 'approved' };
  }

  /** 발송(선생님) — 학생 알림(계정 내 열람, 브리핑 §8-4 기본값). */
  async send(user: AuthUser, bookingId: string) {
    const { b, isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher)
      throw new ForbiddenException('담당 선생님만 발송할 수 있습니다.');
    const report = await this.prisma.consult_report.findUnique({
      where: { booking_id: bookingId },
    });
    if (!report || report.status !== 'approved')
      throw new ForbiddenException('승인된 리포트만 발송할 수 있습니다.');
    // 조건부 전이 — approved 를 실제로 소비한 요청만 알림(동시 발송 중복 알림 방지).
    const res = await this.prisma.consult_report.updateMany({
      where: { id: report.id, status: 'approved' },
      data: { status: 'sent', sent_at: new Date(), updated_at: new Date() },
    });
    if (res.count === 0) return { ok: true, status: 'sent' };
    if (b.student_id)
      void this.notify?.notify(b.student_id, 'consult_report', { bookingId });
    return { ok: true, status: 'sent' };
  }

  /** 초안 재생성(선생님) — 파이프라인 수동 재실행(플래그 무시하지 않음 — sttEnabled 필요). */
  async rebuild(user: AuthUser, bookingId: string) {
    const { isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher)
      throw new ForbiddenException('담당 선생님만 재생성할 수 있습니다.');
    const report = await this.prisma.consult_report.findUnique({
      where: { booking_id: bookingId },
    });
    if (report && report.status === 'sent')
      throw new ForbiddenException('발송된 리포트는 재생성할 수 없습니다.');
    const r = await this.prisma.consult_recording.findUnique({
      where: { booking_id: bookingId },
    });
    if (!r || r.status !== 'stored' || !r.s3_key)
      throw new NotFoundException('전사 가능한 녹음 산출물이 없습니다.');
    const f = await this.flags();
    if (!f.enabled || !f.sttEnabled)
      throw new ForbiddenException(
        '요약 파이프라인이 비활성화되어 있습니다(consult_recording.sttEnabled).',
      );
    void this.process(r.id);
    return { ok: true, queued: true };
  }

  // ── 학생용/학부모용 2뷰 (발송·수신 레이어 브리핑 v1) ───────────────────
  // 오디오 동의 플래그에 종속되지 않는다: 오디오 요약이 없어도 상담사 메모(공개 필드) 폴백으로 뷰를 만든다.

  private async recordFunnel(
    event: 'view' | 'cta',
    cta: string,
    meta: Record<string, unknown>,
  ) {
    try {
      await this.prisma.funnel_event.create({
        data: { page: 'consult_report', event, cta, meta: toJson(meta) },
      });
    } catch {
      /* 계측 실패는 삼킨다 */
    }
  }

  /**
   * 요약 원천 추상화 — 오디오 유래 요약(transcript 있는 리포트)을 우선 반환, 없으면 상담사 메모(consultation_note) 폴백.
   * ⚠ 메모의 `memo` 필드는 내부용 — 폴백 원천에서 제외하고 공개 필드(core_summary·homework·future_dir)만 쓴다.
   */
  async getSummarySource(bookingId: string): Promise<{
    origin: 'audio' | 'fallback';
    covered: string[];
    diagnosis: string;
    nextActions: string[];
    subject: string | null;
    hasParent: boolean;
    guardianAllowed: boolean;
  } | null> {
    const report = await this.prisma.consult_report.findUnique({
      where: { booking_id: bookingId },
    });
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { sub_type: true, consult_type: true },
    });
    const subject =
      b?.sub_type ?? (b?.consult_type != null ? String(b.consult_type) : null);
    if (report?.transcript_id) {
      const body = (report.body ?? {}) as ReportBody;
      if ((body.covered?.length ?? 0) > 0 || body.diagnosis) {
        return {
          origin: 'audio',
          covered: body.covered ?? [],
          diagnosis: body.diagnosis ?? '',
          nextActions: body.next_actions ?? [],
          subject,
          hasParent: true,
          guardianAllowed: true,
        };
      }
    }
    // 폴백 — 상담사 메모(공개 필드만). guardian_visible=false 는 "보호자 비공개" 신호 → 학부모 뷰 생성 차단.
    const note = await this.prisma.consultation_note.findUnique({
      where: { booking_id: bookingId },
    });
    if (note && (note.core_summary || note.homework || note.future_dir)) {
      const lines = (s: string | null) =>
        (s ?? '')
          .split(/\n+/)
          .map((x) => x.trim())
          .filter(Boolean);
      return {
        origin: 'fallback',
        covered: lines(note.core_summary).slice(0, 6),
        diagnosis: (note.core_summary ?? '').trim(),
        nextActions: [note.homework, note.future_dir]
          .map((x) => (x ?? '').trim())
          .filter(Boolean),
        subject,
        hasParent: !!report,
        guardianAllowed: note.guardian_visible !== false,
      };
    }
    // 폴백 파생 리포트(transcript 없이 body 만 있는 경우)도 원천으로 인정
    if (report) {
      const body = (report.body ?? {}) as ReportBody;
      if ((body.covered?.length ?? 0) > 0 || body.diagnosis) {
        return {
          origin: 'fallback',
          covered: body.covered ?? [],
          diagnosis: body.diagnosis ?? '',
          nextActions: body.next_actions ?? [],
          subject,
          hasParent: true,
          guardianAllowed: true,
        };
      }
    }
    return null;
  }

  /** 부모 리포트 확보(멱등) — 없으면 폴백 원천으로 consult_report draft 생성. 반환: reportId. 동시 생성 경합(P2002)은 재조회로 흡수. */
  private async ensureParentReport(
    bookingId: string,
    src: {
      origin: 'audio' | 'fallback';
      covered: string[];
      diagnosis: string;
      nextActions: string[];
    },
  ): Promise<string> {
    const existing = await this.prisma.consult_report.findUnique({
      where: { booking_id: bookingId },
    });
    if (existing) return existing.id;
    const body: ReportBody = {
      covered: src.covered,
      diagnosis: src.diagnosis,
      next_actions: src.nextActions,
      source: 'fallback',
    };
    try {
      const created = await this.prisma.consult_report.create({
        data: { booking_id: bookingId, transcript_id: null, body },
      });
      return created.id;
    } catch (e) {
      // booking_id unique 경합 — 다른 요청이 먼저 생성. 재조회.
      const again = await this.prisma.consult_report.findUnique({
        where: { booking_id: bookingId },
      });
      if (again) return again.id;
      throw e;
    }
  }

  /** 2뷰 생성(선생님) — 원천(오디오 or 메모)에서 학생용/학부모용 뷰 초안을 만든다. 오디오 플래그와 무관. */
  async generateViews(user: AuthUser, bookingId: string) {
    const { isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher)
      throw new ForbiddenException(
        '담당 선생님만 리포트를 생성할 수 있습니다.',
      );
    const report = await this.prisma.consult_report.findUnique({
      where: { booking_id: bookingId },
    });
    if (report?.status === 'sent')
      throw new ForbiddenException(
        '이미 발송된 리포트는 재생성할 수 없습니다.',
      );
    const src = await this.getSummarySource(bookingId);
    if (!src)
      throw new NotFoundException(
        '요약 원천이 없습니다 — 녹음 요약 또는 상담 기록(핵심 요약)이 필요합니다.',
      );
    const reportId = await this.ensureParentReport(bookingId, src);

    let views: import('../llm/llm.types').ConsultReportViewsResult;
    try {
      views = await this.llm.consultReportViews({
        origin: src.origin,
        covered: src.covered,
        diagnosis: src.diagnosis,
        nextActions: src.nextActions,
        subject: src.subject,
      });
    } catch (e) {
      this.logger.warn(
        `2뷰 생성 실패(booking=${bookingId}): ${(e as Error).message}`,
      );
      throw e;
    }
    const demo = views.demo === true;
    const studentBody: StudentViewBody = {
      ...views.student,
      ...(demo ? { demo: true } : {}),
    };
    await this.upsertView(reportId, 'student', studentBody);
    if (src.guardianAllowed) {
      const guardianBody: GuardianViewBody = {
        ...views.guardian,
        ...(demo ? { demo: true } : {}),
      };
      await this.upsertView(reportId, 'guardian', guardianBody);
    } else {
      // 보호자 비공개(guardian_visible=false) — 학부모 뷰를 만들지 않고, 남아 있으면 제거.
      await this.prisma.consult_report_view.deleteMany({
        where: { report_id: reportId, audience: 'guardian' },
      });
    }
    // 재생성은 검수 상태를 초기화 — 미승인 초안이 approved 상태로 발송되는 것을 막는다(전건 검수 원칙).
    await this.prisma.consult_report.update({
      where: { id: reportId },
      data: { status: 'draft', updated_at: new Date() },
    });
    await this.recordFunnel('cta', 'generated', {
      bookingId,
      origin: src.origin,
    });
    return {
      ok: true,
      origin: src.origin,
      demo,
      guardianView: src.guardianAllowed,
    };
  }

  private async upsertView(
    reportId: string,
    audience: Audience,
    body: StudentViewBody | GuardianViewBody,
  ) {
    await this.prisma.consult_report_view.upsert({
      where: { report_id_audience: { report_id: reportId, audience } },
      create: { report_id: reportId, audience, body: toJson(body) },
      update: { body: toJson(body), status: 'draft', updated_at: new Date() },
    });
  }

  private async parentAndViews(bookingId: string) {
    const report = await this.prisma.consult_report.findUnique({
      where: { booking_id: bookingId },
    });
    if (!report)
      return {
        report: null,
        views: [] as Array<{
          audience: string;
          body: unknown;
          status: string;
          shared_at: Date | null;
          opened_at: Date | null;
        }>,
      };
    const views = await this.prisma.consult_report_view.findMany({
      where: { report_id: report.id },
    });
    return { report, views };
  }

  /** 2뷰 상세 — 선생님: 전 상태 / 학생: sent 만(학생 열람 시 student 뷰 opened 스탬프). */
  async viewsDetail(user: AuthUser, bookingId: string) {
    const { isTeacher, isStudent } = await this.assertBooking(user, bookingId);
    const { report, views } = await this.parentAndViews(bookingId);
    if (!report || views.length === 0)
      throw new NotFoundException('아직 만든 요약이 없습니다.');
    if (isStudent && !isTeacher && report.status !== 'sent')
      throw new NotFoundException('리포트가 아직 없습니다.');
    const student = views.find((v) => v.audience === 'student');
    const guardian = views.find((v) => v.audience === 'guardian');
    if (isStudent && !isTeacher && student && !student.opened_at) {
      await this.prisma.consult_report_view.updateMany({
        where: { report_id: report.id, audience: 'student', opened_at: null },
        data: { opened_at: new Date() },
      });
      await this.recordFunnel('view', 'opened', {
        bookingId,
        audience: 'student',
      });
      await this.logAccess('report_view', report.id, user.id, 'read');
    }
    const body = (report.body ?? {}) as ReportBody;
    return {
      bookingId,
      status: report.status,
      source: body.source ?? (report.transcript_id ? 'audio' : 'fallback'),
      sentAt: report.sent_at,
      updatedAt: report.updated_at,
      student: student ? (student.body as StudentViewBody) : null,
      guardian: guardian ? (guardian.body as GuardianViewBody) : null,
      guardianShared: !!guardian?.shared_at,
      guardianSharedAt: guardian?.shared_at ?? null,
      demo:
        (student?.body as StudentViewBody | undefined)?.demo === true ||
        (guardian?.body as GuardianViewBody | undefined)?.demo === true,
    };
  }

  /** 뷰 편집(선생님) — 발송 전. audience 별 부분 수정. 수정 시 demo 마크 해제. */
  async updateView(
    user: AuthUser,
    bookingId: string,
    audience: Audience,
    patch: Partial<StudentViewBody & GuardianViewBody>,
  ) {
    const { isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher)
      throw new ForbiddenException('담당 선생님만 수정할 수 있습니다.');
    const { report } = await this.parentAndViews(bookingId);
    if (!report) throw new NotFoundException('리포트가 없습니다.');
    if (report.status === 'sent')
      throw new ForbiddenException('발송된 리포트는 수정할 수 없습니다.');
    const cur = await this.prisma.consult_report_view.findUnique({
      where: { report_id_audience: { report_id: report.id, audience } },
    });
    if (!cur) throw new NotFoundException('해당 뷰가 없습니다.');
    const prev = (cur.body ?? {}) as StudentViewBody & GuardianViewBody;
    const merged = { ...prev, ...patch };
    delete (merged as { demo?: boolean }).demo; // 사람이 손댔으니 데모 마크 해제
    await this.prisma.consult_report_view.update({
      where: { id: cur.id },
      data: { body: toJson(merged), status: 'draft', updated_at: new Date() },
    });
    // 편집은 검수 상태를 초기화 — 승인 후 몰래 바뀐 본문이 재검수 없이 발송되지 않게(전건 검수 원칙).
    if (report.status === 'approved')
      await this.prisma.consult_report.update({
        where: { id: report.id },
        data: { status: 'draft', updated_at: new Date() },
      });
    return { ok: true };
  }

  private hasStudentView(views: Array<{ audience: string }>) {
    return views.some((v) => v.audience === 'student');
  }

  /** 승인(선생님) — 학생용 뷰 필수(+있으면 학부모용). 부모 리포트·뷰 approved. */
  async approveViews(user: AuthUser, bookingId: string) {
    const { isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher)
      throw new ForbiddenException('담당 선생님만 승인할 수 있습니다.');
    const { report, views } = await this.parentAndViews(bookingId);
    if (!report || !this.hasStudentView(views))
      throw new ForbiddenException('학생용 뷰가 있어야 승인할 수 있습니다.');
    if (report.status === 'sent')
      throw new ForbiddenException('이미 발송되었습니다.');
    await this.prisma.consult_report_view.updateMany({
      where: { report_id: report.id },
      data: {
        status: 'approved',
        approved_by: user.id,
        updated_at: new Date(),
      },
    });
    await this.prisma.consult_report.update({
      where: { id: report.id },
      data: {
        status: 'approved',
        approved_by: user.id,
        updated_at: new Date(),
      },
    });
    await this.recordFunnel('cta', 'approved', { bookingId });
    return { ok: true, status: 'approved' };
  }

  /** 발송(선생님) — 승인된 뷰를 학생 계정에 노출(기본). 학부모 전달은 학생 주도 공유(§5). 직접 push 는 플래그 OFF. */
  async sendViews(user: AuthUser, bookingId: string) {
    const { b, isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher)
      throw new ForbiddenException('담당 선생님만 발송할 수 있습니다.');
    const { report, views } = await this.parentAndViews(bookingId);
    if (!report || !this.hasStudentView(views))
      throw new ForbiddenException('승인된 학생용 뷰가 필요합니다.');
    if (report.status !== 'approved')
      throw new ForbiddenException('승인된 리포트만 발송할 수 있습니다.');
    // 조건부 전이 — approved 상태를 실제로 소비한 요청만 알림 발송(동시 발송 시 중복 알림 방지).
    const res = await this.prisma.consult_report.updateMany({
      where: { id: report.id, status: 'approved' },
      data: { status: 'sent', sent_at: new Date(), updated_at: new Date() },
    });
    if (res.count === 0) return { ok: true, status: 'sent' }; // 다른 요청이 먼저 발송 — 멱등 응답
    if (b.student_id)
      void this.notify?.notify(b.student_id, 'consult_report', { bookingId });
    return { ok: true, status: 'sent' };
  }

  /** 학부모께 공유(학생 주도) — guardian 뷰에 공유 스탬프. 연결된 학부모가 열람 가능해진다(직접 push 아님). */
  async shareToGuardian(user: AuthUser, bookingId: string) {
    const { isStudent } = await this.assertBooking(user, bookingId);
    if (!isStudent)
      throw new ForbiddenException('학생 본인만 공유할 수 있습니다.');
    const { report } = await this.parentAndViews(bookingId);
    if (!report || report.status !== 'sent')
      throw new NotFoundException('발송된 리포트만 공유할 수 있습니다.');
    const gv = await this.prisma.consult_report_view.findUnique({
      where: {
        report_id_audience: { report_id: report.id, audience: 'guardian' },
      },
    });
    if (!gv) throw new NotFoundException('학부모용 뷰가 없습니다.');
    if (!gv.shared_at) {
      await this.prisma.consult_report_view.update({
        where: { id: gv.id },
        data: { shared_at: new Date() },
      });
      // 최초 공유 시에만 — 이미 승인 연결된 학부모 "계정 내" 인앱 알림(외부 직접 push 아님).
      // 학생 주도 공유(§5)의 결과 통지이므로 §8 미성년 직접 push 제약과 무관. 재공유 시 중복 알림 방지.
      const links = await this.prisma.guardian_student_link.findMany({
        where: { student_id: user.id, status: 'approved' },
      });
      for (const l of links)
        void this.notify?.notify(l.guardian_id, 'consult_report_shared', {
          bookingId,
          studentId: user.id,
        });
    }
    await this.recordFunnel('cta', 'shared_to_guardian', { bookingId });
    // 학부모 직접 push(알림톡/이메일) — 훅만 존재, 활성화는 본부 확정 후(§8-1·§8-4). 기본 OFF.
    await this.maybePushGuardian(bookingId);
    return { ok: true, shared: true };
  }

  /**
   * 학부모 직접 push 훅 — ⛔ 미성년 데이터 직접 push 는 본부가 동의·본인확인 체계를 확정한 뒤에만 켠다.
   * 플래그 consult_report.guardianPush(기본 false)가 true 이고 NotificationProvider 가 있을 때만 동작.
   * 현재는 항상 no-op(계정 내 열람 + 학생 주도 공유가 기본 전달 경로).
   */
  private async maybePushGuardian(bookingId: string): Promise<void> {
    const row = await this.prisma.system_setting.findUnique({
      where: { key: ConsultReportService.FLAG_KEY },
    });
    const on =
      (row?.value as { guardianPush?: boolean } | undefined)?.guardianPush ===
      true;
    if (!on) return; // 기본 OFF — 직접 push 하지 않는다(계정 내 열람으로만). INV-10.

    // 본부 결정 ① 게이트(이중 방어): 플래그가 켜져도 "본인확인+전달동의" 완료 보호자에게만 push.
    // 동의가 없으면 대상 0명 → 여전히 no-op. 미성년 데이터 직접 push 는 동의 없이는 절대 불가.
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { student_id: true },
    });
    const targets = b?.student_id
      ? ((await this.guardianConsent?.consentedGuardianIds(b.student_id)) ?? [])
      : [];
    if (targets.length === 0) {
      this.logger.warn(
        `guardianPush ON 이나 전달동의 보호자 0명 — no-op(booking=${bookingId}).`,
      );
      return;
    }
    this.logger.warn(
      `guardianPush ON · 동의 보호자 ${targets.length}명 — 실 채널(알림톡/이메일) 미연동 stub, no-op(booking=${bookingId}). 채널 연동 후 발송.`,
    );
    // 실 채널 연동 시: targets 각 guardian 계정에 NotificationProvider 로 "새 상담 리포트" 직접 통지.
  }

  // ── 학부모 열람(연결된 자녀의 공유된 guardian 뷰만) ──
  private async assertGuardianOfStudent(guardian: AuthUser, studentId: string) {
    if (guardian.role !== AccountRole.GUARDIAN)
      throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    // 승인된 연결만 인정 — pending/rejected/revoked 는 무단 열람으로 차단(미성년 데이터 보호, 타 가디언 게이트와 동일).
    const link = await this.prisma.guardian_student_link.findFirst({
      where: {
        guardian_id: guardian.id,
        student_id: studentId,
        status: 'approved',
      },
    });
    if (!link) throw new ForbiddenException('연결된 자녀가 아닙니다.');
  }

  /** 학부모 — 연결된 자녀의 "공유된" 상담 리포트(guardian 뷰) 목록. */
  async listGuardianShared(guardian: AuthUser, studentId: string) {
    await this.assertGuardianOfStudent(guardian, studentId);
    const rows = await this.prisma.$queryRaw<
      Array<{
        booking_id: string;
        shared_at: Date | null;
        opened_at: Date | null;
        start_at: Date | null;
        teacher_name: string | null;
        category: string | null;
      }>
    >`
      SELECT cr.booking_id, v.shared_at, v.opened_at, b.start_at, a.name AS teacher_name, b.sub_type AS category
      FROM consult_report_view v
      JOIN consult_report cr ON cr.id = v.report_id
      JOIN booking b ON b.id = cr.booking_id
      LEFT JOIN account a ON a.id = b.teacher_id
      WHERE v.audience = 'guardian' AND v.shared_at IS NOT NULL AND cr.status = 'sent' AND b.student_id = ${studentId}::uuid
      ORDER BY v.shared_at DESC
      LIMIT 100`;
    return rows.map((r) => ({
      bookingId: r.booking_id,
      sharedAt: r.shared_at,
      openedAt: r.opened_at,
      startAt: r.start_at,
      teacherName: r.teacher_name,
      category: r.category,
    }));
  }

  /** 학부모 — 공유된 guardian 뷰 상세(첫 열람 스탬프 + 계측). */
  async guardianViewDetail(
    guardian: AuthUser,
    studentId: string,
    bookingId: string,
  ) {
    await this.assertGuardianOfStudent(guardian, studentId);
    const report = await this.prisma.consult_report.findUnique({
      where: { booking_id: bookingId },
    });
    if (!report || report.status !== 'sent')
      throw new NotFoundException('리포트가 없습니다.');
    // 자녀 소유 확인 — 이 리포트가 해당 학생의 것인지.
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { student_id: true },
    });
    if (b?.student_id !== studentId)
      throw new ForbiddenException('연결된 자녀의 리포트가 아닙니다.');
    const gv = await this.prisma.consult_report_view.findUnique({
      where: {
        report_id_audience: { report_id: report.id, audience: 'guardian' },
      },
    });
    if (!gv || !gv.shared_at)
      throw new NotFoundException('공유되지 않은 리포트입니다.');
    if (!gv.opened_at) {
      await this.prisma.consult_report_view.update({
        where: { id: gv.id },
        data: { opened_at: new Date() },
      });
      await this.recordFunnel('view', 'opened', {
        bookingId,
        audience: 'guardian',
      });
      await this.logAccess('report_view', report.id, guardian.id, 'read');
    }
    return {
      bookingId,
      sentAt: report.sent_at,
      ...(gv.body as GuardianViewBody),
    };
  }
}
