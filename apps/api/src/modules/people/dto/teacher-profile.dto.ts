import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** 선생님 본인 프로필 편집. */
export class UpdateTeacherProfileDto {
  @IsOptional() @IsString() @MaxLength(1000) intro?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) strengths?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) subjects?: string[];
  @IsOptional() @IsString() career?: string;
  @IsOptional() @IsString() category?: string;
}

/** 니즈 기반 추천 요청(학생). */
export class RecommendDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) needs?: string[];
}
