import { IsString, MaxLength, MinLength } from 'class-validator';

export class GatewayInterpretDto {
  /** 자유서술 한 줄 — "무엇을 준비하고 있나요?" */
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  q!: string;
}
