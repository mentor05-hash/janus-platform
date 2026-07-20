import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

class FeaturesDto {
  @IsOptional() @IsBoolean() chat?: boolean;
  @IsOptional() @IsBoolean() whiteboard?: boolean;
  @IsOptional() @IsBoolean() voice?: boolean;
}

class ParticipantDto {
  @IsOptional() @IsString() @MaxLength(200) extUserId?: string;
  @IsOptional() @IsString() @MaxLength(200) displayName?: string;
  @IsOptional() @IsString() @MaxLength(60) role?: string;
}

/** 룸 생성 요청 — 전역 ValidationPipe(whitelist)로 검증. opensAt/closesAt 상호검증은 컨트롤러에서. */
export class CreateRoomDto {
  @IsOptional() @IsString() @MaxLength(200) externalRef?: string;
  @IsOptional() @ValidateNested() @Type(() => FeaturesDto) features?: FeaturesDto;
  @IsOptional() @IsISO8601() opensAt?: string;
  @IsOptional() @IsISO8601() closesAt?: string;
  @IsOptional() @IsInt() @Min(60) tokenTtlSec?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
  @IsOptional() @IsIn(['session', 'lecture']) mode?: string; // lecture=1:다 강의(host만 판서)
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => ParticipantDto) participants!: ParticipantDto[];
}

/** 시간창·정책 메타 갱신 — null 은 해당 경계 해제, 생략은 유지. metadata 는 병합. */
export class UpdateWindowDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601() opensAt?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601() closesAt?: string | null;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class MintTokenDto {
  @IsString() participantId!: string;
  @IsOptional() @IsInt() @Min(60) ttlSec?: number;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
}

// 룸에 참가자 동적 추가(강의실 학생 입장) — 참가자 생성 + 토큰 발급.
export class AddParticipantDto {
  @IsOptional() @IsString() @MaxLength(200) extUserId?: string;
  @IsOptional() @IsString() @MaxLength(200) displayName?: string;
  @IsOptional() @IsString() @MaxLength(60) role?: string;
  @IsOptional() @IsInt() @Min(60) ttlSec?: number;
}
