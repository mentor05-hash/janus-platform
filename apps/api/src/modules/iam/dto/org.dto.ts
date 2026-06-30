import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { IsStrongPassword } from './strong-password.validator';

/** 센터 생성 (POST /centers) — 본사 이상. */
export class CreateCenterDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  region?: string;
}

/** 관리자(직원) 계정 생성 (POST /admin/staff). L2 생성은 마스터만, L3 생성은 본사 이상. */
export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  loginId!: string;

  @IsString()
  @IsStrongPassword()
  password!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(['L2', 'L3'])
  permLevel!: 'L2' | 'L3';

  /** L3(센터관리자)는 필수. L2(본사)는 전사라 불필요. */
  @IsOptional()
  @IsUUID()
  centerId?: string;
}
