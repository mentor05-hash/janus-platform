import { IsIn, IsInt, IsOptional, IsPositive, IsUUID } from 'class-validator';

/** POST /payment-requests — 결제요청 생성. */
export class CreatePaymentRequestDto {
  @IsInt()
  @IsPositive()
  neededCredits!: number;

  /** 보호자 대납·관리자 발행 시 대상 학생. 학생 본인 생성 시 불필요. */
  @IsOptional()
  @IsUUID()
  studentId?: string;
}

/** PATCH /payment-requests/{id}/respond — 결제(대납)/거절. */
export class RespondPaymentRequestDto {
  @IsIn(['pay', 'reject'])
  action!: 'pay' | 'reject';
}
