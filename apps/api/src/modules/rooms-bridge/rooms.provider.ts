import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CreateResult = {
  roomId: string;
  participants: Array<{ participantId: string; extUserId: string | null }>;
};

/** 실시간 룸 서비스(apps/realtime-rooms)로의 서버-투-서버 클라이언트. */
@Injectable()
export class RoomsProvider {
  private readonly logger = new Logger('RoomsProvider');
  constructor(private readonly config: ConfigService) {}

  private get apiUrl() {
    return (this.config.get<string>('ROOMS_API_URL') || '').replace(/\/$/, '');
  }
  private get apiKey() {
    return this.config.get<string>('ROOMS_API_KEY') || '';
  }

  /** 룸 서비스 사용 가능 여부(플래그 + URL 설정). */
  get enabled(): boolean {
    return (
      this.config.get<string>('REALTIME_ROOMS_ENABLED') === 'true' &&
      !!this.apiUrl
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`rooms ${path} → ${r.status}`);
    return r.json() as Promise<T>;
  }

  createRoom(payload: {
    externalRef: string;
    features: { chat: boolean; whiteboard: boolean; voice: boolean };
    opensAt: string | null;
    closesAt: string | null;
    mode?: string;
    metadata?: Record<string, unknown>;
    participants: Array<{
      extUserId: string;
      displayName?: string;
      role?: string;
    }>;
  }): Promise<CreateResult> {
    return this.post<CreateResult>('/api/rt/v1/rooms', payload);
  }

  /** 시간창·정책 메타 동기화 — 정책(유예일·무료 한도) 변경을 기존 룸에 반영. 실패는 호출자에서 비차단 처리. */
  updateWindow(
    roomId: string,
    body: {
      opensAt?: string | null;
      closesAt?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ ok: boolean }> {
    return this.post<{ ok: boolean }>(
      `/api/rt/v1/rooms/${roomId}/window`,
      body,
    );
  }

  async mintToken(
    roomId: string,
    participantId: string,
    ttlSec?: number,
  ): Promise<string> {
    const r = await this.post<{ token: string }>(
      `/api/rt/v1/rooms/${roomId}/tokens`,
      { participantId, ttlSec },
    );
    return r.token;
  }

  /** 참가자 동적 추가 + 토큰 — 강의실 학생 입장. */
  addParticipant(
    roomId: string,
    p: {
      extUserId?: string;
      displayName?: string;
      role?: string;
      ttlSec?: number;
    },
  ): Promise<{ participantId: string; token: string }> {
    return this.post<{ participantId: string; token: string }>(
      `/api/rt/v1/rooms/${roomId}/participants`,
      p,
    );
  }

  /** 룸 서비스 공개 접속 URL(클라이언트가 socket 으로 붙는 주소). */
  get publicUrl(): string {
    return this.config.get<string>('ROOMS_PUBLIC_URL') || this.apiUrl;
  }
}
