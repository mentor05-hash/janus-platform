import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** CSV 일괄 등록 행(학생). loginId·name 필수, password 없으면 임시 발급. */
export class BulkStudentRow {
  @IsString() loginId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() schoolGrade?: string;
}
export class BulkStudentsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkStudentRow)
  students!: BulkStudentRow[];
}

/** 외부 시스템 명부 동기화(HR). source 명 + 레코드 upsert(있으면 갱신, 없으면 생성). */
export class ExternalStudentRow {
  @IsString() loginId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() schoolGrade?: string;
}
export class ImportExternalDto {
  @IsString() source!: string; // 외부 시스템/앱 이름
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ExternalStudentRow)
  records!: ExternalStudentRow[];
}

/** HR 선생님 등록. 계정(pending) + teacher_profile 생성. */
export class CreateTeacherDto {
  @IsString() loginId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() password?: string;
  @IsArray() @IsString({ each: true }) subjects!: string[];
  @IsIn(['S', 'A', 'B']) grade!: 'S' | 'A' | 'B';
  @IsOptional() @IsString() category?: string; // 직군(교과 코치·명문대 멘토·입시 소장)
  @IsOptional() @IsString() career?: string;
}

/** 직원 권한 변경. */
export class StaffPermDto {
  @IsIn(['L1', 'L2', 'L3']) permLevel!: 'L1' | 'L2' | 'L3';
}

/** 분류 한도 저장(HR). */
export class HrLimitsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) classifyFitLimit?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  classifyUnfitLimit?: number;
}

/** 회원 등급 편집(HR): 주간 부여 크레딧 + 활성. */
export class UpdateGradeDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) weeklyCredits?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
