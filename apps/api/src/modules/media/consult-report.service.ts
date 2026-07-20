import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountRole } from '../../config/enums';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { ConsultSummaryResult, LlmProvider } from '../llm/llm.types';
import { NotifyService } from '../notification/notify.service';
import { STT_PROVIDER } from './stt.types';
import type { SttProvider } from './stt.types';

type ReportBody = { covered: string[]; diagnosis: string; next_actions: string[]; demo?: boolean };

/**
 * R2~R5 상담 요약 파이프라인 — egress 산출(stored) → STT(전사) → LLM 요약 초안 → 전건 검수 → 발송.
 * 게이트: consult_recording.sttEnabled 플래그(기본 OFF) + sttAllowed(보호자 동의 — 본부 결정 O86).
 * 민감 산출물 접근은 media_access_log 에 감사 기록(R5).
 */
@Injectable()
export class ConsultReportService {
  private readonly logger = new Logger('ConsultReport');
  private static readonly FLAG_KEY = 'consult_recording';
  private static readonly FLAG_DEFAULT = { enabled: false, sttEnabled: false, retentionDays: 30, policyVersion: 'v1', sttRequiresGuardianConsent: true };
  private static readonly RETRY_MS = [30_000, 120_000, 600_000]; // 재시도 백오프(3회)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STT_PROVIDER) private readonly stt: SttProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Optional() private readonly notify?: NotifyService,
  ) {}

  private async flags() {
    const row = await this.prisma.system_setting.findUnique({ where: { key: ConsultReportService.FLAG_KEY } });
    return { ...ConsultReportService.FLAG_DEFAULT, ...((row?.value as object) ?? {}) } as typeof ConsultReportService.FLAG_DEFAULT;
  }

  /** 민감 산출물 접근 감사(R5) — 실패해도 본 작업 비차단. */
  private async logAccess(targetType: string, targetId: string, actorId: string | null, action: string) {
    try {
      await this.prisma.media_access_log.create({ data: { target_type: targetType, target_id: targetId, actor_id: actorId, action } });
    } catch { /* 감사 실패는 삼킨다 */ }
  }

  // ── 파이프라인(서버 전용) ─────────────────────────────────────────────

  /** egress stored 후 호출 — 전사·요약 초안 생성. 실패 시 백오프 재시도(3회). */
  async process(recordingId: string, attempt = 0): Promise<void> {
    try {
      const f = await this.flags();
      if (!f.enabled || !f.sttEnabled) return; // 플래그 OFF — 조용히 종료(수동 rebuild 로 재개 가능)
      const r = await this.prisma.consult_recording.findUnique({ where: { id: recordingId } });
      if (!r || r.status !== 'stored' || !r.s3_key) return;
      const b = await this.prisma.booking.findUnique({
        where: { id: r.booking_id },
        select: { id: true, student_id: true, teacher_id: true, consult_type: true, sub_type: true },
      });
      if (!b?.student_id) return;

      // 보호자 동의 게이트(O86) — 녹음 시점 스탬프 우선, 없으면 현재 동의 상태로 재확인.
      if (f.sttRequiresGuardianConsent && !r.consent_guardian_at) {
        const g = await this.prisma.consent_grant.findUnique({ where: { student_id_kind: { student_id: b.student_id, kind: 'recording_stt' } } });
        if (!(g && g.revoked_at == null)) {
          this.logger.log(`보호자 동의 없음 — STT 제외(수동 메모 리포트 폴백) booking=${r.booking_id}`);
          return;
        }
      }

      // 기존 리포트가 이미 검수 진행(approved/sent)이면 초안을 덮지 않는다.
      const existing = await this.prisma.consult_report.findUnique({ where: { booking_id: r.booking_id } });
      if (existing && existing.status !== 'draft') return;

      // ① 오디오 취득(S3) — 접근 감사
      await this.logAccess('recording', r.id, null, 'stt_read');
      const audio = await this.readObject(r.s3_key);

      // ② 전사(STT)
      const mime = r.s3_key.endsWith('.ogg') ? 'audio/ogg' : r.s3_key.endsWith('.mp4') ? 'audio/mp4' : 'audio/ogg';
      const tr = await this.stt.transcribe({ audio, mime, lang: 'ko' });
      const transcript = await this.prisma.consult_transcript.upsert({
        where: { recording_id: r.id },
        create: { recording_id: r.id, engine: tr.engine, lang: tr.lang, text: tr.text },
        update: { engine: tr.engine, lang: tr.lang, text: tr.text, created_at: new Date() },
      });

      // ③ 요약 초안(LLM — 가드레일 프롬프트는 provider 내 상수)
      const s = await this.llm.consultSummary({
        transcript: tr.text,
        durationSec: r.duration_sec,
        subject: b.sub_type ?? String(b.consult_type ?? '') ?? null,
        scoreHint: null, // janus_score 요지 직결은 후속(scores 모듈 결합 없이 v1 출시 — 기획 §5 주석)
      });
      await this.saveDraft(r.booking_id, transcript.id, s, tr.demo === true || s.demo === true);
      this.logger.log(`요약 초안 생성 완료 booking=${r.booking_id} (engine=${tr.engine})`);
    } catch (e) {
      this.logger.warn(`파이프라인 실패(booking recording=${recordingId}, 시도 ${attempt + 1}): ${(e as Error).message}`);
      const delay = ConsultReportService.RETRY_MS[attempt];
      if (delay != null) {
        const t = setTimeout(() => void this.process(recordingId, attempt + 1), delay);
        if (typeof t.unref === 'function') t.unref();
      }
    }
  }

  private async saveDraft(bookingId: string, transcriptId: string, s: ConsultSummaryResult, demo: boolean) {
    const body: ReportBody = { covered: s.covered, diagnosis: s.diagnosis, next_actions: s.nextActions, ...(demo ? { demo: true } : {}) };
    await this.prisma.consult_report.upsert({
      where: { booking_id: bookingId },
      create: { booking_id: bookingId, transcript_id: transcriptId, body },
      update: { transcript_id: transcriptId, body, status: 'draft', updated_at: new Date() },
    });
  }

  /** egress S3 자격으로 산출물 읽기(STT 입력). */
  private async readObject(key: string): Promise<Buffer> {
    const raw = this.config.get<string>('LIVEKIT_EGRESS_S3');
    if (!raw) throw new Error('LIVEKIT_EGRESS_S3 미설정 — 오디오를 읽을 수 없습니다.');
    const s3cfg = JSON.parse(raw) as { access_key: string; secret: string; bucket: string; region?: string; endpoint?: string };
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: s3cfg.region ?? 'auto',
      ...(s3cfg.endpoint ? { endpoint: s3cfg.endpoint } : {}),
      credentials: { accessKeyId: s3cfg.access_key, secretAccessKey: s3cfg.secret },
    });
    const res = await client.send(new GetObjectCommand({ Bucket: s3cfg.bucket, Key: key }));
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
    const isTeacher = b.teacher_id === user.id || user.role === AccountRole.ADMIN;
    const isStudent = b.student_id === user.id;
    if (!isTeacher && !isStudent) throw new ForbiddenException('이 상담의 참여자가 아닙니다.');
    return { b, isTeacher, isStudent };
  }

  /** 선생님 — 내 상담 리포트 목록(검수함). */
  async listMine(user: AuthUser) {
    if (user.role !== AccountRole.TEACHER && user.role !== AccountRole.ADMIN) throw new ForbiddenException('선생님만 조회할 수 있습니다.');
    const rows = await this.prisma.$queryRaw<Array<{ booking_id: string; status: string; updated_at: Date; sent_at: Date | null; opened_at: Date | null; start_at: Date | null; student_name: string | null; category: string | null; demo: boolean | null }>>`
      SELECT cr.booking_id, cr.status, cr.updated_at, cr.sent_at, cr.opened_at, b.start_at, a.name AS student_name, b.sub_type AS category,
             (cr.body ->> 'demo')::boolean AS demo
      FROM consult_report cr
      JOIN booking b ON b.id = cr.booking_id
      LEFT JOIN account a ON a.id = b.student_id
      WHERE b.teacher_id = ${user.id}::uuid
      ORDER BY cr.updated_at DESC
      LIMIT 100`;
    return rows.map((r) => ({
      bookingId: r.booking_id, status: r.status, updatedAt: r.updated_at, sentAt: r.sent_at, openedAt: r.opened_at,
      startAt: r.start_at, studentName: r.student_name, category: r.category, demo: r.demo === true,
    }));
  }

  /** 학생 — 발송된 내 리포트 목록. */
  async listStudent(user: AuthUser) {
    const rows = await this.prisma.$queryRaw<Array<{ booking_id: string; sent_at: Date | null; opened_at: Date | null; start_at: Date | null; teacher_name: string | null; category: string | null }>>`
      SELECT cr.booking_id, cr.sent_at, cr.opened_at, b.start_at, a.name AS teacher_name, b.sub_type AS category
      FROM consult_report cr
      JOIN booking b ON b.id = cr.booking_id
      LEFT JOIN account a ON a.id = b.teacher_id
      WHERE b.student_id = ${user.id}::uuid AND cr.status = 'sent'
      ORDER BY cr.sent_at DESC
      LIMIT 100`;
    return rows.map((r) => ({ bookingId: r.booking_id, sentAt: r.sent_at, openedAt: r.opened_at, startAt: r.start_at, teacherName: r.teacher_name, category: r.category }));
  }

  /** 상세 — 선생님: 전 상태+전사문 / 학생: sent 만(첫 열람 시 opened_at 스탬프). */
  async detail(user: AuthUser, bookingId: string) {
    const { isTeacher, isStudent } = await this.assertBooking(user, bookingId);
    const report = await this.prisma.consult_report.findUnique({ where: { booking_id: bookingId } });
    if (!report) throw new NotFoundException('리포트가 아직 없습니다.');
    if (isStudent && !isTeacher) {
      if (report.status !== 'sent') throw new NotFoundException('리포트가 아직 없습니다.');
      if (!report.opened_at) {
        await this.prisma.consult_report.update({ where: { id: report.id }, data: { opened_at: new Date() } });
        report.opened_at = new Date();
      }
      await this.logAccess('report', report.id, user.id, 'read');
      return this.shape(report, null);
    }
    // 선생님 — 전사문 열람은 감사 기록
    let transcriptText: string | null = null;
    if (report.transcript_id) {
      const t = await this.prisma.consult_transcript.findUnique({ where: { id: report.transcript_id } });
      if (t) { transcriptText = t.text; await this.logAccess('transcript', t.id, user.id, 'read'); }
    }
    await this.logAccess('report', report.id, user.id, 'read');
    return this.shape(report, transcriptText);
  }

  private shape(r: { booking_id: string; body: unknown; status: string; sent_at: Date | null; opened_at: Date | null; updated_at: Date }, transcript: string | null) {
    const body = (r.body ?? {}) as ReportBody;
    return {
      bookingId: r.booking_id, status: r.status, sentAt: r.sent_at, openedAt: r.opened_at, updatedAt: r.updated_at,
      covered: body.covered ?? [], diagnosis: body.diagnosis ?? '', nextActions: body.next_actions ?? [], demo: body.demo === true,
      transcript,
    };
  }

  /** 검수 편집(선생님) — sent 전까지 수정 가능. 수정하면 demo 마크 해제(사람 확인 완료). */
  async update(user: AuthUser, bookingId: string, dto: { covered?: string[]; diagnosis?: string; nextActions?: string[] }) {
    const { isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher) throw new ForbiddenException('담당 선생님만 수정할 수 있습니다.');
    const report = await this.prisma.consult_report.findUnique({ where: { booking_id: bookingId } });
    if (!report) throw new NotFoundException('리포트가 없습니다.');
    if (report.status === 'sent') throw new ForbiddenException('발송된 리포트는 수정할 수 없습니다.');
    const prev = (report.body ?? {}) as ReportBody;
    const body: ReportBody = {
      covered: dto.covered ?? prev.covered ?? [],
      diagnosis: dto.diagnosis ?? prev.diagnosis ?? '',
      next_actions: dto.nextActions ?? prev.next_actions ?? [],
    };
    await this.prisma.consult_report.update({ where: { id: report.id }, data: { body, updated_at: new Date() } });
    return { ok: true };
  }

  /** 승인(선생님) — 전건 검수 원칙(브리핑 §8-5 기본값). */
  async approve(user: AuthUser, bookingId: string) {
    const { isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher) throw new ForbiddenException('담당 선생님만 승인할 수 있습니다.');
    const report = await this.prisma.consult_report.findUnique({ where: { booking_id: bookingId } });
    if (!report || report.status === 'sent') throw new ForbiddenException('승인할 초안이 없습니다.');
    await this.prisma.consult_report.update({ where: { id: report.id }, data: { status: 'approved', approved_by: user.id, updated_at: new Date() } });
    return { ok: true, status: 'approved' };
  }

  /** 발송(선생님) — 학생 알림(계정 내 열람, 브리핑 §8-4 기본값). */
  async send(user: AuthUser, bookingId: string) {
    const { b, isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher) throw new ForbiddenException('담당 선생님만 발송할 수 있습니다.');
    const report = await this.prisma.consult_report.findUnique({ where: { booking_id: bookingId } });
    if (!report || report.status !== 'approved') throw new ForbiddenException('승인된 리포트만 발송할 수 있습니다.');
    await this.prisma.consult_report.update({ where: { id: report.id }, data: { status: 'sent', sent_at: new Date(), updated_at: new Date() } });
    void this.notify?.notify(b.student_id, 'consult_report', { bookingId });
    return { ok: true, status: 'sent' };
  }

  /** 초안 재생성(선생님) — 파이프라인 수동 재실행(플래그 무시하지 않음 — sttEnabled 필요). */
  async rebuild(user: AuthUser, bookingId: string) {
    const { isTeacher } = await this.assertBooking(user, bookingId);
    if (!isTeacher) throw new ForbiddenException('담당 선생님만 재생성할 수 있습니다.');
    const report = await this.prisma.consult_report.findUnique({ where: { booking_id: bookingId } });
    if (report && report.status === 'sent') throw new ForbiddenException('발송된 리포트는 재생성할 수 없습니다.');
    const r = await this.prisma.consult_recording.findUnique({ where: { booking_id: bookingId } });
    if (!r || r.status !== 'stored' || !r.s3_key) throw new NotFoundException('전사 가능한 녹음 산출물이 없습니다.');
    const f = await this.flags();
    if (!f.enabled || !f.sttEnabled) throw new ForbiddenException('요약 파이프라인이 비활성화되어 있습니다(consult_recording.sttEnabled).');
    void this.process(r.id);
    return { ok: true, queued: true };
  }
}
