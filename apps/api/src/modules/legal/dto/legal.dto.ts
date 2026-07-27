import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class ConsentDto {
  @IsBoolean() termsAgreed!: boolean;
  @IsBoolean() privacyAgreed!: boolean;
  @IsOptional() @IsBoolean() marketingAgreed?: boolean;
  @IsOptional() @IsBoolean() isMinor?: boolean;
  // 미성년일 때 보호자 정보 필수
  @ValidateIf((o) => o.isMinor)
  @IsString()
  @MaxLength(40)
  guardianName?: string;
  @ValidateIf((o) => o.isMinor)
  @IsString()
  @MaxLength(40)
  guardianContact?: string;
}

export class WithdrawDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
