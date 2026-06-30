import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** POST /me/teacher-lists — 분류(fit/unfit). */
export class ClassifyDto {
  @IsUUID()
  teacherId!: string;

  @IsIn(['fit', 'unfit'])
  listKind!: 'fit' | 'unfit';
}

/** POST /bookings/{id}/review — 완료 상담 평가(1~5). */
export class ReviewDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) ratingAttitude!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) ratingContent!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) ratingSkill!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) ratingAgain!: number;

  @IsOptional() @IsString() text?: string;

  /** 완료 확인 / 미진행(no-show) 신고 — 스펙 Review 정합. */
  @IsOptional() @IsBoolean() doneConfirmed?: boolean;
  @IsOptional() @IsBoolean() reported?: boolean;
}
