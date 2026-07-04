import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { RoomsService } from './rooms.service';
import { TokenService } from './token.service';

type CreateRoomDto = {
  externalRef?: string;
  features?: { chat?: boolean; whiteboard?: boolean; voice?: boolean };
  opensAt?: string | null;   // ISO. opensAt+closesAt 둘 다 있으면 시간창 제한(강제 종료). 생략 시 무제한.
  closesAt?: string | null;
  tokenTtlSec?: number;
  metadata?: unknown;
  participants: Array<{ extUserId?: string; displayName?: string; role?: string }>;
};

/** 프로비저닝 API — 호스트 백엔드(예약 등)가 서버-투-서버로 호출. 헬스는 공개. */
@Controller('api/rt/v1')
export class RoomsController {
  constructor(private readonly svc: RoomsService, private readonly tokens: TokenService) {}

  @Get('health')
  health() { return { status: 'ok', service: 'realtime-rooms' }; }

  /** 룸 생성 + 참가자별 접속 토큰 발급. */
  @UseGuards(ApiKeyGuard)
  @Post('rooms')
  async create(@Body() dto: CreateRoomDto) {
    return this.svc.createRoom({
      externalRef: dto.externalRef, features: dto.features, opensAt: dto.opensAt, closesAt: dto.closesAt,
      metadata: dto.metadata, tokenTtlSec: dto.tokenTtlSec, participants: dto.participants ?? [],
    });
  }

  /** 룸 메타 + 기록 열람(종료 후 확인용). viewer 쿼리로 mine 계산. */
  @UseGuards(ApiKeyGuard)
  @Get('rooms/:id')
  async get(@Param('id') id: string, @Query('viewer') viewer?: string) {
    const room = await this.svc.getRoom(id);
    if (!room) throw new NotFoundException('room not found');
    return { id: room.id, externalRef: room.external_ref, features: room.features, session: this.svc.sessionInfo(room), messages: await this.svc.history(id, viewer ?? '') };
  }

  /** 기존 룸에 참가자 토큰 재발급(만료·추가 참가자용). */
  @UseGuards(ApiKeyGuard)
  @Post('rooms/:id/tokens')
  async mint(@Param('id') id: string, @Body() body: { participantId: string; ttlSec?: number; name?: string }) {
    const room = await this.svc.getRoom(id);
    if (!room) throw new NotFoundException('room not found');
    if (!(await this.svc.participantInRoom(id, body.participantId))) throw new NotFoundException('participant not in room');
    return { token: this.tokens.issue(id, body.participantId, body.ttlSec && body.ttlSec > 0 ? body.ttlSec : 12 * 3600, body.name) };
  }
}
