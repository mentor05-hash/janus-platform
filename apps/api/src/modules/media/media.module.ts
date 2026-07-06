import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MEDIA_PROVIDER } from './media.types';
import { MockMediaProvider } from './mock-media.provider';

/**
 * 미디어(SFU) 어댑터 모듈. ENV MEDIA_PROVIDER 로 구현 선택.
 *   - (기본) mock: 플레이스홀더 — 엔드포인트 동작, 실제 음성 없음.
 *   - livekit/mediasoup: 실 SFU (자격증명 필요) — 결정 후 구현체 추가해 여기서 분기.
 */
@Module({
  providers: [
    {
      provide: MEDIA_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const which = config.get<string>('MEDIA_PROVIDER') ?? 'mock';
        switch (which) {
          // case 'livekit': return new LiveKitMediaProvider(config.get('LIVEKIT_URL'), config.get('LIVEKIT_KEY'), config.get('LIVEKIT_SECRET'));
          default:
            return new MockMediaProvider();
        }
      },
    },
  ],
  exports: [MEDIA_PROVIDER],
})
export class MediaModule {}
