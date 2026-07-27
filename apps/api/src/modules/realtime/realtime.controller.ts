import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RealtimeService, type FeatureMode } from './realtime.service';

const MODES = ['off', 'all', 'premium'] as const;
class FeaturePolicyDto {
  @IsOptional() @IsIn(MODES) chat?: FeatureMode;
  @IsOptional() @IsIn(MODES) whiteboard?: FeatureMode;
  @IsOptional() @IsIn(MODES) notif?: FeatureMode;
}

@Controller()
export class RealtimeController {
  constructor(private readonly svc: RealtimeService) {}

  /** GET /chat/:bookingId/messages — 채팅 이력(참여자). */
  @Get('chat/:bookingId/messages')
  history(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.svc.history(user, bookingId);
  }

  /** GET /chat/unread — 내 예약별 미확인 메시지 수(목록 배지용). */
  @Get('chat/unread')
  unread(@CurrentUser() user: AuthUser) {
    return this.svc.unreadCounts(user);
  }

  /** GET /chat/inbox — 대화 있는 예약 최신순(상대·미리보기·미읽음). 카톡형 인박스. */
  @Get('chat/inbox')
  inbox(@CurrentUser() user: AuthUser) {
    return this.svc.chatInbox(user);
  }

  /** GET /realtime/features?studentId= — 내게 열린 실시간 기능(탭/버튼 표시용). */
  @Get('realtime/features')
  features(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId?: string,
  ) {
    return this.svc.featureAccess(user, studentId);
  }

  /** GET /admin/realtime/policy — 정책 조회(관리자/HR). */
  @Get('admin/realtime/policy')
  @Roles('admin', 'hr')
  getPolicy() {
    return this.svc.getFeatures();
  }

  /** PUT /admin/realtime/policy — 정책 변경(본사 마스터, 서비스 가드). */
  @Put('admin/realtime/policy')
  @Roles('admin', 'hr')
  setPolicy(@CurrentUser() user: AuthUser, @Body() dto: FeaturePolicyDto) {
    return this.svc.setFeatures(user, dto);
  }
}
