import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/** POST /reports — 신고 등록. */
export class CreateReportDto {
  @IsString() @IsNotEmpty() targetType!: string; // teacher / student / booking / qna ...
  @IsOptional() @IsUUID() targetId?: string;
  @IsString() @IsNotEmpty() reason!: string;
}

/** PATCH /reports/{id} — 관리자 처리. */
export class HandleReportDto {
  @IsIn(['reviewing', 'resolved', 'dismissed'])
  status!: 'reviewing' | 'resolved' | 'dismissed';

  @IsOptional() @IsString() action?: string;
}

/** POST /teacher-blocks — 교사 차단. */
export class BlockDto {
  @IsUUID() teacherId!: string;
}
