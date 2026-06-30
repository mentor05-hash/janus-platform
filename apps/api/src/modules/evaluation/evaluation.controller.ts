import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EvaluationService } from './evaluation.service';
import { ClassifyDto, ReviewDto } from './dto/evaluation.dto';

@Controller()
export class EvaluationController {
  constructor(private readonly evaluation: EvaluationService) {}

  /** GET /me/teacher-lists — 내 fit/unfit 분류(학생). */
  @Get('me/teacher-lists')
  @Roles('student')
  myLists(@CurrentUser() user: AuthUser) {
    return this.evaluation.myLists(user);
  }

  /** POST /me/teacher-lists — 분류 추가(학생, §5-9 한쪽만·한도). */
  @Post('me/teacher-lists')
  @HttpCode(200)
  @Roles('student')
  classify(@Body() dto: ClassifyDto, @CurrentUser() user: AuthUser) {
    return this.evaluation.classify(user, dto);
  }

  /** DELETE /me/teacher-lists/{teacherId} — 분류 제거(학생). */
  @Delete('me/teacher-lists/:teacherId')
  @Roles('student')
  remove(
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.evaluation.removeClassification(user, teacherId);
  }

  /** POST /bookings/{id}/review — 완료 상담 평가(학생) → 교사 평점·등급 재산정. */
  @Post('bookings/:id/review')
  @Roles('student')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.evaluation.review(id, dto, user);
  }
}
