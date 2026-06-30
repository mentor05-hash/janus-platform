import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaymentRequestService } from './payment-request.service';
import {
  CreatePaymentRequestDto,
  RespondPaymentRequestDto,
} from './dto/payment-request.dto';

@Controller('payment-requests')
export class PaymentRequestController {
  constructor(private readonly paymentRequests: PaymentRequestService) {}

  /** POST /payment-requests — 학생 직접/보호자 대납/관리자 발행. */
  @Post()
  @Roles('student', 'guardian', 'admin')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentRequestDto) {
    return this.paymentRequests.create(user, dto);
  }

  /** GET /payment-requests — 역할별 목록. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.paymentRequests.list(user);
  }

  /** PATCH /payment-requests/{id}/respond — 결제(대납)/거절. */
  @Patch(':id/respond')
  @Roles('student', 'guardian')
  respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondPaymentRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.paymentRequests.respond(id, dto, user);
  }
}
