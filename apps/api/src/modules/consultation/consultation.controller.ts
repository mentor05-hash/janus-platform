import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ConsultationService } from './consultation.service';
import { NoteDto } from './dto/note.dto';

@Controller()
export class ConsultationController {
  constructor(private readonly consultation: ConsultationService) {}

  /** PUT /bookings/{id}/note — 상담 기록 저장/갱신(담당 선생님, upsert). */
  @Put('bookings/:id/note')
  saveNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consultation.upsert(id, dto, user);
  }

  /** GET /bookings/{id}/note */
  @Get('bookings/:id/note')
  getNote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consultation.getByBooking(id, user);
  }

  /** GET /students/{id}/notes — 학생/보호자/선생님/관리자 권한별. */
  @Get('students/:id/notes')
  studentNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consultation.listForStudent(id, user);
  }

  /** GET /me/notes — 본인(학생) 상담 기록. */
  @Get('me/notes')
  myNotes(@CurrentUser() user: AuthUser) {
    return this.consultation.listForStudent(user.id, user);
  }

  /** GET /me/students — 선생님 담당/센터 학생 목록(상담 기록 뷰어 진입, 검색). */
  @Get('me/students')
  @Roles('teacher')
  myStudents(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.consultation.teacherStudents(user, q);
  }

  /** GET /students/{id}/record-overview — T6 뷰어 필터용: 담임 공백 + 거부 이력(관리자·HR·선생님). */
  @Get('students/:id/record-overview')
  @Roles('admin', 'hr', 'teacher')
  recordOverview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consultation.recordOverview(id, user);
  }
}
