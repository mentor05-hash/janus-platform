import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** 학원찾기 검색 쿼리 — 세션 2: 과목·학년·레벨·통학·수강료·요일 필터 + §5 스코어 정렬. */
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
  @IsIn(['basic', 'regular', 'advanced', 'prep'])
  level?: string;

  /** 대상 학년 필터(target_grades 포함). 예: 고3, 중2, N수 */
  @IsOptional()
  @IsString()
  grade?: string;

  /** 수강료 상한(원) — 이 이하 반이 있는 학원만. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tuitionMax?: number;

  /** 요일 필터(schedule.dow 포함). 예: 월 */
  @IsOptional()
  @IsString()
  day?: string;

  /** 내 행정동 코드 — "우리 동네 경유" 버스 배지·통학 점수(§5). 좌표 미전송. */
  @IsOptional()
  @IsString()
  dong?: string;

  /** true 면 dong 경유 버스가 있는 학원만(하드 필터). dong 없으면 무시. */
  @IsOptional()
  @IsBooleanString()
  busOnly?: string;

  /** 이름 부분검색. */
  @IsOptional()
  @IsString()
  q?: string;

  /** 정렬: score(기본·§5 가중합) | tuition(대표 수강료 오름) | fresh(최신 갱신). */
  @IsOptional()
  @IsIn(['score', 'tuition', 'fresh'])
  sort?: 'score' | 'tuition' | 'fresh';
}
