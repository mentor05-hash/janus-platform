import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  Min,
} from 'class-validator';

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
