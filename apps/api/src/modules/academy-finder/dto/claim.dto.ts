import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** 학원 클레임 신청(사업자 인증 자료 참조). */
export class ClaimSubmitDto {
  @IsString()
  academyId!: string;

  /** POST /files 로 업로드한 사업자등록증 파일 id(선택). */
  @IsOptional()
  @IsString()
  bizRegFileId?: string;

  /** 사업자등록번호(검증 후 마스킹 저장, 원본 미저장). */
  @IsOptional()
  @IsString()
  bizRegNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** 운영자 클레임 심사(승인/반려). */
export class ClaimReviewDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

class ScheduleSlotDto {
  @IsString() dow!: string;
  @IsString() start!: string;
  @IsString() end!: string;
}

/** 반 등록·수정(클레임 운영자). */
export class ClassUpsertDto {
  @IsString()
  subject!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetGrades?: string[];

  @IsOptional()
  @IsIn(['basic', 'regular', 'advanced', 'prep'])
  level?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedule?: ScheduleSlotDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tuitionKrw?: number;

  @IsOptional()
  @IsBoolean()
  entryTest?: boolean;
}

class BusStopDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seq?: number;

  @IsString()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  lng?: number;

  /** 운영자가 지정한 행정동(역산 우선순위). */
  @IsOptional()
  @IsString()
  dongCode?: string;

  @IsOptional()
  @IsString()
  timeHint?: string;
}

/** 버스 노선 등록·수정(정류장 포함, 전체 교체). */
export class BusRouteUpsertDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  days?: string[];

  @IsOptional()
  @IsIn(['pickup', 'dropoff'])
  direction?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusStopDto)
  stops?: BusStopDto[];
}

/** 자가 통계(cohort) 입력 — 미검증 라벨(claimed). */
export class CohortUpsertDto {
  @IsIn(['grade_band', 'school_dist'])
  kind!: 'grade_band' | 'school_dist';

  @IsString()
  period!: string;

  /** payload_json — %/집계만. 개별 식별 정보 금지(서버 검증 최소). */
  payload!: unknown;
}
