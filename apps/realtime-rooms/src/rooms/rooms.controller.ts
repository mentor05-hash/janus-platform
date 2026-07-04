import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG } from '../db';
import { ApiKeyGuard } from './api-key.guard';
import { CreateRoomDto, MintTokenDto } from './dto';
import { RoomsService } from './rooms.service';
import { TokenService } from './token.service';

/** 프로비저닝 API — 호스트 백엔드(예약 등)가 서버-투-서버로 호출. 헬스는 공개. */
@Controller('api/rt/v1')
export class RoomsController {
  constructor(private readonly svc: RoomsService, private readonly tokens: TokenService, @Inject(PG) private readonly pool: Pool) {}

  /** 헬스 — DB 연결까지 확인(오토스케일·모니터링 대비). */
  @Get('health')
  async health() {
    let db = 'up';
    try { await this.pool.query('SELECT 1'); } catch { db = 'down'; }
    return { status: db === 'up' ? 'ok' : 'degraded', service: 'realtime-rooms', checks: { db } };
  }

  /** 룸 생성 + 참가자별 접속 토큰 발급. */
  @UseGuards(ApiKeyGuard)
  @Post('rooms')
  async create(@Body() dto: CreateRoomDto) {
    // 시간창은 both-or-neither. 하나만 오거나 opens>=closes 면 거부.
    const hasOpen = dto.opensAt != null, hasClose = dto.closesAt != null;
    if (hasOpen !== hasClose) throw new BadRequestException('opensAt 과 closesAt 은 함께 지정하거나 함께 생략해야 합니다.');
    if (hasOpen && hasClose && Date.parse(dto.opensAt!) >= Date.parse(dto.closesAt!)) throw new BadRequestException('opensAt 은 closesAt 보다 앞서야 합니다.');
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
  async mint(@Param('id') id: string, @Body() body: MintTokenDto) {
    const room = await this.svc.getRoom(id);
    if (!room) throw new NotFoundException('room not found');
    if (!(await this.svc.participantInRoom(id, body.participantId))) throw new NotFoundException('participant not in room');
    return { token: this.tokens.issue(id, body.participantId, body.ttlSec && body.ttlSec > 0 ? body.ttlSec : 12 * 3600, body.name) };
  }
}
