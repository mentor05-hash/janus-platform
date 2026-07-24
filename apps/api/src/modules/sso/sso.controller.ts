import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SsoService } from './sso.service';
import { SsoTokenDto } from './dto/sso.dto';

/**
 * 크로스서비스 SSO 컨트롤러.
 * - POST /sso/token   (로그인) 연계 서비스 진입 토큰 발급 → {token, url}
 * - GET  /sso/services (로그인) 진입 가능 서비스 목록(티어 게이트)
 * - GET  /sso/verify   (공개)  정적 티어 페이지의 토큰 검증 위임 → {ok, tier, scope}
 */
@Controller('sso')
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  @Post('token')
  issue(@CurrentUser() user: AuthUser, @Body() dto: SsoTokenDto) {
    return this.sso.issue(user, dto.service, dto.scope);
  }

  @Get('services')
  services(@CurrentUser() user: AuthUser) {
    return this.sso.listForUser(user);
  }

  /** 정적 페이지는 시크릿을 못 가지므로 검증을 서버에 위임(설계 §4). 인증 불필요. */
  @Public()
  @Get('verify')
  verify(@Query('token') token: string, @Query('service') service?: string) {
    return this.sso.verify(token, service);
  }
}
