import { BadRequestException, Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { GuardianConsentService } from './guardian-consent.service';
import { GuardianConsentDto, GuardianVerifyDto } from './dto/guardian-consent.dto';

/** 본부 결정 ① 학부모 동의·본인확인 — 미성년 자녀 데이터 전달 게이트(학부모 전용). */
@Controller('guardian/consent')
@Roles('guardian')
export class GuardianConsentController {
  constructor(private readonly svc: GuardianConsentService) {}

  /** GET /guardian/consent?studentId= — 본인확인·전달동의 현재 상태. */
  @Get()
  status(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    if (!studentId) throw new BadRequestException('studentId 가 필요합니다.');
    return this.svc.status(user, studentId);
  }

  /** POST /guardian/consent/verify — 본인확인(어댑터 stub). */
  @Post('verify')
  verify(@CurrentUser() user: AuthUser, @Body() dto: GuardianVerifyDto) {
    return this.svc.verify(user, dto);
  }

  /** POST /guardian/consent — 데이터 전달 동의(본인확인 완료 후). */
  @Post()
  grant(@CurrentUser() user: AuthUser, @Body() dto: GuardianConsentDto) {
    return this.svc.grantConsent(user, dto);
  }

  /** DELETE /guardian/consent?studentId= — 전달 동의 철회. */
  @Delete()
  revoke(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    if (!studentId) throw new BadRequestException('studentId 가 필요합니다.');
    return this.svc.revokeConsent(user, studentId);
  }
}
