import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BookingService } from './booking.service';
import { CancellationService } from './cancellation.service';
import {
  BookingCreateDto,
  BookingListQueryDto,
  CancelDto,
  QuoteDto,
  ReverseFlagDto,
  ReverseProposeDto,
  ReverseRespondDto,
} from './dto/booking.dto';
import { AccountRole } from '../../config/enums';

@Controller('bookings')
export class BookingController {
  constructor(
    private readonly booking: BookingService,
    private readonly cancellation: CancellationService,
  ) {}

  @Post('quote')
  @HttpCode(200)
  quote(@Body() dto: QuoteDto, @CurrentUser() user: AuthUser) {
    return this.booking.quote(dto, user);
  }

  @Post()
  create(@Body() dto: BookingCreateDto, @CurrentUser() user: AuthUser) {
    return this.booking.create(dto, user);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: BookingListQueryDto) {
    return this.booking.list(user, q.role, q.status);
  }

  /** GET /bookings/{id} — 단건(관계자만): 상담 요청 내용·첨부 포함. */
  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.getOne(id, user);
  }

  /** GET /bookings/reverse/eligible — 선생님: 역상담 대상 학생 목록(첫상담/관리자지정/학생신청). */
  @Get('reverse/eligible')
  @Roles('teacher')
  reverseEligible(@CurrentUser() user: AuthUser) {
    return this.booking.listReverseEligible(user);
  }

  /** GET /bookings/reverse/admin-students — 관리자: 센터 학생 + 역상담 지정/신청 플래그. */
  @Get('reverse/admin-students')
  @Roles('admin', 'hr')
  reverseAdminStudents(@CurrentUser() user: AuthUser) {
    return this.booking.adminListReverseStudents(user);
  }

  /** PATCH /bookings/reverse/admin/{studentId} — 관리자: 학생 역상담 대상 지정/해제. */
  @Patch('reverse/admin/:studentId')
  @Roles('admin', 'hr')
  reverseAdminSet(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: ReverseFlagDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booking.adminSetReverse(studentId, dto.value, user);
  }

  /** GET /bookings/reverse/self — 학생: 본인 역상담 신청 현황. */
  @Get('reverse/self')
  @Roles('student')
  reverseSelfGet(@CurrentUser() user: AuthUser) {
    return this.booking.studentGetReverse(user);
  }

  /** PATCH /bookings/reverse/self — 학생: 본인 역상담 받기 신청/취소. */
  @Patch('reverse/self')
  @Roles('student')
  reverseSelf(@Body() dto: ReverseFlagDto, @CurrentUser() user: AuthUser) {
    return this.booking.studentSetReverse(dto.value, user);
  }

  /** POST /bookings/reverse — 선생님이 학생에게 역상담 제안(대상 자격 3종). */
  @Post('reverse')
  @Roles('teacher')
  proposeReverse(
    @Body() dto: ReverseProposeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booking.proposeReverse(dto, user);
  }

  /** PATCH /bookings/{id}/reverse-respond — 학생 수락/거절. */
  @Patch(':id/reverse-respond')
  @Roles('student')
  reverseRespond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseRespondDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booking.respondReverse(id, dto.action, user);
  }

  // ── 상태 전이(§5-4): openapi 계약과 일치하도록 PATCH ──
  @Patch(':id/accept')
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booking.accept(id, user);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booking.reject(id, user);
  }

  @Patch(':id/confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booking.confirm(id, user);
  }

  @Patch(':id/complete')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booking.complete(id, user);
  }

  /** 취소. 선생님이 route 를 주면 사유 취소 4경로(§5-6: 이벤트·알림·환원·슬롯해제). */
  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CancelDto,
  ) {
    if (user.role === AccountRole.TEACHER && dto?.route) {
      return this.cancellation.teacherCancel(
        id,
        { reason: dto.reason, route: dto.route },
        user,
      );
    }
    return this.booking.cancel(id, user);
  }

  @Patch(':id/noshow')
  noshow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booking.noshow(id, user);
  }
}
