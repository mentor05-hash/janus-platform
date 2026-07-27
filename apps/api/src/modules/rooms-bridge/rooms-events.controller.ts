import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * 룸 서비스 → 호스트 인바운드 이벤트(웹훅 수신). 룸 서버는 도메인을 모르므로
 * "부재중 메시지가 있었다"만 보내고, 알림 원장·토스트 발송은 여기서 한다(부재중 알림 파리티).
 * 보호: x-api-key === ROOMS_API_KEY (서버-투-서버 공유 키).
 */
@Controller('internal/rooms')
export class RoomsEventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly gateway: RealtimeGateway,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('events')
  async handle(
    @Headers('x-api-key') key: string,
    @Body()
    body: {
      type?: string;
      externalRef?: string;
      recipientExtUserId?: string;
      preview?: string;
    },
  ) {
    const expect =
      this.config.get<string>('ROOMS_API_KEY') || 'dev-rooms-api-key';
    if (!key || key !== expect)
      throw new UnauthorizedException('유효하지 않은 API 키');

    if (
      body.type === 'chat.missed' &&
      body.externalRef &&
      body.recipientExtUserId
    ) {
      const b = await this.prisma.booking.findUnique({
        where: { id: body.externalRef },
        select: { id: true, student_id: true, teacher_id: true },
      });
      // 수신자가 실제 예약 참여자일 때만 통지(위조·오배송 방지).
      if (
        !b ||
        (body.recipientExtUserId !== b.student_id &&
          body.recipientExtUserId !== b.teacher_id)
      )
        return { ok: false };
      this.gateway.emitToUser(body.recipientExtUserId, 'notif:new', {
        type: 'chat_message',
        payload: { bookingId: b.id },
        title: '새 채팅 메시지',
        body: (body.preview ?? '').slice(0, 60),
      });
      void this.realtime.recordChatUnread(b.id, body.recipientExtUserId);
      return { ok: true };
    }
    return { ok: true, ignored: true };
  }
}
