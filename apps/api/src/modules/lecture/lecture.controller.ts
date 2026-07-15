import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { LectureService } from './lecture.service';

class CreateLectureDto {
  @IsString() @MaxLength(20) subject!: string;
  @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @IsString() @MaxLength(80) title!: string;
  @IsOptional() @IsString() @MaxLength(300) summary?: string;
  @IsOptional() @IsString() @MaxLength(10) level?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) minutes?: number;
}
class ActiveDto { @IsBoolean() active!: boolean; }
class ProgressDto { @IsInt() @Min(0) @Max(100) progress!: number; }

@Controller('lectures')
export class LectureController {
  constructor(private readonly lectures: LectureService) {}

  /** POST /lectures — 강좌 등록(교사). */
  @Post()
  @Roles('teacher')
  create(@Body() dto: CreateLectureDto, @CurrentUser() user: AuthUser) {
    return this.lectures.create(user, dto);
  }

  /** GET /lectures/mine — 내가 등록한 강좌(교사·수강인원). */
  @Get('mine')
  @Roles('teacher')
  teacherLectures(@CurrentUser() user: AuthUser) {
    return this.lectures.teacherLectures(user);
  }

  /** PATCH /lectures/:id/active — 강좌 활성 토글(교사). */
  @Patch(':id/active')
  @Roles('teacher')
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActiveDto, @CurrentUser() user: AuthUser) {
    return this.lectures.setActive(user, id, dto.active);
  }

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

  /** PATCH /lectures/:id/progress — 수강 진도 저장(학생). */
  @Patch(':id/progress')
  @Roles('student')
  progress(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProgressDto, @CurrentUser() user: AuthUser) {
    return this.lectures.updateProgress(user, id, dto.progress);
  }

  /** GET /lectures/:id — 강좌 상세+내 진도(학생). 정적 라우트 뒤에 선언. */
  @Get(':id')
  @Roles('student')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.lectures.detail(user, id);
  }
}
