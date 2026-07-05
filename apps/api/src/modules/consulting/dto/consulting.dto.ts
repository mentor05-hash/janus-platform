import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { ConsultingPackage } from '../domain/status';

// 신청 생성 — 개인정보 동의(agree=true) 필수. applicant_name/phone은 서버에서 저장(PII).
export class CreateApplicationDto {
  @IsString()
  @MaxLength(40)
  applicantName!: string;

  @Matches(/^[0-9\-+\s()]{7,20}$/, { message: 'applicantPhone 형식이 올바르지 않습니다.' })
  applicantPhone!: string;

  @IsIn(['고1', '고2', '고3', 'N수', '기타'])
  studentGrade!: string;

  @IsIn(['susi', 'jeongsi', 'both', 'essay'])
  interestType!: string;

  @IsIn(['single', 'season', 'full'])
  package!: ConsultingPackage;

  @IsBoolean()
  agree!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

// 자료 업로드 — 파일은 multipart(file), 이 DTO는 자료 종류만.
export class UploadDocumentDto {
  @IsIn(['student_record', 'transcript', 'mock_exam', 'other'])
  type!: string;
}

// 결제 생성 — 고정가 상품은 amountWon 생략(기본가), full(맞춤 견적)은 필수.
export class CreatePaymentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountWon?: number;
}

// 컨설턴트 배정 — teacher 계정 id.
export class AssignConsultantDto {
  @IsUUID()
  consultantId!: string;
}
