import { Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { RoomsBridgeService } from './rooms-bridge.service';

@Controller()
export class RoomsBridgeController {
  constructor(private readonly svc: RoomsBridgeService) {}

  /**
   * POST /bookings/:bookingId/realtime-session
   * 룸 서비스 이관용 세션 발급. 플래그 off 또는 비참여자면 { enabled:false } → 클라는 기존 in-app 사용.
   */
  @Post('bookings/:bookingId/realtime-session')
  session(
    @CurrentUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
  ) {
    return this.svc.session(user, bookingId);
  }
}
