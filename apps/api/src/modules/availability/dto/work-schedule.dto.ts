import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Matches,
  Min,
} from 'class-validator';

/** 사유 제외(연차/반차/병가) 등록. */
export class LeaveDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date 형식은 YYYY-MM-DD' })
  date!: string;

  @IsIn(['연차', '반차', '병가'])
  type!: '연차' | '반차' | '병가';
}

export class OfflineAvailabilityDto {
  @IsBoolean()
  enabled!: boolean;

  /** 오프라인 가능 시간대 [{day, start, end}] 등. */
  @IsOptional()
  @IsArray()
  timeWindows?: unknown[];
}

export class WorkScheduleDto {
  @IsOptional()
  @IsObject()
  recurringTemplate?: Record<string, { start: string; end: string }[]>;

  @IsOptional()
  @IsArray()
  weeklyOverrides?: unknown[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  preBookHorizonDays?: number;
}
