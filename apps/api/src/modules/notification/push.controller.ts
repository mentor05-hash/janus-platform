import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PushService } from './push.service';

class RegisterPushDto {
  @IsString() @IsNotEmpty() token!: string;
  @IsOptional() @IsIn(['ios', 'android', 'web']) platform?: string;
}
class UnregisterPushDto {
  @IsString() @IsNotEmpty() token!: string;
}

@Controller('me/push-token')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** GET /me/push-token — 내 등록 기기 토큰. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.push.list(user);
  }

  /** POST /me/push-token — 기기 토큰 등록(로그인 시). */
  @Post()
  @HttpCode(200)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterPushDto) {
    return this.push.register(user, dto.token, dto.platform);
  }

  /** DELETE /me/push-token — 기기 토큰 해제(로그아웃 시). */
  @Delete()
  unregister(@CurrentUser() user: AuthUser, @Body() dto: UnregisterPushDto) {
    return this.push.unregister(user, dto.token);
  }

  /** POST /me/push-token/test — mock 테스트 푸시. */
  @Post('test')
  @HttpCode(200)
  test(@CurrentUser() user: AuthUser) {
    return this.push.test(user);
  }
}
