import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG } from '../db';
import { TokenService } from './token.service';

export type Features = { chat: boolean; whiteboard: boolean; voice: boolean };
export type RoomRow = { id: string; external_ref: string | null; features: Features; opens_at: Date | null; closes_at: Date | null };
export type Feature = keyof Features;

type MsgRow = { id: string; sender_id: string | null; kind: string; body: string | null; file_url: string | null; reply_to_id: string | null; reactions: Record<string, string[]>; read_at: Date | null; created_at: Date };

/** 룸 데이터 + 시간창/기능 정책. 호스트 도메인 무관(범용). */
@Injectable()
export class RoomsService {
  constructor(@Inject(PG) private readonly pool: Pool, private readonly tokens: TokenService) {}

  async createRoom(dto: {
    externalRef?: string; features?: Partial<Features>; opensAt?: string | null; closesAt?: string | null;
    metadata?: unknown; tokenTtlSec?: number;
    participants: Array<{ extUserId?: string; displayName?: string; role?: string }>;
  }) {
    const features: Features = { chat: true, whiteboard: true, voice: true, ...(dto.features ?? {}) };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query<{ id: string }>(
        `INSERT INTO room (external_ref, features, opens_at, closes_at, metadata)
         VALUES ($1, $2::jsonb, $3, $4, $5::jsonb) RETURNING id`,
        [dto.externalRef ?? null, JSON.stringify(features), dto.opensAt ?? null, dto.closesAt ?? null, dto.metadata ? JSON.stringify(dto.metadata) : null],
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
        participants.push({ participantId: pid, extUserId: p.extUserId ?? null, displayName: p.displayName ?? null, token: this.tokens.issue(roomId, pid, ttl, p.displayName) });
      }
      await client.query('COMMIT');
      return { roomId, features, opensAt: dto.opensAt ?? null, closesAt: dto.closesAt ?? null, participants };
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally {
      client.release();
    }
  }

  async getRoom(roomId: string): Promise<RoomRow | null> {
    const r = await this.pool.query<RoomRow>(`SELECT id, external_ref, features, opens_at, closes_at FROM room WHERE id = $1`, [roomId]);
    return r.rows[0] ?? null;
  }
  async participantInRoom(roomId: string, participantId: string): Promise<boolean> {
    const r = await this.pool.query(`SELECT 1 FROM room_participant WHERE id = $1 AND room_id = $2`, [participantId, roomId]);
    return (r.rowCount ?? 0) > 0;
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
  async history(roomId: string, viewerId: string) {
    const r = await this.pool.query<MsgRow>(`SELECT * FROM room_message WHERE room_id = $1 ORDER BY created_at ASC LIMIT 500`, [roomId]);
    const byId = new Map(r.rows.map((m) => [m.id, m]));
    return r.rows.map((m) => this.shape(m, viewerId, m.reply_to_id ? byId.get(m.reply_to_id) ?? null : null));
  }
  async saveMessage(roomId: string, senderId: string, kind: string, body: string | null, fileUrl: string | null, replyToId?: string | null) {
    const r = await this.pool.query<MsgRow>(
      `INSERT INTO room_message (room_id, sender_id, kind, body, file_url, reply_to_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [roomId, senderId, kind, body, fileUrl, replyToId ?? null],
    );
    const orig = replyToId ? (await this.pool.query<MsgRow>(`SELECT * FROM room_message WHERE id = $1 AND room_id = $2`, [replyToId, roomId])).rows[0] ?? null : null;
    return this.shape(r.rows[0], senderId, orig);
  }
  async toggleReaction(roomId: string, messageId: string, participantId: string, emoji: string) {
    const cur = await this.pool.query<MsgRow>(`SELECT * FROM room_message WHERE id = $1 AND room_id = $2`, [messageId, roomId]);
    const m = cur.rows[0]; if (!m) return null;
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
    return {
      id: m.id, senderId: m.sender_id, mine: m.sender_id === viewerId, kind: m.kind, body: m.body,
      fileUrl: m.file_url, createdAt: m.created_at, readAt: m.read_at ?? null,
      reactions: m.reactions ?? {}, replyToId: m.reply_to_id ?? null,
      replyTo: orig ? { id: orig.id, senderId: orig.sender_id, kind: orig.kind, body: orig.body ? orig.body.slice(0, 80) : null } : null,
    };
  }
}
