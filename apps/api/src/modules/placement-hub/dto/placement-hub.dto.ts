import { IsString, Matches, MaxLength } from 'class-validator';

export class HubTicketDto {
  /** manifest 의 slug — 영숫자·하이픈만 */
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;
}
