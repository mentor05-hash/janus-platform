import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsInt, IsPositive } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreditService } from './credit.service';
import { WeeklyGrantService } from './weekly-grant.service';

class ChargeDto {
  @IsInt()
  @IsPositive()
  amount!: number;
}

@Controller()
export class BillingController {
  constructor(
    private readonly credit: CreditService,
    private readonly weeklyGrant: WeeklyGrantService,
  ) {}

  /** GET /credits/account — 본인 크레딧 잔액. */
  @Get('credits/account')
  account(@CurrentUser() user: AuthUser) {
    return this.credit.getAccount(user.id);
  }

  /** GET /credits/transactions — 거래 내역. */
  @Get('credits/transactions')
  transactions(@CurrentUser() user: AuthUser) {
    return this.credit.listTransactions(user.id);
  }

  /** POST /payments/charge — 모의 PG 충전(학생 본인 구매 크레딧). prod+mock 차단. */
  @Post('payments/charge')
  @Roles('student')
  charge(@CurrentUser() user: AuthUser, @Body() dto: ChargeDto) {
    return this.credit.charge(user.id, dto.amount);
  }

  /** POST /credits/run-weekly-grant — 운영/테스트용 수동 주간부여(관리자). */
  @Post('credits/run-weekly-grant')
  @Roles('admin')
  async runWeeklyGrant() {
    const granted = await this.weeklyGrant.runGrant();
    return { granted };
  }
}
