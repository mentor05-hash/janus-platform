import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG } from '../db';
import { MetricsService } from './metrics.service';
import { TokenService } from './token.service';

export type Features = { chat: boolean; whiteboard: boolean; voice: boolean };
export type RoomRow = { id: string; external_ref: string | null; features: Features; opens_at: Date | null; closes_at: Date | null; token_epoch: number; metadata: Record<string, unknown> | null };
export type Feature = keyof Features;
export type FileRow = { id: string; room_id: string; filename: string; mime: string | null; size: number | null; storage_path: string };

/** keyset 커서 = base64("<createdAtISO>|<id>"). 안정적 정렬(생성시각+id). */
const encodeCursor = (createdAt: Date, id: string) => Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
const decodeCursor = (c: string): { ts: string; id: string } | null => {
  try { const [ts, id] = Buffer.from(c, 'base64url').toString().split('|'); return ts && id ? { ts, id } : null; } catch { return null; }
};

type MsgRow = { id: string; sender_id: string | null; kind: string; body: string | null; file_url: string | null; reply_to_id: string | null; reactions: Record<string, string[]>; read_at: Date | null; deleted_at: Date | null; created_at: Date };

/** 룸 데이터 + 시간창/기능 정책. 호스트 도메인 무관(범용). */
@Injectable()
export class RoomsService {
  constructor(@Inject(PG) private readonly pool: Pool, private readonly tokens: TokenService, private readonly metrics: MetricsService) {}

  async createRoom(dto: {
    externalRef?: string; features?: Partial<Features>; opensAt?: string | null; closesAt?: string | null;
    metadata?: unknown; tokenTtlSec?: number; mode?: string;
    participants: Array<{ extUserId?: string; displayName?: string; role?: string }>;
  }) {
    const features: Features = { chat: true, whiteboard: true, voice: true, ...(dto.features ?? {}) };
    // mode(lecture 등)는 metadata 에 병합해 저장 — 강의 모드 게이팅의 단일 소스.
    const metaObj: Record<string, unknown> = { ...(typeof dto.metadata === 'object' && dto.metadata ? (dto.metadata as Record<string, unknown>) : {}) };
    if (dto.mode) metaObj.mode = dto.mode;
    const metaJson = Object.keys(metaObj).length ? JSON.stringify(metaObj) : null;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query<{ id: string }>(
        `INSERT INTO room (external_ref, features, opens_at, closes_at, metadata)
         VALUES ($1, $2::jsonb, $3, $4, $5::jsonb) RETURNING id`,
        [dto.externalRef ?? null, JSON.stringify(features), dto.opensAt ?? null, dto.closesAt ?? null, metaJson],
      );
      const roomId = r.rows[0].id;
      const ttl = dto.tokenTtlSec && dto.tokenTtlSec > 0 ? dto.tokenTtlSec : 12 * 3600;
      const participants: Array<{ participantId: string; extUserId: string | null; displayName: string | null; token: string }> = [];
      for (const p of dto.participants ?? []) {
        const pr = await client.query<{ id: string }>(
          `INSERT INTO room_participant (room_id, ext_user_id, display_name, role) VALUES ($1,$2,$3,$4) RETURNING id`,
          [roomId, p.extUserId ?? null, p.displayName ?? null, p.role ?? null],
        );
        const pid = pr.rows[0].id;
        participants.push({ participantId: pid, extUserId: p.extUserId ?? null, displayName: p.displayName ?? null, token: this.tokens.issue(roomId, pid, ttl, 0, p.displayName) });
      }
      await client.query('COMMIT');
      this.metrics.roomsCreated.inc();
      return { roomId, features, opensAt: dto.opensAt ?? null, closesAt: dto.closesAt ?? null, participants };
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally {
      client.release();
    }
  }

  async getRoom(roomId: string): Promise<RoomRow | null> {
    const r = await this.pool.query<RoomRow>(`SELECT id, external_ref, features, opens_at, closes_at, token_epoch, metadata FROM room WHERE id = $1`, [roomId]);
    return r.rows[0] ?? null;
  }
  /** 룸에 참가자 1명 추가 + 접속 토큰 발급 — 강의실 학생 입장(동적 등록)용. */
  async addParticipant(roomId: string, p: { extUserId?: string; displayName?: string; role?: string; ttlSec?: number }): Promise<{ participantId: string; token: string } | null> {
    const room = await this.getRoom(roomId);
    if (!room) return null;
    const pr = await this.pool.query<{ id: string }>(
      `INSERT INTO room_participant (room_id, ext_user_id, display_name, role) VALUES ($1,$2,$3,$4) RETURNING id`,
      [roomId, p.extUserId ?? null, p.displayName ?? null, p.role ?? null],
    );
    const pid = pr.rows[0].id;
    const ttl = p.ttlSec && p.ttlSec > 0 ? p.ttlSec : 12 * 3600;
    return { participantId: pid, token: this.tokens.issue(roomId, pid, ttl, room.token_epoch, p.displayName) };
  }

  /** 강의(1:다) 모드 여부 — metadata.mode==='lecture'. 강의 모드에선 host/presenter 만 판서. */
  lectureMode(room: RoomRow): boolean {
    return (room.metadata as { mode?: string } | null)?.mode === 'lecture';
  }

  /** 참가자 역할(host·viewer·presenter…) — 서버 권위 게이팅용(토큰 신뢰 금지). */
  async getParticipantRole(roomId: string, participantId: string): Promise<string | null> {
    const r = await this.pool.query<{ role: string | null }>(`SELECT role FROM room_participant WHERE id = $1 AND room_id = $2`, [participantId, roomId]);
    return r.rows[0]?.role ?? null;
  }

  /** 참가자 역할 변경 — 발표권 위임/회수(host→presenter, presenter→viewer). 다중 인스턴스 공유(DB). */
  async setParticipantRole(roomId: string, participantId: string, role: string): Promise<boolean> {
    const r = await this.pool.query(`UPDATE room_participant SET role = $3 WHERE id = $1 AND room_id = $2`, [participantId, roomId, role]);
    return (r.rowCount ?? 0) > 0;
  }

  async participantInRoom(roomId: string, participantId: string): Promise<boolean> {
    const r = await this.pool.query(`SELECT 1 FROM room_participant WHERE id = $1 AND room_id = $2`, [participantId, roomId]);
    return (r.rowCount ?? 0) > 0;
  }

  /** 토큰 폐기 — epoch 증가로 기존 토큰 일괄 무효화. 반환: 새 epoch. */
  async revoke(roomId: string): Promise<number | null> {
    const r = await this.pool.query<{ token_epoch: number }>(`UPDATE room SET token_epoch = token_epoch + 1 WHERE id = $1 RETURNING token_epoch`, [roomId]);
    return r.rows[0]?.token_epoch ?? null;
  }

  // ── 시간창(호스트가 opens/closes 를 지정; 둘 다 있으면 제한, 강제 종료) ──
  sessionWindow(room: RoomRow): { restricted: boolean; state: 'before' | 'open' | 'closed'; opensAt: Date | null; closesAt: Date | null } {
    const restricted = !!room.opens_at && !!room.closes_at;
    if (!restricted) return { restricted: false, state: 'open', opensAt: null, closesAt: null };
    const now = Date.now();
    const o = room.opens_at!.getTime(), c = room.closes_at!.getTime();
    return { restricted: true, state: now < o ? 'before' : now > c ? 'closed' : 'open', opensAt: room.opens_at, closesAt: room.closes_at };
  }
  sessionOpen(room: RoomRow): boolean { const w = this.sessionWindow(room); return !w.restricted || w.state === 'open'; }
  sessionInfo(room: RoomRow) { const w = this.sessionWindow(room); return { restricted: w.restricted, state: w.state, opensAt: w.opensAt?.toISOString() ?? null, closesAt: w.closesAt?.toISOString() ?? null }; }
  featureOn(room: RoomRow, f: Feature): boolean { return room.features?.[f] !== false; }

  // ── 채팅 ──
  /** 최신 한 페이지(기본) 또는 커서(before) 이전 페이지. 반환: 오름차순 messages + nextCursor(더 오래된 것). */
  async history(roomId: string, viewerId: string, opts?: { before?: string; limit?: number }) {
    const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
    const cur = opts?.before ? decodeCursor(opts.before) : null;
    const params: unknown[] = [roomId];
    let where = 'room_id = $1';
    if (cur) { params.push(cur.ts, cur.id); where += ` AND (created_at, id) < ($2::timestamptz, $3::uuid)`; }
    const rows = (await this.pool.query<MsgRow>(
      `SELECT * FROM room_message WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`, params,
    )).rows;
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);                       // 최신→과거
    const oldest = page[page.length - 1];
    const asc = page.slice().reverse();                      // 과거→최신(표시 순서)
    const replyMap = await this.replyMap(roomId, asc.map((m) => m.reply_to_id).filter((x): x is string => !!x));
    return {
      messages: asc.map((m) => this.shape(m, viewerId, m.reply_to_id ? replyMap.get(m.reply_to_id) ?? null : null)),
      nextCursor: hasMore && oldest ? encodeCursor(oldest.created_at, oldest.id) : null,
      hasMore,
    };
  }
  private async replyMap(roomId: string, ids: string[]): Promise<Map<string, MsgRow>> {
    if (!ids.length) return new Map();
    const r = await this.pool.query<MsgRow>(`SELECT * FROM room_message WHERE room_id = $1 AND id = ANY($2::uuid[])`, [roomId, [...new Set(ids)]]);
    return new Map(r.rows.map((m) => [m.id, m]));
  }
  async saveMessage(roomId: string, senderId: string, kind: string, body: string | null, fileUrl: string | null, replyToId?: string | null) {
    const r = await this.pool.query<MsgRow>(
      `INSERT INTO room_message (room_id, sender_id, kind, body, file_url, reply_to_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [roomId, senderId, kind, body, fileUrl, replyToId ?? null],
    );
    this.metrics.messages.inc();
    const orig = replyToId ? (await this.pool.query<MsgRow>(`SELECT * FROM room_message WHERE id = $1 AND room_id = $2`, [replyToId, roomId])).rows[0] ?? null : null;
    return this.shape(r.rows[0], senderId, orig);
  }

  // ── 첨부 파일 ──
  async createFile(roomId: string, uploaderId: string, filename: string, mime: string | null, size: number | null, storagePath: string) {
    const r = await this.pool.query<{ id: string }>(
      `INSERT INTO room_file (room_id, uploader_id, filename, mime, size, storage_path) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [roomId, uploaderId, filename, mime, size, storagePath],
    );
    return r.rows[0].id;
  }
  async setFilePath(fileId: string, storagePath: string) {
    await this.pool.query(`UPDATE room_file SET storage_path = $1 WHERE id = $2`, [storagePath, fileId]);
  }
  async getFile(fileId: string): Promise<FileRow | null> {
    const r = await this.pool.query<FileRow>(`SELECT id, room_id, filename, mime, size, storage_path FROM room_file WHERE id = $1`, [fileId]);
    return r.rows[0] ?? null;
  }
  /** 메시지 삭제(회수) — 본인 발신만, soft delete(원문 보존). */
  async deleteMessage(roomId: string, participantId: string, messageId: string): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE room_message SET deleted_at = now() WHERE id = $1 AND room_id = $2 AND sender_id = $3 AND deleted_at IS NULL`,
      [messageId, roomId, participantId],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async toggleReaction(roomId: string, messageId: string, participantId: string, emoji: string) {
    const cur = await this.pool.query<MsgRow>(`SELECT * FROM room_message WHERE id = $1 AND room_id = $2`, [messageId, roomId]);
    const m = cur.rows[0]; if (!m || m.deleted_at) return null;
    const reactions: Record<string, string[]> = { ...(m.reactions ?? {}) };
    const set = new Set(reactions[emoji] ?? []);
    if (set.has(participantId)) set.delete(participantId); else set.add(participantId);
    if (set.size) reactions[emoji] = [...set]; else delete reactions[emoji];
    await this.pool.query(`UPDATE room_message SET reactions = $1::jsonb WHERE id = $2`, [JSON.stringify(reactions), messageId]);
    return reactions;
  }
  async markRead(roomId: string, participantId: string) {
    const at = new Date();
    const r = await this.pool.query(`UPDATE room_message SET read_at = $1 WHERE room_id = $2 AND sender_id IS DISTINCT FROM $3 AND read_at IS NULL`, [at, roomId, participantId]);
    return { count: r.rowCount ?? 0, at, readerId: participantId };
  }

  // ── 화이트보드 ──
  async latestSnapshot(roomId: string) {
    const r = await this.pool.query<{ strokes: unknown; background_url: string | null }>(`SELECT strokes, background_url FROM room_snapshot WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`, [roomId]);
    return r.rows[0] ?? null;
  }
  async saveSnapshot(roomId: string, participantId: string, strokes: unknown, backgroundUrl?: string | null) {
    await this.pool.query(`INSERT INTO room_snapshot (room_id, strokes, background_url, created_by) VALUES ($1,$2::jsonb,$3,$4)`, [roomId, JSON.stringify(strokes ?? []), backgroundUrl ?? null, participantId]);
  }

  private shape(m: MsgRow, viewerId: string, orig: MsgRow | null) {
    // 삭제(회수)된 메시지는 내용을 내려보내지 않는다 — kind='deleted' 묘비만.
    if (m.deleted_at) {
      return {
        id: m.id, senderId: m.sender_id, mine: m.sender_id === viewerId, kind: 'deleted', body: null,
        fileUrl: null, createdAt: m.created_at, readAt: m.read_at ?? null,
        reactions: {} as Record<string, string[]>, replyToId: null, replyTo: null,
      };
    }
    return {
      id: m.id, senderId: m.sender_id, mine: m.sender_id === viewerId, kind: m.kind, body: m.body,
      fileUrl: m.file_url, createdAt: m.created_at, readAt: m.read_at ?? null,
      reactions: m.reactions ?? {}, replyToId: m.reply_to_id ?? null,
      replyTo: orig && !orig.deleted_at ? { id: orig.id, senderId: orig.sender_id, kind: orig.kind, body: orig.body ? orig.body.slice(0, 80) : null } : null,
    };
  }
}
