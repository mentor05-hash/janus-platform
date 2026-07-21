import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** 학원찾기 검색 쿼리 — 세션 1 범위(과목·행정동·이름). 정렬·레벨 정밀필터는 세션 2. */
export class AcademySearchDto {
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

  /** 과목 필터(해당 과목 반이 있는 학원). */
  @IsOptional()
  @IsString()
  subject?: string;

  /** 반 레벨 필터. basic|regular|advanced|prep */
  @IsOptional()
  @IsString()
  level?: string;

  /** 내 행정동 코드 — "우리 동네 경유" 버스 배지 매칭(§5). 좌표 미전송. */
  @IsOptional()
  @IsString()
  dong?: string;

  /** 이름 부분검색. */
  @IsOptional()
  @IsString()
  q?: string;
}
