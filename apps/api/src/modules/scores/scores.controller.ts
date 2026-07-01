import { Body, Controller, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
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
}
