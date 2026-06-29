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
import { BookingStatus, CancelRoute, ConsultMode, ConsultType, SessionMode } from '../../../config/enums';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 요금 견적 (POST /bookings/quote). slotStart/End 는 10분 슬롯 인덱스. */
export class QuoteDto {
  @IsUUID()
  teacherId!: string;

  @Matches(DATE_RE, { message: 'date 는 YYYY-MM-DD 형식이어야 합니다.' })
  date!: string;

  @IsIn(['board', 'chat', 'zoom', 'hand', 'offline'])
  mode!: ConsultMode;

  // 입시 유료컨설팅 등 유형별 가산 단가 견적 반영(선택). 미지정 시 기본 시간제 요금.
  @IsOptional()
  @IsIn(['담임', '교과', '입시', '심리'])
  consultType?: ConsultType;

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

/** 예약 목록 쿼리 (GET /bookings). 잘못된 값은 400(Prisma 500 방지). */
export class BookingListQueryDto {
  @IsOptional()
  @IsIn(['student', 'teacher'])
  role?: 'student' | 'teacher';

  @IsOptional()
  @IsIn(['new', 'confirmed', 'done', 'cancelled', 'rejected', 'noshow'])
  status?: BookingStatus;
}

/** 역상담 제안 (POST /bookings/reverse). 선생님 → 학생, 첫 상담 한정. */
export class ReverseProposeDto {
  @IsUUID()
  studentId!: string;

  @Matches(DATE_RE, { message: 'date 는 YYYY-MM-DD 형식이어야 합니다.' })
  date!: string;

  @IsIn(['담임', '교과', '입시', '심리'])
  consultType!: ConsultType;

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

  @IsOptional()
  @IsString()
  content?: string;
}

/** 역상담 응답 (PATCH /bookings/{id}/reverse-respond). 학생 수락/거절. */
export class ReverseRespondDto {
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject';
}

/** 취소 (POST /bookings/{id}/cancel). 선생님이 route 를 주면 사유 취소 4경로(§5-6). */
export class CancelDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsIn(['substitute', 'priority', 'admin_manual', 'rebook_notice'])
  route?: CancelRoute;
}
