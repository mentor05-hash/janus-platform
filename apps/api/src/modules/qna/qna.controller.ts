import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { QnaService } from './qna.service';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qna.dto';

@Controller('qna')
export class QnaController {
  constructor(private readonly qna: QnaService) {}

  /** POST /qna/posts — 질문 등록(학생, 건당 과금). */
  @Post('posts')
  @Roles('student')
  create(@Body() dto: CreateQuestionDto, @CurrentUser() user: AuthUser) {
    return this.qna.createQuestion(user, dto);
  }

  /** GET /qna/posts — 역할별 목록. */
  /** GET /qna/pricing — 질문 건당 요금(문항/일반) 안내(학생). 난이도별 답변블록 시간은 /bookings/question-duration/policy. */
  @Get('pricing')
  @Roles('student')
  pricing(@CurrentUser() user: AuthUser) {
    return this.qna.pricingInfo(user.centerId ?? null);
  }

  @Get('posts')
  list(@CurrentUser() user: AuthUser) {
    return this.qna.listPosts(user);
  }

  /** POST /qna/posts/{id}/claim — 공개질문 가져오기(교사, 선착순 배정). */
  @Post('posts/:id/claim')
  @Roles('teacher')
  claim(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.qna.claim(id, user);
  }

  /** POST /qna/posts/{id}/answers — 답변(교사, §5-9 게이트). */
  @Post('posts/:id/answers')
  @Roles('teacher')
  answer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAnswerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.qna.answer(id, dto, user);
  }

  /** PATCH /qna/answers/{id}/accept — 답변 채택(질문 학생). */
  @Patch('answers/:id/accept')
  @Roles('student')
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.qna.acceptAnswer(id, user);
  }
}
