import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/** PUT /admin/zoom-policy — 동시 줌 한도 + 요일×시간 허용/차단 맵. */
export class SetZoomPolicyDto {
  @Type(() => Number) @IsInt() @Min(0) concurrentLimit!: number;
  @IsOptional() allowMap?: Record<string, boolean>; // "weekday-hour" → false=차단
}

/** POST /admin/rooms — 상담실 등록. */
export class CreateRoomDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsString() operatingHours?: string;
  @IsOptional() @IsString() setting?: string; // 수동/자동
}

/** PUT /admin/rooms/:id — 상담실 수정(유형·수용·운영시간·설정·상태). */
export class UpdateRoomDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsString() operatingHours?: string;
  @IsOptional() @IsIn(['auto', 'manual']) setting?: string;
  @IsOptional() @IsIn(['available', 'inuse', 'closed']) status?: string;
}

/** POST /admin/blocked-times — 차단 시간(원장상담/특강/모의고사 등). */
export class CreateBlockedTimeDto {
  @IsOptional() @IsString() type?: string;
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsOptional() @IsString() scope?: string;
}
