import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** 선생님 본인 프로필 편집. */
export class UpdateTeacherProfileDto {
  @IsOptional() @IsString() @MaxLength(1000) intro?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) strengths?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) subjects?: string[];
  @IsOptional() @IsString() career?: string;
  @IsOptional() @IsString() category?: string;
  /** 제공 상담 방식(줌·채팅·필기·오프라인). */
  @IsOptional() @IsArray() @IsIn(['zoom', 'chat', 'hand', 'offline'], { each: true }) modes?: string[];
  /** Q&A 후 "이어서 상담" 제공 여부(옵트아웃 가능). */
  @IsOptional() @IsBoolean() qnaEscalation?: boolean;
}

/** 니즈 기반 추천 요청(학생). */
export class RecommendDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) needs?: string[];
}
