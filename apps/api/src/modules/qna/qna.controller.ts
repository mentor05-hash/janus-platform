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
  @Get('posts')
  list(@CurrentUser() user: AuthUser) {
    return this.qna.listPosts(user);
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
