import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { IsBoolean, IsUUID } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { MediaRecordingService } from './media-recording.service';

class ConsentDto {
  @IsUUID() bookingId!: string;
  @IsBoolean() recording!: boolean;
}

class GuardianConsentDto {
  @IsUUID() studentId!: string;
  @IsBoolean() granted!: boolean;
}

/** R1 상담 녹음 — 동의(REST, 실사 차이① 보고분)·상태·egress webhook. */
@Controller('media')
export class MediaRecordingController {
  constructor(private readonly svc: MediaRecordingService) {}

  /** GET /media/consent/:bookingId — 동의·녹음 상태(상담룸 UI 초기화). enabled=false 면 UI 비노출. */
  @Get('consent/:bookingId')
  status(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.status(user, bookingId);
  }

  /** POST /media/consent — 동의(recording:true)/철회(false). 양측 성립 시에만 서버가 egress 시작. */
  @Post('consent')
  consent(@Body() dto: ConsentDto, @CurrentUser() user: AuthUser) {
    return this.svc.consent(user, dto.bookingId, dto.recording);
  }

  /** GET /media/guardian-consent/:studentId — 자녀 녹음·AI 요약 동의 상태(학부모). */
  @Get('guardian-consent/:studentId')
  guardianStatus(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.guardianConsentStatus(user, studentId);
  }

  /** POST /media/guardian-consent — 자녀 녹음·AI 요약(외부 STT) 동의 설정/철회(학부모·감사 기록). */
  @Post('guardian-consent')
  guardianSet(@Body() dto: GuardianConsentDto, @CurrentUser() user: AuthUser) {
    return this.svc.setGuardianConsent(user, dto.studentId, dto.granted);
  }

  /** POST /media/egress-webhook — LiveKit webhook(서명 검증 필수·공개 엔드포인트). */
  @Public()
  @Post('egress-webhook')
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('authorization') auth: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    if (!this.svc.verifyWebhook(raw, auth))
      throw new UnauthorizedException('webhook 서명 검증 실패');
    const event = (body as { event?: string }).event;
    if (event === 'egress_ended') {
      return this.svc.handleEgressEnded(body);
    }
    return { ok: true, ignored: event ?? 'unknown' };
  }
}
