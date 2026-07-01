import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/ratelimit/rate-limit.decorator';
import { AuthService } from './auth.service';
import {
  LoginDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RefreshDto,
  SignupDto,
  VerifyConfirmDto,
  VerifyRequestDto,
} from './dto/auth.dto';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @RateLimit({ limit: 10, windowSec: 60 }) // 무차별 대입 방지(§10)
  @Post('auth/login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @RateLimit({ limit: 5, windowSec: 3600 })
  @Post('auth/signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @RateLimit({ limit: 30, windowSec: 60 })
  @Post('auth/refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('auth/logout')
  @HttpCode(200)
  logout(@CurrentUser() user: AuthUser) {
    return this.auth.logout(user.id);
  }

  // ── 비밀번호 재설정(공개) ──
  @Public()
  @RateLimit({ limit: 5, windowSec: 3600 })
  @Post('auth/password-reset/request')
  @HttpCode(200)
  requestReset(@Body() dto: PasswordResetRequestDto) {
    return this.auth.requestPasswordReset(dto.loginId);
  }

  @Public()
  @RateLimit({ limit: 10, windowSec: 3600 })
  @Post('auth/password-reset/confirm')
  @HttpCode(200)
  confirmReset(@Body() dto: PasswordResetConfirmDto) {
    return this.auth.confirmPasswordReset(dto.token, dto.newPassword);
  }

  // ── 이메일/휴대폰 인증(인증 사용자) ──
  @Get('me/contact')
  contact(@CurrentUser() user: AuthUser) {
    return this.auth.myContact(user.id);
  }

  @RateLimit({ limit: 5, windowSec: 300 })
  @Post('me/verify/request')
  @HttpCode(200)
  verifyRequest(@CurrentUser() user: AuthUser, @Body() dto: VerifyRequestDto) {
    return this.auth.requestVerify(user.id, dto.channel, dto.target);
  }

  @RateLimit({ limit: 10, windowSec: 300 })
  @Post('me/verify/confirm')
  @HttpCode(200)
  verifyConfirm(@CurrentUser() user: AuthUser, @Body() dto: VerifyConfirmDto) {
    return this.auth.confirmVerify(user.id, dto.channel, dto.code);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
