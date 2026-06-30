import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
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
}
