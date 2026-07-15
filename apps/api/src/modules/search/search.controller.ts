import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** GET /search?q= — 전역 통합검색(강좌·자료·커뮤니티·선생님). 로그인 전원. */
  @Get()
  all(@Query('q') q: string, @CurrentUser() user: AuthUser) {
    return this.search.searchAll(user, q ?? '');
  }
}
