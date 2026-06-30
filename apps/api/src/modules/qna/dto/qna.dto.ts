import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

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
}

/** POST /qna/posts/{id}/answers — 답변(교사). */
export class CreateAnswerDto {
  @IsString() @IsNotEmpty() body!: string;
}
