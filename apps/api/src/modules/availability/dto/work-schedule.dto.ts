import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, Min } from 'class-validator';

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
