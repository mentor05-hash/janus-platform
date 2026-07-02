import { Body, Controller, Get, Param, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UploadedFileLike } from '../storage/storage.types';
import { ScoresService } from './scores.service';

class ScoreItemDto {
  @IsString() subject!: string;
  @IsOptional() @IsNumber() score?: number | null;
  @IsOptional() @IsNumber() maxScore?: number | null;
  @IsOptional() @IsString() grade?: string | null;
}
class ManualScoreDto {
  @IsOptional() @IsString() studentId?: string;
  @IsOptional() @IsString() studentLoginId?: string;
  @IsString() period!: string;
  @IsOptional() @IsString() examType?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() reportFileId?: string;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ScoreItemDto) items!: ScoreItemDto[];
}
class OcrDto { @IsString() fileId!: string; }
class GoalDto {
  @IsString() studentLoginId!: string;
  @IsOptional() @IsString() tier?: string | null;
  @IsOptional() @IsNumber() avg?: number | null;
}
class PlacementDto {
  @IsOptional() @IsString() tier?: string;
  @IsOptional() @IsString() line?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) universities?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) departments?: string[];
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsString() source?: string;
}
class ScorePolicyDto {
  @IsOptional() @IsBoolean() student?: boolean;
  @IsOptional() @IsBoolean() guardian?: boolean;
  @IsOptional() @IsBoolean() placement?: boolean;
}

@Controller('admin/scores')
@Roles('admin', 'hr')
export class ScoresController {
  constructor(private readonly scores: ScoresService) {}

  /** GET /admin/scores?period=&studentId= — 성적표 목록. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('period') period?: string, @Query('studentId') studentId?: string) {
    return this.scores.list(user, period, studentId);
  }

  /** GET /admin/scores/periods — 기간 목록(필터). */
  @Get('periods')
  periods(@CurrentUser() user: AuthUser) {
    return this.scores.periods(user);
  }

  /** GET /admin/scores/missing?period= — 미업로드 학생. */
  @Get('missing')
  missing(@CurrentUser() user: AuthUser, @Query('period') period: string) {
    return this.scores.missing(user, period);
  }

  /** GET /admin/scores/stats?period= — 성적 통계(대시보드). */
  @Get('stats')
  stats(@CurrentUser() user: AuthUser, @Query('period') period?: string) {
    return this.scores.statistics(user, period);
  }

  /** GET /admin/scores/trend?studentLoginId= — 성적 추이 + 배치 라인 변화. */
  @Get('trend')
  trend(@CurrentUser() user: AuthUser, @Query('studentLoginId') studentLoginId: string) {
    return this.scores.trend(user, studentLoginId);
  }

  /** POST /admin/scores/estimate-placements — 데모 배치 추정(기간 일괄). */
  @Post('estimate-placements')
  estimate(@CurrentUser() user: AuthUser, @Body('period') period: string) {
    return this.scores.estimatePlacements(user, period);
  }

  /** POST /admin/scores/:id/placement — 배치 라인 저장(외부 배치표 서비스/관리자). */
  @Post(':id/placement')
  placement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PlacementDto) {
    return this.scores.setPlacement(user, id, { ...dto });
  }

  /** POST /admin/scores/goal — 학생 목표(대학 라인/평균) 설정. */
  @Post('goal')
  goal(@CurrentUser() user: AuthUser, @Body() dto: GoalDto) {
    return this.scores.setGoal(user, dto.studentLoginId, dto.tier ?? null, dto.avg ?? null);
  }

  /** GET /admin/scores/export?period= — 성적 CSV 내보내기. */
  @Get('export')
  async exportCsv(@CurrentUser() user: AuthUser, @Res() res: Response, @Query('period') period?: string) {
    const csv = await this.scores.exportCsv(user, period);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    // 파일명은 ASCII(헤더 제약), 한글 기간은 RFC5987 filename* 로 전달
    const fn = encodeURIComponent(`scores-${period ?? 'all'}.csv`);
    res.setHeader('Content-Disposition', `attachment; filename="scores.csv"; filename*=UTF-8''${fn}`);
    res.send(csv);
  }

  /** GET /admin/scores/template — 업로드용 엑셀 템플릿 다운로드. */
  @Get('template')
  template(@Res() res: Response) {
    const buf = this.scores.template();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="score-template.xlsx"');
    res.send(buf);
  }

  /** POST /admin/scores/manual — 수동 입력. */
  @Post('manual')
  manual(@CurrentUser() user: AuthUser, @Body() dto: ManualScoreDto) {
    return this.scores.createManual(user, dto);
  }

  /** POST /admin/scores/excel — 엑셀 일괄 업로드. */
  @Post('excel')
  @UseInterceptors(FileInterceptor('file'))
  excel(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedFileLike) {
    return this.scores.bulkExcel(user, file.buffer);
  }

  /** POST /admin/scores/ocr — 성적표 이미지 OCR(프리필). */
  @Post('ocr')
  ocr(@CurrentUser() user: AuthUser, @Body() dto: OcrDto) {
    return this.scores.ocr(user, dto.fileId);
  }

  /** GET /admin/scores/policy — 노출 정책 조회(관리자/HR). */
  @Get('policy')
  getPolicy() {
    return this.scores.getScorePolicy();
  }

  /** PUT /admin/scores/policy — 노출 정책 변경(본사 마스터만, 서비스에서 가드). */
  @Put('policy')
  setPolicy(@CurrentUser() user: AuthUser, @Body() dto: ScorePolicyDto) {
    return this.scores.setScorePolicy(user, dto);
  }
}

/** 학생·학부모용 성적 조회(정책 게이트). */
@Controller()
export class ScoresMeController {
  constructor(private readonly scores: ScoresService) {}

  /** GET /me/scores/access — 성적 탭 노출 여부(학생·학부모). */
  @Get('me/scores/access')
  @Roles('student', 'guardian')
  access(@CurrentUser() user: AuthUser) {
    return this.scores.access(user);
  }

  /** GET /me/scores/trend — 학생 본인 성적·배치 추이. */
  @Get('me/scores/trend')
  @Roles('student')
  selfTrend(@CurrentUser() user: AuthUser) {
    return this.scores.selfTrend(user);
  }

  /** GET /guardian/scores/trend?studentId= — 학부모 자녀 성적·배치 추이. */
  @Get('guardian/scores/trend')
  @Roles('guardian')
  guardianTrend(@CurrentUser() user: AuthUser, @Query('studentId') studentId: string) {
    return this.scores.guardianTrend(user, studentId);
  }

  /** GET /teacher/scores/trend?studentId= — 선생님(같은 센터) 학생 추이. */
  @Get('teacher/scores/trend')
  @Roles('teacher')
  teacherTrend(@CurrentUser() user: AuthUser, @Query('studentId') studentId: string) {
    return this.scores.teacherTrend(user, studentId);
  }
}
