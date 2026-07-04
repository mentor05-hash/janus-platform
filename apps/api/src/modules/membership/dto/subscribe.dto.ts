import { IsUUID } from 'class-validator';

/** POST /subscription/subscribe — 구독 플랜 가입. */
export class SubscribeDto {
  @IsUUID()
  planId!: string;
}

/** POST /subscription/subscribe-for-child — 학부모가 자녀 대신 구독. */
export class SubscribeForChildDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  planId!: string;
}
