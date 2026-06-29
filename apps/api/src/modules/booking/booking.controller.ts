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
  CancelDto,
  QuoteDto,
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
  list(
    @CurrentUser() user: AuthUser,
    @Query('role') role?: 'student' | 'teacher',
    @Query('status') status?: string,
  ) {
    return this.booking.list(user, role, status);
  }

  /** POST /bookings/reverse — 선생님이 학생에게 역상담 제안(첫 상담 한정). */
  @Post('reverse')
  @Roles('teacher')
  proposeReverse(@Body() dto: ReverseProposeDto, @CurrentUser() user: AuthUser) {
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
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.accept(id, user);
  }

  @Patch(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.reject(id, user);
  }

  @Patch(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.confirm(id, user);
  }

  @Patch(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
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
      return this.cancellation.teacherCancel(id, { reason: dto.reason, route: dto.route }, user);
    }
    return this.booking.cancel(id, user);
  }

  @Patch(':id/noshow')
  noshow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.noshow(id, user);
  }
}
