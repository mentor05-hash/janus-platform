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

@Controller('diagnostics')
export class DiagnosticController {
  constructor(private readonly diag: DiagnosticService) {}

  /** POST /diagnostics/start — 진단 시작(학생). ?subject= 로 과목 한정. */
  @Post('start')
  @Roles('student')
  start(@Body() dto: StartDto, @CurrentUser() user: AuthUser) {
    return this.diag.start(user, dto.subject);
  }

  /** GET /diagnostics/me — 내 진단 이력(학생). */
  @Get('me')
  @Roles('student')
  history(@CurrentUser() user: AuthUser) {
    return this.diag.myHistory(user);
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
