import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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

  /**
   * GET /admin/guardian-links — 관리자/HR 이 연결을 찾아 복구하기 위한 목록(O125).
   * 학생·보호자 화면은 막혔을 때 "관리자에게 문의"라고 안내하는데 정작 관리자가 볼 화면이 없었다.
   * 센터 격리는 서비스에서 학생 센터 기준으로 적용된다.
   */
  @Get('admin/guardian-links')
  @Roles('admin', 'hr')
  adminLinks(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('scope') scope?: string,
  ) {
    // 기본은 '막힌 연결만' — 전체를 기본으로 두면 정상 연결이 상한을 채워 볼 것이 잘린다.
    return this.guardian.adminListLinks(user, q, scope === 'all' ? 'all' : 'stuck');
  }

  /**
   * POST /admin/guardian-links/{id}/unlock — 재신청 잠금 해제(관리자/HR, O126).
   * 강제 복구와 달리 **상태를 바꾸지 않는다** — 보호자가 다시 신청할 수 있게만 하고
   * 연결 성립은 학생 승인에 남긴다(학생 동의권을 우회하지 않는 가벼운 경로).
   */
  @Post('admin/guardian-links/:id/unlock')
  @Roles('admin', 'hr')
  unlockLink(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.guardian.unlockRelink(user, id);
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
