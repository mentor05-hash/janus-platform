import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';

export type RoomToken = { roomId: string; participantId: string; name?: string; iat: number; exp: number };

/** 룸 접속 토큰(HS256) — 프로비저닝 시 참가자별로 발급, 소켓 접속 때 검증. 외부 의존 없음. */
@Injectable()
export class TokenService {
  private readonly secret: string;
  constructor(config: ConfigService) {
    this.secret = config.get<string>('ROOMS_JWT_SECRET') || 'dev-rooms-secret-change';
  }
  private b64(o: object) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
  private sign(data: string) { return crypto.createHmac('sha256', this.secret).update(data).digest('base64url'); }

  issue(roomId: string, participantId: string, ttlSec: number, name?: string): string {
    const now = Math.floor(Date.now() / 1000);
    const h = this.b64({ alg: 'HS256', typ: 'JWT' });
    const p = this.b64({ roomId, participantId, name, iat: now, exp: now + ttlSec } satisfies RoomToken);
    return `${h}.${p}.${this.sign(`${h}.${p}`)}`;
  }

  verify(token: string): RoomToken | null {
    const parts = (token || '').split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    if (this.sign(`${h}.${p}`) !== sig) return null;
    try {
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as RoomToken;
      if (!payload.roomId || !payload.participantId) return null;
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch { return null; }
  }
}
