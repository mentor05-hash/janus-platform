import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** POST /guardian/links — 자녀 연결 신청. */
export class GuardianLinkRequestDto {
  @IsString()
  @IsNotEmpty()
  studentLoginId!: string;

  // 자유 텍스트였다 — 이 값은 자녀의 승인 카드에 그대로 렌더되므로 신청자가 문구를 심을 수 있었다.
  // 웹·모바일 두 클라이언트 모두 아래 3개만 보내므로 좁혀도 잃는 것이 없다.
  @IsOptional()
  @IsIn(['부', '모', '기타'])
  relation?: string;
}

/** PATCH /guardian/links/{id}/respond — 학생/관리자의 승인·거절·해제. */
export class GuardianLinkRespondDto {
  @IsIn(['approve', 'reject', 'revoke'])
  action!: 'approve' | 'reject' | 'revoke';
}
