import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { BookingService } from './booking.service';
import { BookingCreateDto, QuoteDto } from './dto/booking.dto';

@Controller('bookings')
export class BookingController {
  constructor(private readonly booking: BookingService) {}

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

  @Post(':id/accept')
  @HttpCode(200)
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.accept(id, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.reject(id, user);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.confirm(id, user);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.complete(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.cancel(id, user);
  }

  @Post(':id/noshow')
  @HttpCode(200)
  noshow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.booking.noshow(id, user);
  }
}
