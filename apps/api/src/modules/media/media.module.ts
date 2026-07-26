import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_PROVIDER, CacheProvider } from '../../common/cache/cache.types';
import { envInt, UsageQuota } from '../../common/quota/usage-quota';
import { MEDIA_PROVIDER } from './media.types';
import { MockMediaProvider } from './mock-media.provider';
import { LiveKitMediaProvider } from './livekit-media.provider';
import { QuotaMediaProvider } from './quota-media.provider';

/**
 * 미디어(SFU) 어댑터 모듈. ENV MEDIA_PROVIDER 로 구현 선택.
 *   - livekit: 관리형 LiveKit(권장) — LIVEKIT_URL/API_KEY/API_SECRET 필요. 녹화는 LIVEKIT_EGRESS_S3.
 *     유료이므로 일 발급·녹화 상한을 강제한다(QuotaMediaProvider).
 *   - (기본) mock: 플레이스홀더 — 엔드포인트 동작, 실제 음성 없음. 비용 0 이므로 상한 없음.
 */
const DEFAULT_TOKEN_LIMIT = 600; // 일 세션 참가 발급 — 초기 규모 기준
const DEFAULT_RECORDING_LIMIT = 40; // 일 녹화 시작 — egress 단가가 높아 더 낮게

@Module({
  providers: [
    {
      provide: MEDIA_PROVIDER,
      inject: [ConfigService, CACHE_PROVIDER],
      useFactory: (config: ConfigService, cache: CacheProvider) => {
        const which = config.get<string>('MEDIA_PROVIDER') ?? 'mock';
        if (which === 'livekit') {
          const url = config.get<string>('LIVEKIT_URL');
          const key = config.get<string>('LIVEKIT_API_KEY');
          const secret = config.get<string>('LIVEKIT_API_SECRET');
          if (url && key && secret) {
            const inner = new LiveKitMediaProvider(url, key, secret, config.get<string>('LIVEKIT_EGRESS_S3'));
            // 강의·상담 접속을 캐시 장애로 끊으면 수업 자체가 멈춘다 — LLM 과 달리 기본 통과(fail open).
            const failOpen = config.get<string>('MEDIA_QUOTA_FAIL_OPEN') !== 'false';
            return new QuotaMediaProvider(
              inner,
              new UsageQuota(cache, 'media', failOpen),
              envInt(config.get<string>('MEDIA_DAILY_TOKEN_LIMIT'), DEFAULT_TOKEN_LIMIT),
              envInt(config.get<string>('MEDIA_DAILY_RECORDING_LIMIT'), DEFAULT_RECORDING_LIMIT),
            );
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
