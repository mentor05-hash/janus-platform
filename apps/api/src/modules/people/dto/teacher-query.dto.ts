import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TeacherGrade } from '../../../config/enums';

/** 선생님 검색/목록 쿼리 (CLAUDE.md §7 페이지네이션 + 검색 필터). */
export class TeacherQueryDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsIn(['S', 'A', 'B'])
  grade?: TeacherGrade;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size = 20;
}
