import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DiagnosticService } from './diagnostic.service';

class StartDto {
  @IsOptional() @IsString() subject?: string;
}
class AnswerDto {
  @IsString() questionId!: string;
  @IsOptional() @IsInt() @Min(0) @Max(9) chosen?: number | null;
}
class SubmitDto {
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => AnswerDto) answers!: AnswerDto[];
}
class ClinicDto {
  @IsString() attemptId!: string;
}

@Controller('diagnostics')
export class DiagnosticController {
  constructor(private readonly diag: DiagnosticService) {}

  /** POST /diagnostics/start — 진단 시작(학생). ?subject= 로 과목 한정. */
  @Post('start')
  @Roles('student')
  start(@Body() dto: StartDto, @CurrentUser() user: AuthUser) {
    return this.diag.start(user, dto.subject);
  }

  /** POST /diagnostics/clinic — 약점 클리닉 시작(지정 시도의 약점 유형 재출제). */
  @Post('clinic')
  @Roles('student')
  clinic(@Body() dto: ClinicDto, @CurrentUser() user: AuthUser) {
    return this.diag.startClinic(user, dto.attemptId);
  }

  /** GET /diagnostics/me — 내 진단 이력(학생). */
  @Get('me')
  @Roles('student')
  history(@CurrentUser() user: AuthUser) {
    return this.diag.myHistory(user);
  }

  /** GET /diagnostics/clinics — 약점 클리닉 결과 추이(학생). :id 보다 먼저 선언. */
  @Get('clinics')
  @Roles('student')
  clinicHistory(@CurrentUser() user: AuthUser) {
    return this.diag.clinicHistory(user);
  }

  /** GET /diagnostics/:id — 시도 상세·약점·처방(학생). */
  @Get(':id')
  @Roles('student')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.diag.detail(user, id);
  }

  /** POST /diagnostics/:id/submit — 제출·채점(학생). */
  @Post(':id/submit')
  @Roles('student')
  submit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitDto, @CurrentUser() user: AuthUser) {
    return this.diag.submit(user, id, dto.answers.map((a) => ({ questionId: a.questionId, chosen: a.chosen ?? null })));
  }
}
