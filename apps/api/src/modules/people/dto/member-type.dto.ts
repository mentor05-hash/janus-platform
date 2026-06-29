import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { Type } from 'class-transformer';

/** 분류 추가 (POST /admin/member-types). */
export class CreateMemberTypeDto {
  @IsIn(['teacher', 'student'])
  kind!: 'teacher' | 'student';

  @Matches(/^[a-z0-9_]+$/, { message: 'code 는 영문 소문자/숫자/_ 만 허용합니다.' })
  code!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

/** 분류 배정 (PATCH /admin/teachers|students/{id}/type). */
export class SetMemberTypeDto {
  @IsString()
  @IsNotEmpty()
  typeCode!: string;
}
