import {
  Body,
  Controller,
  Patch,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PeopleService } from './people.service';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import {
  RecommendDto,
  UpdateTeacherProfileDto,
} from './dto/teacher-profile.dto';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly people: PeopleService) {}

  /** GET /teachers — 검색 목록(필터·페이지네이션). 인증된 사용자 누구나. 외부학생은 온라인 선생님만 노출(정책). */
  @Get()
  list(@Query() q: TeacherQueryDto, @CurrentUser() user: AuthUser) {
    return this.people.listTeachers(q, user);
  }

  /** GET /teachers/leaderboard — 이달의 우수 선생님 랭킹(센터 스코프). */
  @Get('leaderboard')
  leaderboard(@CurrentUser() user: AuthUser) {
    return this.people.leaderboard(user.centerId ?? null);
  }

  /** GET /teachers/me/profile — 내 프로필(선생님 편집용). */
  @Get('me/profile')
  @Roles('teacher')
  myProfile(@CurrentUser() user: AuthUser) {
    return this.people.getTeacher(user.id);
  }

  /** PUT /teachers/me/profile — 내 프로필 편집(소개·강점·과목·경력). */
  @Put('me/profile')
  @Roles('teacher')
  updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTeacherProfileDto,
  ) {
    return this.people.updateMyProfile(user.id, dto);
  }

  /** PATCH /teachers/me/status — 근무 상태 변경(on/rest/off). */
  @Patch('me/status')
  @Roles('teacher')
  setStatus(@CurrentUser() user: AuthUser, @Body() dto: { status: string }) {
    return this.people.setWorkStatus(user.id, dto.status);
  }

  /** PATCH /teachers/:id/verify-achievements — 관리자·HR: 목표대학 실적 검증 배지 토글. */
  @Patch(':id/verify-achievements')
  @Roles('admin', 'hr')
  verifyAchievements(@Param('id') id: string, @Body() dto: { verified: boolean }) {
    return this.people.setAchievementsVerified(id, dto.verified === true);
  }

  /** POST /teachers/recommend — 니즈 기반 맞춤 추천(학생). */
  @Post('recommend')
  @Roles('student')
  recommend(@CurrentUser() user: AuthUser, @Body() dto: RecommendDto) {
    return this.people.recommend(user.id, user.centerId ?? null, dto);
  }

  /** GET /teachers/{id} — 선생님 상세. */
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.people.getTeacher(id);
  }
}
