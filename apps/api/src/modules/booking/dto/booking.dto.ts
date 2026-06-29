import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { ConsultMode, ConsultType, SessionMode } from '../../../config/enums';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 요금 견적 (POST /bookings/quote). slotStart/End 는 10분 슬롯 인덱스. */
export class QuoteDto {
  @IsUUID()
  teacherId!: string;

  @Matches(DATE_RE, { message: 'date 는 YYYY-MM-DD 형식이어야 합니다.' })
  date!: string;

  @IsIn(['board', 'chat', 'zoom', 'hand', 'offline'])
  mode!: ConsultMode;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  slotStart!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  slotEnd!: number;
}

/** 예약 생성 (POST /bookings). */
export class BookingCreateDto {
  @IsUUID()
  teacherId!: string;

  @Matches(DATE_RE, { message: 'date 는 YYYY-MM-DD 형식이어야 합니다.' })
  date!: string;

  @IsIn(['담임', '교과', '입시', '심리'])
  consultType!: ConsultType;

  @IsOptional()
  @IsString()
  subType?: string;

  @IsIn(['board', 'chat', 'zoom', 'hand', 'offline'])
  mode!: ConsultMode;

  @IsOptional()
  @IsIn(['상담', '질문'])
  sessionMode?: SessionMode;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  slotStart!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  slotEnd!: number;

  @IsOptional()
  @IsString()
  content?: string;
}
