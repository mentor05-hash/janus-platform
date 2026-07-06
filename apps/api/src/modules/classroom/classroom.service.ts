import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { RoomsProvider } from '../rooms-bridge/rooms.provider';
import { CreateClassDto, EnrollDto } from './dto/classroom.dto';
import { canTransition, type ClassStatus } from './domain/status';
import { MEDIA_PROVIDER, type MediaProvider } from '../media/media.types';

// 온라인 강의실 — 개설(룸 프로비저닝) · 학생 등록 · 입장 토큰 · 시작/종료 · 음성(SFU) · 녹화.
@Injectable()
export class ClassroomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsProvider,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
  ) {}

  private isStaff(u: AuthUser) { return u.role === 'admin' || u.role === 'hr'; }
  private async accountName(id: string): Promise<string | undefined> {
    const a = await this.prisma.account.findUnique({ where: { id }, select: { name: true } });
    return a?.name ?? undefined;
  }

  // 강의 개설 — teacher. 룸 서비스에 lecture 룸을 프로비저닝하고 host 참가자를 만든다.
  async create(dto: CreateClassDto, user: AuthUser) {
    const now = new Date();
    const row = await this.prisma.class_session.create({
      data: {
        teacher_id: user.id,
        title: dto.title,
        subject: dto.subject ?? null,
        scheduled_at: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        duration_min: dto.durationMin ?? null,
        capacity: dto.capacity ?? 100,
        status: 'scheduled',
        updated_at: now,
      },
    });

    if (this.rooms.enabled) {
      // 강의 룸은 시간창을 두지 않는다(무제한) — 개설/시작/종료는 class 상태로 제어.
      // scheduled_at 은 안내용. (시간창 강제가 필요하면 향후 start 시 룸 창을 여는 방식으로 확장)
      const teacherName = await this.accountName(user.id);
      const created = await this.rooms.createRoom({
        externalRef: `class:${row.id}`,
        features: { chat: true, whiteboard: true, voice: true },
        opensAt: null, closesAt: null, mode: 'lecture',
        participants: [{ extUserId: user.id, displayName: teacherName, role: 'host' }],
      });
      const hostPid = created.participants.find((p) => p.extUserId === user.id)?.participantId ?? created.participants[0]?.participantId ?? null;
      await this.prisma.class_session.update({ where: { id: row.id }, data: { room_id: created.roomId, host_participant_id: hostPid } });
      return this.toDto({ ...row, room_id: created.roomId });
    }
    return this.toDto(row);
  }

  // 학생 등록(초대) — teacher/staff. 룸 참가자는 입장 시 지연 발급.
  async enroll(classId: string, dto: EnrollDto, user: AuthUser) {
    const cls = await this.mustOwn(classId, user);
    const data = dto.studentIds.map((sid) => ({ class_session_id: cls.id, student_id: sid, role: 'viewer' }));
    const res = await this.prisma.class_enrollment.createMany({ data, skipDuplicates: true });
    const total = await this.prisma.class_enrollment.count({ where: { class_session_id: cls.id } });
    return { enrolled: res.count, total };
  }

  // 입장 토큰 — 선생님(host) 또는 등록 학생(viewer). 학생은 첫 입장 시 룸 참가자 생성.
  async join(classId: string, user: AuthUser) {
    const cls = await this.prisma.class_session.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('강의를 찾을 수 없습니다.');
    if (!this.rooms.enabled) throw new BadRequestException('실시간 룸 서비스가 설정되지 않았습니다.');
    if (!cls.room_id) throw new ConflictException('강의실이 아직 준비되지 않았습니다.');

    // 선생님(host)
    if (cls.teacher_id === user.id || this.isStaff(user)) {
      if (!cls.host_participant_id) throw new ConflictException('host 참가자가 없습니다.');
      const token = await this.rooms.mintToken(cls.room_id, cls.host_participant_id);
      return { url: this.rooms.publicUrl, token, role: 'host', roomId: cls.room_id };
    }

    // 학생(viewer)
    const enr = await this.prisma.class_enrollment.findFirst({ where: { class_session_id: classId, student_id: user.id } });
    if (!enr) throw new ForbiddenException('이 강의에 등록되어 있지 않습니다.');
    if (enr.participant_id) {
      const token = await this.rooms.mintToken(cls.room_id, enr.participant_id);
      return { url: this.rooms.publicUrl, token, role: enr.role, roomId: cls.room_id };
    }
    const name = await this.accountName(user.id);
    const added = await this.rooms.addParticipant(cls.room_id, { extUserId: user.id, displayName: name, role: enr.role });
    await this.prisma.class_enrollment.update({ where: { id: enr.id }, data: { participant_id: added.participantId, joined_at: new Date() } });
    return { url: this.rooms.publicUrl, token: added.token, role: enr.role, roomId: cls.room_id };
  }

  async start(classId: string, user: AuthUser) { return this.transition(classId, user, 'live'); }
  async end(classId: string, user: AuthUser) { return this.transition(classId, user, 'ended'); }

  private async transition(classId: string, user: AuthUser, to: ClassStatus) {
    const cls = await this.mustOwn(classId, user);
    if (!canTransition(cls.status as ClassStatus, to)) {
      throw new ConflictException(`현재 상태(${cls.status})에서 ${to} 로 전환할 수 없습니다.`);
    }
    const res = await this.prisma.class_session.updateMany({ where: { id: classId, status: cls.status }, data: { status: to, updated_at: new Date() } });
    if (res.count === 0) throw new ConflictException('상태가 이미 변경되었습니다.');
    return this.getOne(classId, user);
  }

  // 목록 — teacher=내 개설, student=내 등록, staff=전체.
  async list(user: AuthUser) {
    let where: Record<string, unknown> = {};
    if (this.isStaff(user)) where = {};
    else if (user.role === 'teacher') where = { teacher_id: user.id };
    else where = { enrollments: { some: { student_id: user.id } } };
    const rows = await this.prisma.class_session.findMany({ where, orderBy: { created_at: 'desc' }, take: 100 });
    return { data: rows.map((r) => this.toDto(r)) };
  }

  async getOne(classId: string, user: AuthUser) {
    const cls = await this.prisma.class_session.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('강의를 찾을 수 없습니다.');
    const isOwner = cls.teacher_id === user.id || this.isStaff(user);
    const enrolledCount = await this.prisma.class_enrollment.count({ where: { class_session_id: classId } });
    if (!isOwner) {
      const enr = await this.prisma.class_enrollment.findFirst({ where: { class_session_id: classId, student_id: user.id } });
      if (!enr) throw new ForbiddenException('이 강의에 접근할 권한이 없습니다.');
    }
    return { ...this.toDto(cls), enrolledCount };
  }

  // ── 음성(SFU) ────────────────────────────────────────────────────
  // 미디어 접속 토큰 — 선생님=publisher(송출), 등록 학생=subscriber(수신). SFU 미설정 시 note 반환.
  async mediaToken(classId: string, user: AuthUser) {
    const cls = await this.prisma.class_session.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('강의를 찾을 수 없습니다.');
    if (!cls.room_id) throw new ConflictException('강의실이 아직 준비되지 않았습니다.');
    const isOwner = cls.teacher_id === user.id || this.isStaff(user);
    if (!isOwner) {
      const enr = await this.prisma.class_enrollment.findFirst({ where: { class_session_id: classId, student_id: user.id } });
      if (!enr) throw new ForbiddenException('이 강의에 등록되어 있지 않습니다.');
    }
    const name = await this.accountName(user.id);
    return this.media.issueToken(cls.room_id, user.id, isOwner ? 'publisher' : 'subscriber', name);
  }

  // ── 녹화(필수) ───────────────────────────────────────────────────
  async startRecording(classId: string, user: AuthUser) {
    const cls = await this.mustOwn(classId, user);
    if (!cls.room_id) throw new ConflictException('강의실이 준비되지 않았습니다.');
    const open = await this.prisma.class_recording.findFirst({ where: { class_session_id: classId, status: 'recording' } });
    if (open) throw new ConflictException('이미 녹화 중입니다.');
    const rec = await this.media.startRecording(cls.room_id);
    const row = await this.prisma.class_recording.create({
      data: { class_session_id: classId, kind: 'av', provider: rec.provider, recording_ref: rec.recordingRef, status: 'recording' },
    });
    return this.toRecordingDto(row);
  }

  async stopRecording(classId: string, recordingId: string, user: AuthUser) {
    const cls = await this.mustOwn(classId, user);
    const rec = await this.prisma.class_recording.findFirst({ where: { id: recordingId, class_session_id: classId } });
    if (!rec) throw new NotFoundException('녹화를 찾을 수 없습니다.');
    if (rec.status !== 'recording') return this.toRecordingDto(rec);
    const res = cls.room_id && rec.recording_ref ? await this.media.stopRecording(cls.room_id, rec.recording_ref) : { url: null };
    const row = await this.prisma.class_recording.update({
      where: { id: rec.id },
      data: { status: 'done', url: res.url ?? null, duration_sec: res.durationSec ?? null, ended_at: new Date() },
    });
    return this.toRecordingDto(row);
  }

  async listRecordings(classId: string, user: AuthUser) {
    const cls = await this.prisma.class_session.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('강의를 찾을 수 없습니다.');
    const isOwner = cls.teacher_id === user.id || this.isStaff(user);
    if (!isOwner) {
      const enr = await this.prisma.class_enrollment.findFirst({ where: { class_session_id: classId, student_id: user.id } });
      if (!enr) throw new ForbiddenException('이 강의에 접근할 권한이 없습니다.');
    }
    const rows = await this.prisma.class_recording.findMany({ where: { class_session_id: classId }, orderBy: { started_at: 'desc' } });
    return { data: rows.map((r) => this.toRecordingDto(r)) };
  }

  private toRecordingDto(r: {
    id: string; kind: string; provider: string | null; status: string; url: string | null;
    duration_sec: number | null; started_at: Date; ended_at: Date | null;
  }) {
    return { id: r.id, kind: r.kind, provider: r.provider, status: r.status, url: r.url, durationSec: r.duration_sec, startedAt: r.started_at, endedAt: r.ended_at };
  }

  // 출석/명단 — teacher/staff. 등록 학생 + 입장 여부(joined_at)·역할.
  async roster(classId: string, user: AuthUser) {
    const cls = await this.mustOwn(classId, user);
    const enrs = await this.prisma.class_enrollment.findMany({ where: { class_session_id: cls.id }, orderBy: { created_at: 'asc' } });
    const ids = enrs.map((e) => e.student_id).filter((x): x is string => !!x);
    const accounts = ids.length ? await this.prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const nameById = new Map(accounts.map((a) => [a.id, a.name]));
    return {
      data: enrs.map((e) => ({
        id: e.id, studentId: e.student_id, name: e.student_id ? (nameById.get(e.student_id) ?? null) : null,
        role: e.role, joined: !!e.joined_at, joinedAt: e.joined_at, leftAt: e.left_at,
      })),
      meta: { total: enrs.length, joined: enrs.filter((e) => e.joined_at).length },
    };
  }

  private async mustOwn(classId: string, user: AuthUser) {
    const cls = await this.prisma.class_session.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('강의를 찾을 수 없습니다.');
    if (cls.teacher_id !== user.id && !this.isStaff(user)) throw new ForbiddenException('강의 개설자만 할 수 있습니다.');
    return cls;
  }

  private toDto(c: {
    id: string; teacher_id: string; title: string; subject: string | null;
    scheduled_at: Date | null; duration_min: number | null; capacity: number;
    room_id: string | null; status: string; created_at: Date;
  }) {
    return {
      id: c.id, teacherId: c.teacher_id, title: c.title, subject: c.subject,
      scheduledAt: c.scheduled_at, durationMin: c.duration_min, capacity: c.capacity,
      roomId: c.room_id, status: c.status, createdAt: c.created_at,
    };
  }
}
