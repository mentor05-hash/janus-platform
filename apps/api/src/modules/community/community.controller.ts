import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CommunityService } from './community.service';

@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  /** GET /community/feed — 커뮤니티 라운지(공개 Q&A·인기 자료·우수 후기). 모든 인증 역할. */
  @Get('feed')
  feed(@CurrentUser() user: AuthUser) {
    return this.community.feed(user);
  }
}
