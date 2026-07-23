import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 차단 통계 조회 — 기간 필터(선택). */
export class BlockStatsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** 이의 신고 접수(사용자) — 사유 코드 + 본인 문장(note). 파일 미첨부(무취급). */
export class CreateAppealDto {
  @IsString()
  @MaxLength(32)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  surface?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** 이의 상태 갱신(관리자). */
export class UpdateAppealDto {
  @IsIn(['open', 'reviewing', 'resolved', 'rejected'])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}

/** 이의 큐 목록(관리자) — 상태 필터 + 페이지네이션. */
export class AppealListQueryDto {
  @IsOptional()
  @IsIn(['open', 'reviewing', 'resolved', 'rejected'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size?: number;
}

/** 컨설팅 업로드 토글 설정(관리자·본사 마스터). */
export class SetConsultingToggleDto {
  @IsBoolean()
  enabled!: boolean;
}
