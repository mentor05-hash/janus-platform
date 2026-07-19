import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountRole } from '../../config/enums';
import { MEDIA_PROVIDER } from './media.types';
import type { MediaProvider } from './media.types';

/**
 * R1 상담 오디오 녹음(브리핑 v1) — 동의 성립 후에만 egress 시작(서버 차단 원칙 §4),
 * 철회 시 즉시 중단·파기, egress webhook 으로 산출물 확정. 기능 플래그 기본 OFF(본부 확정 전).
 * 오디오 파기 자체는 S3 lifecycle 위임(무인 원칙) — expires_at 은 표시·검증용.
 */
@Injectable()
export class MediaRecordingService {
  private readonly logger = new Logger('MediaRecording');
  private static readonly FLAG_KEY = 'consult_recording';
  private static readonly FLAG_DEFAULT = { enabled: false, retentionDays: 30, policyVersion: 'v1' }; // 🟡 설정 분리(하드코딩 금지)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
  ) {}

  private async flags() {
    const row = await this.prisma.system_setting.findUnique({ where: { key: MediaRecordingService.FLAG_KEY } });
    return { ...MediaRecordingService.FLAG_DEFAULT, ...((row?.value as object) ?? {}) } as typeof MediaRecordingService.FLAG_DEFAULT;
  }

  /** 예약 당사자 검증(booking 상태머신 무변경 — 읽기만). */
  private async assertParticipant(user: AuthUser, bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, student_id: true, teacher_id: true, status: true },
    });
    if (!b) throw new NotFoundException('예약을 찾을 수 없습니다.');
    const isStudent = b.student_id === user.id;
    const isTeacher = b.teacher_id === user.id;
    if (!isStudent && !isTeacher) throw new ForbiddenException('이 상담의 참여자가 아닙니다.');
    return { b, side: isStudent ? ('student' as const) : ('teacher' as const) };
  }

  /** 동의 상태 조회(상담룸 UI 초기화). enabled=false 면 UI 는 녹음 요소 자체를 숨긴다. */
  async status(user: AuthUser, bookingId: string) {
    const f = await this.flags();
    await this.assertParticipant(user, bookingId);
    const r = await this.prisma.consult_recording.findUnique({ where: { booking_id: bookingId } });
    return {
      enabled: f.enabled,
      policyVersion: f.policyVersion,
      retentionDays: f.retentionDays,
      status: r?.status ?? 'pending',
      studentConsented: r?.consent_student_at != null,
      teacherConsented: r?.consent_teacher_at != null,
    };
  }

  /** 동의/철회 — 양측 동의 성립 시에만 egress 시작. 철회는 즉시 중단+파기 마킹. */
  async consent(user: AuthUser, bookingId: string, recording: boolean) {
    const f = await this.flags();
    if (!f.enabled) throw new ForbiddenException('상담 녹음 기능이 비활성화되어 있습니다.');
    const { side } = await this.assertParticipant(user, bookingId);
    const now = new Date();

    if (!recording) {
      // 철회 — 녹음 중이면 즉시 중단, 산출물은 aborted 마킹(webhook 도착 시 즉시 삭제 §handleEgressEnded).
      const r = await this.prisma.consult_recording.findUnique({ where: { booking_id: bookingId } });
      if (r?.status === 'recording' && r.egress_id) {
        await this.media.stopRecording(`consult_${bookingId}`, r.egress_id).catch((e) => this.logger.warn(`철회 중단 실패: ${e}`));
      }
      await this.prisma.consult_recording.upsert({
        where: { booking_id: bookingId },
        create: { booking_id: bookingId, status: 'aborted', consent_policy_version: f.policyVersion },
        update: {
          status: 'aborted',
          ...(side === 'student' ? { consent_student_at: null } : { consent_teacher_at: null }),
        },
      });
      return { status: 'aborted', recordingStarted: false };
    }

    const r = await this.prisma.consult_recording.upsert({
      where: { booking_id: bookingId },
      create: {
        booking_id: bookingId,
        consent_policy_version: f.policyVersion,
        ...(side === 'student' ? { consent_student_at: now } : { consent_teacher_at: now }),
      },
      update: side === 'student' ? { consent_student_at: now } : { consent_teacher_at: now },
    });
    const both = (side === 'student' ? now : r.consent_student_at) != null && (side === 'teacher' ? now : r.consent_teacher_at) != null;
    if (!both || r.status === 'recording' || r.status === 'stored') {
      if (r.status === 'pending' || r.status === 'aborted') {
        await this.prisma.consult_recording.update({ where: { booking_id: bookingId }, data: { status: both ? 'consented' : 'pending' } });
      }
      if (!both) return { status: 'pending', recordingStarted: false };
    }
    // 양측 동의 성립 → egress 시작(오디오 전용·상담 경로). 실패해도 상담 자체는 비차단.
    try {
      const started = await this.media.startRecording(`consult_${bookingId}`, { pathPrefix: 'consult-audio' });
      const expiresAt = new Date(Date.now() + f.retentionDays * 24 * 3600_000);
      await this.prisma.consult_recording.update({
        where: { booking_id: bookingId },
        data: { status: 'recording', egress_id: started.recordingRef, expires_at: expiresAt },
      });
      return { status: 'recording', recordingStarted: true };
    } catch (e) {
      this.logger.warn(`egress 시작 실패 booking=${bookingId}: ${(e as Error).message}`);
      await this.prisma.consult_recording.update({ where: { booking_id: bookingId }, data: { status: 'consented' } });
      return { status: 'consented', recordingStarted: false, note: '녹음 시작에 실패했어요(상담은 계속 진행됩니다).' };
    }
  }

  /** LiveKit egress webhook — Authorization JWT(HS256, sha256(body) 클레임) 검증 후 산출물 확정. */
  verifyWebhook(rawBody: string, authHeader: string | undefined): boolean {
    const secret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!secret || !authHeader) return false;
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const expect = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    if (expect !== parts[2]) return false;
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sha256?: string };
      const bodyHash = createHash('sha256').update(rawBody).digest('base64');
      return claims.sha256 === bodyHash;
    } catch { return false; }
  }

  /** egress_ended 처리 — s3_key·duration 기록. 철회(aborted)된 건은 산출물 즉시 삭제. */
  async handleEgressEnded(payload: { egressInfo?: { egressId?: string; roomName?: string; fileResults?: Array<{ filename?: string; duration?: string | number; size?: string | number }> } }) {
    const info = payload.egressInfo;
    if (!info?.egressId) return { ok: false };
    const r = await this.prisma.consult_recording.findFirst({ where: { egress_id: info.egressId } });
    if (!r) return { ok: true, note: 'consult 녹음 아님(강의 등) — 무시' };
    const file = info.fileResults?.[0];
    const durationSec = file?.duration != null ? Math.round(Number(file.duration) / 1e9) : null; // LiveKit ns
    if (r.status === 'aborted') {
      // 철회 건 — 산출물이 올라왔다면 지체 없이 파기(R1 완료 기준: 철회 시 파일 미잔존).
      if (file?.filename) await this.purgeObject(file.filename);
      await this.prisma.consult_recording.update({ where: { id: r.id }, data: { purged_at: new Date(), s3_key: null } });
      return { ok: true, purged: true };
    }
    await this.prisma.consult_recording.update({
      where: { id: r.id },
      data: {
        status: 'stored',
        s3_key: file?.filename ?? null,
        duration_sec: durationSec,
        size_bytes: file?.size != null ? BigInt(file.size) : null,
      },
    });
    return { ok: true };
  }

  /** egress S3 자격으로 산출물 삭제(철회 파기 전용). 실패는 로깅만(수동 정리 대상). */
  private async purgeObject(key: string) {
    try {
      const raw = this.config.get<string>('LIVEKIT_EGRESS_S3');
      if (!raw) return;
      const s3cfg = JSON.parse(raw) as { access_key: string; secret: string; bucket: string; region?: string; endpoint?: string };
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client({
        region: s3cfg.region ?? 'auto',
        ...(s3cfg.endpoint ? { endpoint: s3cfg.endpoint } : {}),
        credentials: { accessKeyId: s3cfg.access_key, secretAccessKey: s3cfg.secret },
      });
      await client.send(new DeleteObjectCommand({ Bucket: s3cfg.bucket, Key: key }));
      this.logger.log(`철회 파기: ${key}`);
    } catch (e) {
      this.logger.error(`철회 파기 실패(수동 정리 필요): ${key} — ${(e as Error).message}`);
    }
  }
}
