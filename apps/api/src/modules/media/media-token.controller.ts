import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { IsIn, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RateLimit } from '../../common/ratelimit/rate-limit.decorator';
import { MEDIA_PROVIDER } from './media.types';
import type { MediaProvider } from './media.types';

class MediaTokenDto {
  @IsIn(['consult']) context!: 'consult'; // M1은 상담만 — lecture 는 기존 classroom 경로 유지(후속 통합)
  @IsUUID() refId!: string; // consult → bookingId
}

/**
 * 미디어 토큰 발급(M-계약 M1 · O79 M1) — POST /media/token {context, refId}.
 * consult: 예약 당사자(학생·선생님) + status=confirmed + 세션 시간창(±휴게버퍼) 안에서만 발급.
 * 룸 = consult_{bookingId}, 양측 publisher(1:1 화상). 시간창 밖 입장은 토큰 수준에서 차단.
 */
@Controller('media')
export class MediaTokenController {
  constructor(
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
    private readonly prisma: PrismaService,
  ) {}

  @Post('token')
  @RateLimit({ limit: 30, windowSec: 60 })
  async token(@CurrentUser() user: AuthUser, @Body() dto: MediaTokenDto) {
    const b = await this.prisma.booking.findUnique({
      where: { id: dto.refId },
      select: {
        id: true,
        student_id: true,
        teacher_id: true,
        status: true,
        mode: true,
        start_at: true,
        end_at: true,
        buffer_before: true,
        buffer_after: true,
      },
    });
    if (!b)
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: '예약을 찾을 수 없습니다.',
      });
    if (b.student_id !== user.id && b.teacher_id !== user.id) {
      throw new ForbiddenException({
        code: 'MEDIA_NOT_PARTICIPANT',
        message: '이 상담의 참여자만 입장할 수 있습니다.',
      });
    }
    // 음성/화상은 예약 방식으로 구분(O89) — 화상(zoom) 상담에서만. 채팅·필기 상담의 상위 상품 잠식·미디어 비용 방지.
    if (b.mode !== 'zoom') {
      throw new ForbiddenException({
        code: 'MEDIA_MODE_NOT_ALLOWED',
        message: '음성·화상 통화는 화상 상담 예약에서만 사용할 수 있습니다.',
      });
    }
    if (b.status !== 'confirmed') {
      throw new ForbiddenException({
        code: 'MEDIA_NOT_CONFIRMED',
        message: '확정된 예약에서만 통화할 수 있습니다.',
      });
    }
    if (!b.start_at || !b.end_at) {
      throw new ForbiddenException({
        code: 'MEDIA_NO_WINDOW',
        message: '상담 시간이 정해지지 않은 예약입니다.',
      });
    }
    const now = Date.now();
    const from = b.start_at.getTime() - (b.buffer_before ?? 10) * 60_000;
    const to = b.end_at.getTime() + (b.buffer_after ?? 10) * 60_000;
    if (now < from || now > to) {
      throw new ForbiddenException({
        code: 'MEDIA_OUT_OF_WINDOW',
        message: '상담 시간대에만 통화할 수 있습니다.',
      });
    }
    const t = await this.media.issueToken(
      `consult_${b.id}`,
      user.id,
      'publisher',
      user.loginId,
    );
    return { ...t, expiresAt: new Date(to).toISOString() };
  }
}
