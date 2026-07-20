import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MatchingService } from './matching.service';
import { DiagnosticMatchService } from './diagnostic-match.service';
import { MatchAutoDto } from './dto/match.dto';

@Controller('match')
export class MatchingController {
  constructor(
    private readonly matching: MatchingService,
    private readonly diagMatch: DiagnosticMatchService,
  ) {}

  /** POST /match/auto — 30분 자동매칭(학생). */
  @Post('auto')
  @HttpCode(200)
  @Roles('student')
  auto(@Body() dto: MatchAutoDto, @CurrentUser() user: AuthUser) {
    return this.matching.autoMatch(dto, user);
  }

  /** GET /match/recommend — 진단·성적 기반 추천 상담사 카드 N인(격차리포트 뷰·홈에서 노출). */
  @Get('recommend')
  @Roles('student')
  recommend(@CurrentUser() user: AuthUser, @Query('subject') subject?: string, @Query('mode') mode?: string, @Query('limit') limit?: string) {
    return this.diagMatch.recommend(user, { subject, mode, limit: limit ? Number(limit) : undefined });
  }

  /** POST /match/recommend/:counselorId/click — 추천 카드 클릭 계측(예약 진입 직전). */
  @Post('recommend/:counselorId/click')
  @HttpCode(200)
  @Roles('student')
  click(@Param('counselorId', ParseUUIDPipe) counselorId: string, @CurrentUser() user: AuthUser) {
    return this.diagMatch.recordClick(user, counselorId);
  }
}
