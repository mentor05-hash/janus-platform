import { IsUUID } from 'class-validator';

/** POST /subscription/subscribe — 구독 플랜 가입. */
export class SubscribeDto {
  @IsUUID()
  planId!: string;
}
