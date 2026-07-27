import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/ratelimit/rate-limit.decorator';
import { MEDIA_PROVIDER } from './media.types';
import type { MediaProvider } from './media.types';

/**
 * M0 스파이크(O79) — LiveKit 실개통 검증용 데모 토큰. 로컬/데모 전용(프로덕션 차단).
 * 웹 /media/demo 페이지가 호출: 두 브라우저가 같은 룸(media-demo)에 publisher 로 들어가
 * 상호 영상·음성 성립을 확인한다. MEDIA_PROVIDER=mock 이면 url/token null → 페이지가 미개통 안내.
 */
@Controller('media')
export class MediaDemoController {
  constructor(
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @RateLimit({ limit: 30, windowSec: 60 })
  @Post('demo-token')
  async demoToken(@Body() body: { identity?: string; name?: string } = {}) {
    const env =
      this.config.get<string>('APP_ENV') ??
      this.config.get<string>('NODE_ENV') ??
      '';
    if (env === 'prod' || env === 'production') {
      throw new BadRequestException(
        '데모 토큰은 로컬/데모 환경에서만 발급됩니다.',
      );
    }
    const identity = (
      body.identity || `demo-${Math.random().toString(36).slice(2, 8)}`
    ).slice(0, 40);
    return this.media.issueToken(
      'media-demo',
      identity,
      'publisher',
      body.name?.slice(0, 40),
    );
  }
}
