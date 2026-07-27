import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentDto } from './dto/enrollment.dto';

/** 재원 표시·동의(학생) — 스펙 §6. verified 집계의 원천. */
@Controller('enrollments')
@Roles('student')
export class EnrollmentController {
  constructor(private readonly svc: EnrollmentService) {}

  /** POST /enrollments — 재원 표시 + 통계 활용 동의. */
  @Post()
  enroll(@CurrentUser() user: AuthUser, @Body() dto: EnrollmentDto) {
    return this.svc.enroll(user, dto);
  }

  /** GET /enrollments/mine — 내 재원 표시. */
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.svc.mine(user);
  }

  /** DELETE /enrollments/:academyId — 재원 철회. */
  @Delete(':academyId')
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
  ) {
    return this.svc.withdraw(user, academyId);
  }
}
