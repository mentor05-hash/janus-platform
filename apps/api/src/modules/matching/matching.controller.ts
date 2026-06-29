import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MatchingService } from './matching.service';
import { MatchAutoDto } from './dto/match.dto';

@Controller('match')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  /** POST /match/auto — 30분 자동매칭(학생). */
  @Post('auto')
  @HttpCode(200)
  @Roles('student')
  auto(@Body() dto: MatchAutoDto, @CurrentUser() user: AuthUser) {
    return this.matching.autoMatch(dto, user);
  }
}
