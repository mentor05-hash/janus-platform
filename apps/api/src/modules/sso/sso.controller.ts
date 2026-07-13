import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/ratelimit/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SsoService } from './sso.service';

const SLUG = /^[a-z0-9-]+$/;

class SsoTokenDto {
  @IsString() @MaxLength(40) @Matches(SLUG) service!: string;
}
class SsoServiceDto {
  @IsString() @MaxLength(40) @Matches(SLUG) id!: string;
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) allowedScopes?: string[];
  @IsOptional() @IsIn(['free', 'member', 'paid', 'consultant']) minTier?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) redirectOrigins?: string[];
}

@Controller()
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  /** POST /sso/token {service} — 로그인 사용자에게 진입 토큰 발급(TTL 15분). */
  @Post('sso/token')
  @RateLimit({ limit: 30, windowSec: 60 })
  token(@CurrentUser() user: AuthUser, @Body() dto: SsoTokenDto) {
    return this.sso.issue(user, dto.service);
  }

  /** GET /sso/verify?token=&service= — 정적 페이지 위임 검증(공개, 설계 §4). */
  @Public()
  @RateLimit({ limit: 120, windowSec: 60 })
  @Get('sso/verify')
  verify(@Query('token') token: string, @Query('service') service?: string) {
    return this.sso.verify(token ?? '', service || undefined);
  }

  /** 관리자 — 레지스트리. */
  @Roles('admin')
  @Get('admin/sso/services')
  list() {
    return this.sso.listServices();
  }

  @Roles('admin')
  @Post('admin/sso/services')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: SsoServiceDto) {
    return this.sso.upsertService(user, dto);
  }

  /** epoch 증가 — 해당 서비스 토큰 일괄 폐기. */
  @Roles('admin')
  @Post('admin/sso/services/:id/revoke')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sso.revokeAll(user, id);
  }
}
