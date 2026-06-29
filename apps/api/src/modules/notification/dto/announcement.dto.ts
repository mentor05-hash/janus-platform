import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

const ROLE = ['teacher', 'student', 'guardian'] as const;
const CH = ['app', 'sms', 'kakao'] as const;

/**
 * 공지 알림 발송 (POST /admin/announcements).
 * templateId 지정 시 템플릿 내용을 기본값으로 사용(미지정 필드는 템플릿에서 채움).
 * scheduledAt 지정 시 즉시 발송 대신 예약.
 */
export class AnnouncementDto {
  // templateId 가 있으면 targets/title/body 는 템플릿에서 채울 수 있으므로 선택.
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ROLE, { each: true })
  targets?: ('teacher' | 'student' | 'guardian')[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  body?: string;

  /** 저장된 템플릿으로부터 내용 채우기. */
  @IsOptional()
  @IsUUID()
  templateId?: string;

  /** HQ 가 특정 센터로 한정할 때(센터관리자는 무시 — 자기 센터 강제). */
  @IsOptional()
  @IsUUID()
  centerId?: string;

  /** 발송 채널(기본 in-app). */
  @IsOptional()
  @IsArray()
  @IsIn(CH, { each: true })
  channels?: ('app' | 'sms' | 'kakao')[];

  /** 예약 발송 시각(ISO8601). 지정 시 예약 등록. */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}

/** 공지 템플릿 저장 (POST /admin/announcement-templates). */
export class AnnouncementTemplateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ROLE, { each: true })
  targets!: ('teacher' | 'student' | 'guardian')[];

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsArray()
  @IsIn(CH, { each: true })
  channels?: ('app' | 'sms' | 'kakao')[];
}
