import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * 상담 신청(리드) — 전달 정보는 "요약 + 동의 범위"만(§4). 개별 성적 상세는 전달하지 않는다.
 * 학생이 공유 항목을 선택(shareName/Grade/Goal) → 서버가 프로필에서 해당 값만 채운다.
 */
export class LeadSubmitDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  /** 연락처(학생이 직접 입력, 선택). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  contact?: string;

  @IsOptional()
  @IsBoolean()
  shareName?: boolean;

  @IsOptional()
  @IsBoolean()
  shareGrade?: boolean;

  @IsOptional()
  @IsBoolean()
  shareGoal?: boolean;

  /** 익명 세션 id(전환 계측용). PII 없음. */
  @IsOptional()
  @IsString()
  sessionId?: string;
}

/** 운영자 리드 처리(인박스 왕복). */
export class LeadReplyDto {
  @IsIn(['read', 'replied', 'closed'])
  status!: 'read' | 'replied' | 'closed';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reply?: string;
}
