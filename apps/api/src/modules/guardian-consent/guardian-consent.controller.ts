import { BadRequestException, Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { GuardianConsentService } from './guardian-consent.service';
import { GuardianConsentDto, GuardianVerifyDto, ShareConsentDto } from './dto/guardian-consent.dto';

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

/**
 * 학생 본인의 보호자 공유 동의(O105) — **성인 학생**의 데이터를 보호자가 열람하려면 필요.
 * 미성년은 보호자 권한(guardian_data_consent)이 게이트라 이 토글이 열람 여부를 바꾸지 않는다(상태에 isMinor 표기).
 */
@Controller('me/share-consents')
@Roles('student')
export class StudentShareConsentController {
  constructor(private readonly svc: GuardianConsentService) {}

  /** GET /me/share-consents — 내 보호자 목록 + 공유 동의 상태. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.myShareConsents(user);
  }

  /** POST /me/share-consents — 특정 보호자에게 공유 동의. */
  @Post()
  grant(@CurrentUser() user: AuthUser, @Body() dto: ShareConsentDto) {
    return this.svc.grantShare(user, dto.guardianId);
  }

  /** DELETE /me/share-consents?guardianId= — 공유 동의 철회(즉시). */
  @Delete()
  revoke(@CurrentUser() user: AuthUser, @Query('guardianId') guardianId?: string) {
    if (!guardianId) throw new BadRequestException('guardianId 가 필요합니다.');
    return this.svc.revokeShare(user, guardianId);
  }
}
