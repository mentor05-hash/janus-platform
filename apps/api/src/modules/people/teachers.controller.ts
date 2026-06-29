import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PeopleService } from './people.service';
import { TeacherQueryDto } from './dto/teacher-query.dto';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly people: PeopleService) {}

  /** GET /teachers — 검색 목록(필터·페이지네이션). 인증된 사용자 누구나. */
  @Get()
  list(@Query() q: TeacherQueryDto) {
    return this.people.listTeachers(q);
  }

  /** GET /teachers/{id} — 선생님 상세. */
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.people.getTeacher(id);
  }
}
