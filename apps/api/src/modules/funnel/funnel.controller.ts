import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/ratelimit/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { FunnelService } from './funnel.service';

/* 간이 전환 계측(W3·접합계약 C3) — 페이지 뷰·CTA 클릭 자체 로그.
 * 고정 id: 페이지 `baechi` · 상담 전환 CTA `consult-reserve` (핵심 지표 — 변경 금지). */
const SLUG = /^[a-z0-9-]+$/;

class FunnelEventDto {
  @IsString() @MaxLength(40) @Matches(SLUG) page!: string;
  @IsIn(['view', 'cta']) event!: 'view' | 'cta';
  @IsOptional() @IsString() @MaxLength(60) @Matches(SLUG) cta?: string;
  @IsOptional() @IsString() @MaxLength(64) sessionId?: string;
  @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

@Controller()
export class FunnelController {
  constructor(private readonly funnel: FunnelService) {}

  /** POST /funnel/event — 공개(익명 세션 id 기반, PII 없음). fire-and-forget 용. */
  @Public()
  @RateLimit({ limit: 120, windowSec: 60 })
  @Post('funnel/event')
  record(@Body() dto: FunnelEventDto) {
    return this.funnel.record(dto);
  }

  /** GET /funnel/summary?days=7 — 관리자: 페이지·CTA 집계 + 배치표→상담 전환율. */
  @Roles('admin', 'hr')
  @Get('funnel/summary')
  summary(@CurrentUser() _user: AuthUser, @Query('days') days?: string) {
    return this.funnel.summary(Number(days) || 7);
  }
}
