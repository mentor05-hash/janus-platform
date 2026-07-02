import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** 대시보드 노출 정책(본사 마스터). 부분 업데이트 허용. */
export class DashVisibilityDto {
  @IsOptional() @IsBoolean() teacherEnabled?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) centerAdminTabs?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) teacherTabs?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) disabledCenters?: string[];
}

/** 평가 가중치 조정(합계 100 은 서비스에서 검증). centerId 부재/null = 전사 기본. */
export class UpdateWeightsDto {
  @IsOptional()
  @IsUUID()
  centerId?: string | null;

  @IsInt() @Min(0) @Max(100) w_total!: number;
  @IsInt() @Min(0) @Max(100) w_completion!: number;
  @IsInt() @Min(0) @Max(100) w_rerequest!: number;
  @IsInt() @Min(0) @Max(100) w_reject!: number;
  @IsInt() @Min(0) @Max(100) w_noshow!: number;
  @IsInt() @Min(0) @Max(100) w_response!: number;
  @IsInt() @Min(0) @Max(100) w_satisfaction!: number;
}

/** 월별 근무시수 입력. */
export class MonthlyHoursDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'yearMonth 형식은 YYYY-MM' })
  yearMonth!: string;

  @IsNumber() @Min(0) @Max(744) hours!: number; // 한 달 최대 시간
}

/** 원장/부원장 지정(또는 해제). */
export class DirectorDto {
  @IsOptional()
  @IsIn(['원장', '부원장'])
  directorRole?: '원장' | '부원장' | null;
}

export type Period = 'all' | 'date' | '1w' | '2w' | '1m' | 'custom';
export type PivotView =
  | 'center'
  | 'teacher-in-center'
  | 'teacher-x-center'
  | 'teacher-monthly'
  | 'center-monthly';
