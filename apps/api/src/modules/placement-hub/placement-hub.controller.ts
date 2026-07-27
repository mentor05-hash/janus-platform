import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/ratelimit/rate-limit.decorator';
import { HubTicketDto } from './dto/placement-hub.dto';
import { PlacementHubService } from './placement-hub.service';

@Controller()
export class PlacementHubController {
  constructor(private readonly hub: PlacementHubService) {}

  /** 허브 목록(메타만). 데이터 미배치 환경에선 available:false. */
  @Public()
  @Get('placement-hub/list')
  list() {
    return this.hub.list();
  }

  /** 격차 리포트 목표컷 검색(N29) — 로그인(회원+) 필수. mode=jeongsi(누백)|susi(내신). JANUS_DATA_DIR/targets.json(C6). */
  @Get('placement-hub/targets')
  @RateLimit({ limit: 40, windowSec: 60 })
  targets(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('mode') mode?: string) {
    return this.hub.searchTargets(user, q ?? '', mode === 'susi' ? 'susi' : 'jeongsi');
  }

  /** 회원급 파일 열람 티켓 — 로그인 필수 + 티어 검증(C2: 사용자 티어 ≥ 표 요구 티어). */
  @Post('placement-hub/ticket')
  @RateLimit({ limit: 30, windowSec: 60 })
  ticket(@CurrentUser() user: AuthUser, @Body() dto: HubTicketDto) {
    return this.hub.issueTicket(user, dto.slug);
  }

  /**
   * thin-slice 조회(O76) — 검색 일치 행만 반환(요청당 30행·일 600행). 전체 파일 대신 쓰는 공개용 경로.
   * slices/<slug>.json 미배치면 available:false → 프런트는 티켓(전체 HTML) 폴백.
   */
  @Get('placement-hub/slice/:slug')
  @RateLimit({ limit: 30, windowSec: 60 })
  slice(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Query('q') q?: string, @Query('limit') limit?: string) {
    return this.hub.slice(user, slug, q ?? '', limit ? Number(limit) : undefined);
  }

  /** 배치표 HTML 서빙 — manifest 허용목록만. 무료=공개, 회원급=?t=티켓 필수. iframe(동일 출처) 임베드용. */
  @Public()
  @RateLimit({ limit: 60, windowSec: 60 })
  @Get('placement-hub/file/:slug')
  async file(@Param('slug') slug: string, @Query('t') ticket: string | undefined, @Res() res: Response) {
    const { html } = await this.hub.fileHtml(slug, ticket);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Robots-Tag', 'noindex'); // 원본 표 직접 색인 방지(재배포 금지 자료)
    res.send(html);
  }
}
