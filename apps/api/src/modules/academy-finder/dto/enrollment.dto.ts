import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** 재원 표시 + 통계 활용 동의. 동의는 "익명 통계로만, 개인 식별 정보 미제공"(§4). */
export class EnrollmentDto {
  @IsString()
  academyId!: string;

  /** 통계 활용 동의(true 여야 verified 집계 대상). */
  @IsBoolean()
  consentStats!: boolean;

  /** 출신학교 자기신고(선택) — school_dist 집계용. k-익명 처리 후에만 노출. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  school?: string;
}
