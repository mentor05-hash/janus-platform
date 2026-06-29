import { IsIn, IsOptional, IsString } from 'class-validator';
import { ConsultType } from '../../../config/enums';

/** POST /match/auto — 30분 자동매칭 요청. */
export class MatchAutoDto {
  @IsIn(['담임', '교과', '입시', '심리'])
  consultType!: ConsultType;

  @IsOptional()
  @IsString()
  subType?: string;

  @IsIn(['online', 'offline', 'any'])
  mode!: 'online' | 'offline' | 'any';
}
