import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ConsentDto, WithdrawDto } from './dto/legal.dto';
import { LegalService } from './legal.service';

@Controller()
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  /** GET /legal/terms — 이용약관(공개). */
  @Public()
  @Get('legal/terms')
  terms() {
    return this.legal.terms();
  }

  /** GET /legal/privacy — 개인정보처리방침(공개). */
  @Public()
  @Get('legal/privacy')
  privacy() {
    return this.legal.privacy();
  }

  /** GET /legal/consent — 내 동의 현황. */
  @Get('legal/consent')
  getConsent(@CurrentUser() user: AuthUser) {
    return this.legal.getConsent(user);
  }

  /** POST /legal/consent — 동의 기록(미성년 보호자 동의 포함). */
  @Post('legal/consent')
  saveConsent(@CurrentUser() user: AuthUser, @Body() dto: ConsentDto) {
    return this.legal.saveConsent(user, dto);
  }

  /** GET /me/data-export — 내 데이터 내보내기(JSON 다운로드). */
  @Get('me/data-export')
  async exportData(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.legal.exportData(user);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="mydata-${user.loginId}.json"`,
    );
    return data;
  }

  /** POST /me/withdraw — 회원 탈퇴(PII 비식별 + 계정 비활성화). */
  @Post('me/withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Body() dto: WithdrawDto) {
    return this.legal.withdraw(user, dto);
  }
}
