import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RoomsProvider } from './rooms.provider';

type Mapping = { room_id: string; student_participant_id: string; teacher_participant_id: string };

/**
 * 예약 → 실시간 룸 브리지. 플래그(REALTIME_ROOMS_ENABLED)일 때만 동작.
 * 예약 참여자(학생/담당 선생님)에게 룸 접속 토큰을 발급 — 기존 in-app realtime 과 병행(폴백).
 */
@Injectable()
export class RoomsBridgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly rooms: RoomsProvider,
    private readonly config: ConfigService,
  ) {}

  /** 클라이언트가 브라우저에서 접속할 룸 서비스 공개 URL. */
  private get publicUrl() { return this.config.get<string>('ROOMS_PUBLIC_URL') || ''; }

  async session(user: AuthUser, bookingId: string) {
    if (!this.rooms.enabled) return { enabled: false as const };
    const b = await this.realtime.assertRoomAccess(user, bookingId); // 참여자 아니면 throw
    // 룸 참가자는 학생/담당 선생님뿐. 관리자·HR 뷰어는 기존 in-app 로 폴백.
    const isStudent = b.student_id === user.id, isTeacher = b.teacher_id === user.id;
    if (!isStudent && !isTeacher) return { enabled: false as const };

    const access = await this.realtime.featureAccess(user, b.student_id ?? undefined);
    const features = { chat: access.chat, whiteboard: access.whiteboard, voice: access.chat };
    const win = this.realtime.sessionWindow(b);
    const opensAt = win.opensAt?.toISOString() ?? null;
    const closesAt = win.closesAt?.toISOString() ?? null;

    const map = await this.ensureRoom(bookingId, b.student_id!, b.teacher_id!, features, opensAt, closesAt);
    const participantId = isStudent ? map.student_participant_id : map.teacher_participant_id;
    const token = await this.rooms.mintToken(map.room_id, participantId);
    return {
      enabled: true as const,
      url: this.publicUrl,
      roomId: map.room_id,
      participantId,
      token,
      features,
      session: this.realtime.sessionInfo(b),
    };
  }

  /** 예약당 룸 1개(멱등). 없으면 프로비저닝 후 매핑 저장(경합은 ON CONFLICT 로 흡수). */
  private async ensureRoom(bookingId: string, studentId: string, teacherId: string, features: { chat: boolean; whiteboard: boolean; voice: boolean }, opensAt: string | null, closesAt: string | null): Promise<Mapping> {
    const existing = await this.getMapping(bookingId);
    if (existing) return existing;

    const created = await this.rooms.createRoom({
      externalRef: bookingId, features, opensAt, closesAt,
      participants: [
        { extUserId: studentId, role: 'student', displayName: '학생' },
        { extUserId: teacherId, role: 'teacher', displayName: '선생님' },
      ],
    });
    const sp = created.participants.find((p) => p.extUserId === studentId)?.participantId ?? created.participants[0].participantId;
    const tp = created.participants.find((p) => p.extUserId === teacherId)?.participantId ?? created.participants[1].participantId;
    // 경합 시 먼저 저장한 매핑을 사용(우리 방은 고아가 될 수 있으나 드묾).
    await this.prisma.$executeRaw`
      INSERT INTO booking_room (booking_id, room_id, student_participant_id, teacher_participant_id)
      VALUES (${bookingId}::uuid, ${created.roomId}::uuid, ${sp}::uuid, ${tp}::uuid)
      ON CONFLICT (booking_id) DO NOTHING`;
    return (await this.getMapping(bookingId))!;
  }

  private async getMapping(bookingId: string): Promise<Mapping | null> {
    const rows = await this.prisma.$queryRaw<Mapping[]>`
      SELECT room_id::text, student_participant_id::text, teacher_participant_id::text
      FROM booking_room WHERE booking_id = ${bookingId}::uuid`;
    return rows[0] ?? null;
  }
}
