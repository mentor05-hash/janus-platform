import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { LectureService } from './lecture.service';

@Controller('lectures')
export class LectureController {
  constructor(private readonly lectures: LectureService) {}

  /** GET /lectures?subject= — 강좌 카탈로그(로그인 학생). */
  @Get()
  @Roles('student')
  catalog(@CurrentUser() user: AuthUser, @Query('subject') subject?: string) {
    return this.lectures.catalog(user, subject || undefined);
  }

  /** GET /lectures/me — 내 수강 목록(학생). */
  @Get('me')
  @Roles('student')
  mine(@CurrentUser() user: AuthUser) {
    return this.lectures.myEnrollments(user);
  }

  /** POST /lectures/:id/enroll — 수강신청(학생). */
  @Post(':id/enroll')
  @Roles('student')
  enroll(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.lectures.enroll(user, id);
  }
}
