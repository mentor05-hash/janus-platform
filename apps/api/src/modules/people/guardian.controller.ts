import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IsIn, IsInt, IsOptional, IsPositive } from 'class-validator';
import { GuardianService } from './guardian.service';
import {
  GuardianLinkRequestDto,
  GuardianLinkRespondDto,
} from './dto/guardian.dto';

class ChildChargeDto {
  @IsInt() @IsPositive() amount!: number;
  @IsOptional() @IsIn(['card', 'voucher']) method?: 'card' | 'voucher';
}

@Controller()
export class GuardianController {
  constructor(private readonly guardian: GuardianService) {}

  /** GET /guardian/children — 연결 자녀 대시보드(보호자). */
  @Get('guardian/children')
  @Roles('guardian')
  children(@CurrentUser() user: AuthUser) {
    return this.guardian.listChildren(user);
  }

  /** GET /guardian/children/{studentId}/credits — 자녀 크레딧 계좌·내역(보호자). */
  @Get('guardian/children/:studentId/credits')
  @Roles('guardian')
  childCredits(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.guardian.childCredits(user, studentId);
  }

  /** POST /guardian/children/{studentId}/charge — 자녀 크레딧 대납 충전(보호자). */
  @Post('guardian/children/:studentId/charge')
  @Roles('guardian')
  chargeChild(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: ChildChargeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.guardian.chargeChild(user, studentId, dto.amount, dto.method);
  }

  /** GET /guardian/links — 내가 신청한 연결 목록(보호자). 상태 확인용. */
  @Get('guardian/links')
  @Roles('guardian')
  myLinks(@CurrentUser() user: AuthUser) {
    return this.guardian.listLinks(user);
  }

  /**
   * GET /me/guardian-links — 나에게 온 보호자 연결 신청·승인 목록(학생).
   * 이 경로가 없어서 학생이 승인할 방법이 없었다(신청 알림만 가고 화면이 없었다).
   */
  @Get('me/guardian-links')
  @Roles('student')
  myGuardianLinks(@CurrentUser() user: AuthUser) {
    return this.guardian.listLinks(user);
  }

  /** POST /guardian/links — 자녀 연결 신청(보호자). */
  @Post('guardian/links')
  @Roles('guardian')
  requestLink(
    @CurrentUser() user: AuthUser,
    @Body() dto: GuardianLinkRequestDto,
  ) {
    return this.guardian.requestLink(user, dto);
  }

  /** PATCH /guardian/links/{id}/respond — 학생/관리자 승인·거절·해제. */
  @Patch('guardian/links/:id/respond')
  @Roles('student', 'admin', 'hr')
  respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuardianLinkRespondDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.guardian.respondLink(id, dto, user);
  }
}
