import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * 공지 알림 발송 (POST /admin/announcements).
 * 관리자(센터/본사)가 대상 역할별로 일괄 공지. 센터관리자는 자기 센터로 자동 스코프,
 * 본사(HQ)는 전체 또는 centerId 지정.
 */
export class AnnouncementDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['teacher', 'student', 'guardian'], { each: true })
  targets!: ('teacher' | 'student' | 'guardian')[];

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  /** HQ 가 특정 센터로 한정할 때(센터관리자는 무시 — 자기 센터 강제). */
  @IsOptional()
  @IsUUID()
  centerId?: string;

  /** 발송 채널(기본 in-app). */
  @IsOptional()
  @IsArray()
  @IsIn(['app', 'sms', 'kakao'], { each: true })
  channels?: ('app' | 'sms' | 'kakao')[];
}
