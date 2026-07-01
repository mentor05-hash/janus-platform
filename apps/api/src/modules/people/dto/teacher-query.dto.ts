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

  /** 이름·과목 검색어. */
  @IsOptional()
  @IsString()
  q?: string;

  /** 정렬: rating(만족도)·consult(상담수)·question(질문수)·offline(오프라인 가능)·grade(기본). */
  @IsOptional()
  @IsIn(['rating', 'consult', 'question', 'offline', 'grade'])
  sort?: string;

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
