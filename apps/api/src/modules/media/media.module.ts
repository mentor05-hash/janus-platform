import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaDemoController } from './media-demo.controller';
import { MediaTokenController } from './media-token.controller';
import { MEDIA_PROVIDER } from './media.types';
import { MockMediaProvider } from './mock-media.provider';
import { LiveKitMediaProvider } from './livekit-media.provider';

/**
 * 미디어(SFU) 어댑터 모듈. ENV MEDIA_PROVIDER 로 구현 선택.
 *   - livekit: 관리형 LiveKit(권장) — LIVEKIT_URL/API_KEY/API_SECRET 필요. 녹화는 LIVEKIT_EGRESS_S3.
 *   - (기본) mock: 플레이스홀더 — 엔드포인트 동작, 실제 음성 없음.
 */
@Module({
  controllers: [MediaDemoController, MediaTokenController], // 데모(M0)·상담 토큰(M1) — O79
  providers: [
    {
      provide: MEDIA_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const which = config.get<string>('MEDIA_PROVIDER') ?? 'mock';
        if (which === 'livekit') {
          const url = config.get<string>('LIVEKIT_URL');
          const key = config.get<string>('LIVEKIT_API_KEY');
          const secret = config.get<string>('LIVEKIT_API_SECRET');
          if (url && key && secret) {
            return new LiveKitMediaProvider(url, key, secret, config.get<string>('LIVEKIT_EGRESS_S3'));
          }
          new Logger('MediaModule').warn('MEDIA_PROVIDER=livekit 이나 자격증명 미설정 → mock 로 폴백');
        }
        return new MockMediaProvider();
      },
    },
  ],
  exports: [MEDIA_PROVIDER],
})
export class MediaModule {}
