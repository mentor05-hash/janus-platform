import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** 본인확인 요청 — 휴대폰·생년월일은 검증 후 미저장(마스킹 참조만 남김). */
export class GuardianVerifyDto {
  @IsString()
  studentId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(['phone', 'ipin', 'cert', 'manual'])
  method!: 'phone' | 'ipin' | 'cert' | 'manual';

  @IsOptional()
  @IsString()
  birth?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

/** 데이터 전달 동의 부여/철회 대상. */
export class GuardianConsentDto {
  @IsString()
  studentId!: string;
}

/** 학생 본인의 보호자 공유 동의 대상(O105) — 성인 학생 전용 게이트. */
export class ShareConsentDto {
  @IsUUID()
  guardianId!: string;
}
