import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
// (media-token·recording 엔드포인트 추가)
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ClassroomService } from './classroom.service';
import { CreateClassDto, EnrollDto } from './dto/classroom.dto';

// 온라인 강의실. 개설·등록·시작/종료는 teacher/staff, 입장·조회는 등록자 포함.
@Controller('classes')
export class ClassroomController {
  constructor(private readonly classroom: ClassroomService) {}

  @Post()
  @Roles('teacher', 'admin', 'hr')
  create(@Body() dto: CreateClassDto, @CurrentUser() user: AuthUser) {
    return this.classroom.create(dto, user);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.classroom.list(user);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.classroom.getOne(id, user);
  }

  @Get(':id/roster')
  @Roles('teacher', 'admin', 'hr')
  roster(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.classroom.roster(id, user);
  }

  @Post(':id/enroll')
  @Roles('teacher', 'admin', 'hr')
  enroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollDto, @CurrentUser() user: AuthUser) {
    return this.classroom.enroll(id, dto, user);
  }

  // 입장 토큰(선생님 host / 등록 학생 viewer). 클라는 { url, token } 로 룸에 접속.
  @Post(':id/join')
  @HttpCode(200)
  join(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.classroom.join(id, user);
  }

  @Post(':id/start')
  @Roles('teacher', 'admin', 'hr')
  @HttpCode(200)
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.classroom.start(id, user);
  }

  @Post(':id/end')
  @Roles('teacher', 'admin', 'hr')
  @HttpCode(200)
  end(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.classroom.end(id, user);
  }

  // 음성(SFU) 접속 토큰 — 선생님 송출 / 학생 수신.
  @Get(':id/media-token')
  mediaToken(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.classroom.mediaToken(id, user);
  }

  // 녹화(필수) — 시작/종료/목록.
  @Post(':id/recording/start')
  @Roles('teacher', 'admin', 'hr')
  startRecording(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.classroom.startRecording(id, user);
  }

  @Post(':id/recording/:recId/stop')
  @Roles('teacher', 'admin', 'hr')
  @HttpCode(200)
  stopRecording(@Param('id', ParseUUIDPipe) id: string, @Param('recId', ParseUUIDPipe) recId: string, @CurrentUser() user: AuthUser) {
    return this.classroom.stopRecording(id, recId, user);
  }

  @Get(':id/recordings')
  recordings(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.classroom.listRecordings(id, user);
  }
}
