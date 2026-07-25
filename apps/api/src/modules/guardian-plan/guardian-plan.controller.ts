import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { GuardianPlanService } from './guardian-plan.service';

class PlanItemDto {
  @IsString() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(30) subject?: string | null;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsOptional() @IsString() @MaxLength(300) note?: string | null;
}

/** 학부모 계획 트랙(O106) — 자기 공간에서 자녀 계획을 세우고 학생에게 제안한다. */
@Controller('guardian/plan')
@Roles('guardian')
export class GuardianPlanController {
  constructor(private readonly svc: GuardianPlanService) {}

  /** GET /guardian/plan?studentId= — 내 계획 트랙(자녀별). */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    if (!studentId) throw new BadRequestException('studentId 가 필요합니다.');
    return this.svc.list(user, studentId);
  }

  /** POST /guardian/plan?studentId= — 계획 추가(draft: 아직 학생에게 보이지 않음). */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: PlanItemDto, @Query('studentId') studentId?: string) {
    if (!studentId) throw new BadRequestException('studentId 가 필요합니다.');
    return this.svc.create(user, studentId, dto);
  }

  /** PATCH /guardian/plan/{id} — 계획 수정(draft 만). */
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanItemDto) {
    return this.svc.update(user, id, dto);
  }

  /** DELETE /guardian/plan/{id} — 계획 삭제(학생이 수락해 만든 할 일은 학생 것이라 남는다). */
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(user, id);
  }

  /** POST /guardian/plan/{id}/propose — 학생에게 제안(성인 자녀는 학생 동의 필요·O105). */
  @Post(':id/propose')
  propose(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.propose(user, id);
  }
}

/** 학생 측 — 나에게 온 학부모 제안 확인·수락·거절(학생 자율성). */
@Controller('me/plan-proposals')
@Roles('student')
export class StudentPlanProposalController {
  constructor(private readonly svc: GuardianPlanService) {}

  /** GET /me/plan-proposals — 대기 중인 제안(수락 전에는 할 일 목록에 없음). */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.myProposals(user);
  }

  /** POST /me/plan-proposals/{id}/accept — 수락 → 내 할 일 생성. */
  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.accept(user, id);
  }

  /** POST /me/plan-proposals/{id}/decline — 거절(할 일 생성하지 않음). */
  @Post(':id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.decline(user, id);
  }
}
