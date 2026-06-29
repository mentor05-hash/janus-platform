import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** POST /guardian/links — 자녀 연결 신청. */
export class GuardianLinkRequestDto {
  @IsString()
  @IsNotEmpty()
  studentLoginId!: string;

  @IsOptional()
  @IsString()
  relation?: string; // 부/모/기타
}

/** PATCH /guardian/links/{id}/respond — 학생/관리자의 승인·거절·해제. */
export class GuardianLinkRespondDto {
  @IsIn(['approve', 'reject', 'revoke'])
  action!: 'approve' | 'reject' | 'revoke';
}
