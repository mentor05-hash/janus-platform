import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/** Q&A 질문 첨부(이미지 등). 한 문항 기준 최대 3장. */
export class QnaAttachmentDto {
  @IsUUID() id!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() type?: string;
}

/** POST /qna/posts — 질문 등록(학생). 게시판 건당 과금(§5-2). */
export class CreateQuestionDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() difficulty?: string;

  @IsIn(['open', 'assigned'])
  scope!: 'open' | 'assigned';

  /** scope=assigned 일 때 지정 교사. */
  @IsOptional() @IsUUID() assignedTeacherId?: string;

  @IsString() @IsNotEmpty() body!: string;

  /** 과금 단가 구분: 문항(item) ≥ 일반(general). */
  @IsOptional() @IsIn(['item', 'general']) qType?: 'item' | 'general';

  /** 이미지 등 첨부 — 한 문항 기준 최대 3장. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => QnaAttachmentDto)
  attachments?: QnaAttachmentDto[];
}

/** POST /qna/posts/{id}/answers — 답변(교사). 첨부 = 화이트보드 풀이 PNG 등(P4, 최대 3장). */
export class CreateAnswerDto {
  @IsString() @IsNotEmpty() body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => QnaAttachmentDto)
  attachments?: QnaAttachmentDto[];
}
