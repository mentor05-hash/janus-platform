import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmModule } from '../llm/llm.module';
import { NotificationModule } from '../notification/notification.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { GuardianConsentModule } from '../guardian-consent/guardian-consent.module';
import { ConsultReportController } from './consult-report.controller';
import { ConsultReportService } from './consult-report.service';
import { MediaDemoController } from './media-demo.controller';
import { MockSttProvider } from './mock-stt.provider';
import { STT_PROVIDER } from './stt.types';
import { WhisperSttProvider } from './whisper-stt.provider';
import { MediaRecordingController } from './media-recording.controller';
import { MediaRecordingService } from './media-recording.service';
import { MediaTokenController } from './media-token.controller';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { envInt, UsageQuota } from '../../common/quota/usage-quota';
import { MEDIA_PROVIDER } from './media.types';
import { QuotaMediaProvider } from './quota-media.provider';
import { QuotaSttProvider } from './quota-stt.provider';
import { MockMediaProvider } from './mock-media.provider';
import { LiveKitMediaProvider } from './livekit-media.provider';

/**
 * 미디어(SFU) 어댑터 모듈. ENV MEDIA_PROVIDER 로 구현 선택.
 *   - livekit: 관리형 LiveKit(권장) — LIVEKIT_URL/API_KEY/API_SECRET 필요. 녹화는 LIVEKIT_EGRESS_S3.
 *   - (기본) mock: 플레이스홀더 — 엔드포인트 동작, 실제 음성 없음. 비용 0 이므로 상한 없음.
 *
 * livekit 은 유료이므로 일 발급·녹화 상한을 강제한다(QuotaMediaProvider, B008).
 */

/** 일 세션 참가 토큰 발급 상한 — 초기 규모 기준. */
const DEFAULT_TOKEN_LIMIT = 600;
/** 일 녹화 시작 상한 — egress 단가가 높아 더 낮게. */
const DEFAULT_RECORDING_LIMIT = 40;
/** 일 음성 전사 상한 — 유료 STT. 녹음 길이 비례 과금이라 보수적으로. */
const DEFAULT_STT_LIMIT = 60;
@Module({
  imports: [
    RealtimeModule,
    LlmModule,
    NotificationModule,
    GuardianConsentModule,
  ], // 시스템 메시지·요약(R3)·발송 알림(R4)·전달동의 게이트(①)
  controllers: [
    MediaDemoController,
    MediaTokenController,
    MediaRecordingController,
    ConsultReportController,
  ], // 데모(M0)·상담 토큰(M1)·녹음(R1)·리포트(R2~R4)
  providers: [
    MediaRecordingService,
    ConsultReportService,
    // R2 SttProvider — ENV STT_PROVIDER: whisper(OPENAI_API_KEY 필요) / 그 외 → mock(본부 엔진 확정 전).
    {
      provide: STT_PROVIDER,
      inject: [ConfigService, CACHE_PROVIDER],
      useFactory: (config: ConfigService, cache: CacheProvider) => {
        const which = config.get<string>('STT_PROVIDER') ?? 'mock';
        if (which === 'whisper') {
          const key = config.get<string>('OPENAI_API_KEY');
          if (key) {
            const inner = new WhisperSttProvider(
              key,
              config.get<string>('STT_WHISPER_MODEL') ?? 'whisper-1',
            );
            // 유료 API — 일 상한 강제(B008). 전사는 상담 후 비동기 후처리라 fail-open
            // (카운터 장애로 리포트 파이프라인을 멈추는 손해가 더 크다).
            return new QuotaSttProvider(
              inner,
              new UsageQuota(cache, 'stt', true),
              envInt(config.get<string>('STT_DAILY_LIMIT'), DEFAULT_STT_LIMIT),
            );
          }
          new Logger('MediaModule').warn(
            'STT_PROVIDER=whisper 이나 OPENAI_API_KEY 미설정 → mock 폴백',
          );
        }
        return new MockSttProvider(); // 비용 0 — 상한 불필요
      },
    },
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
            const inner = new LiveKitMediaProvider(
              url,
              key,
              secret,
              config.get<string>('LIVEKIT_EGRESS_S3'),
            );
            // 수업·상담 접속을 캐시 장애로 끊으면 수업 자체가 멈춘다 —
            // LLM(fail-closed)과 달리 기본 통과(fail-open). 비용보다 가용성이 우선인 경로다.
            const failOpen =
              config.get<string>('MEDIA_QUOTA_FAIL_OPEN') !== 'false';
            return new QuotaMediaProvider(
              inner,
              new UsageQuota(cache, 'media', failOpen),
              envInt(
                config.get<string>('MEDIA_DAILY_TOKEN_LIMIT'),
                DEFAULT_TOKEN_LIMIT,
              ),
              envInt(
                config.get<string>('MEDIA_DAILY_RECORDING_LIMIT'),
                DEFAULT_RECORDING_LIMIT,
              ),
            );
          }
          new Logger('MediaModule').warn(
            'MEDIA_PROVIDER=livekit 이나 자격증명 미설정 → mock 로 폴백',
          );
        }
        return new MockMediaProvider();
      },
    },
  ],
  exports: [MEDIA_PROVIDER],
})
export class MediaModule {}
