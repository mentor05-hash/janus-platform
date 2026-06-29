import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { AccountRole } from '../../../config/enums';
import { IsStrongPassword } from './strong-password.validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  loginId!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /** 다중 센터 소속 시 로그인할 센터 선택(선택). */
  @IsOptional()
  @IsUUID()
  centerId?: string;
}

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  loginId!: string;

  @IsString()
  @IsStrongPassword() // §10 비밀번호 정책
  password!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(['student', 'teacher', 'guardian'])
  role!: Extract<AccountRole, 'student' | 'teacher' | 'guardian'>;

  @IsOptional()
  @IsUUID()
  centerId?: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
