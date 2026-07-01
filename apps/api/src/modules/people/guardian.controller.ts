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
