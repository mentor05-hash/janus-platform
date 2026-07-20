import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmModule } from '../llm/llm.module';
import { NotificationModule } from '../notification/notification.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ConsultReportController } from './consult-report.controller';
import { ConsultReportService } from './consult-report.service';
import { MediaDemoController } from './media-demo.controller';
import { MockSttProvider } from './mock-stt.provider';
import { STT_PROVIDER } from './stt.types';
import { WhisperSttProvider } from './whisper-stt.provider';
import { MediaRecordingController } from './media-recording.controller';
import { MediaRecordingService } from './media-recording.service';
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
  imports: [RealtimeModule, LlmModule, NotificationModule], // 시스템 메시지·요약(R3)·발송 알림(R4)
  controllers: [MediaDemoController, MediaTokenController, MediaRecordingController, ConsultReportController], // 데모(M0)·상담 토큰(M1)·녹음(R1)·리포트(R2~R4)
  providers: [
    MediaRecordingService,
    ConsultReportService,
    // R2 SttProvider — ENV STT_PROVIDER: whisper(OPENAI_API_KEY 필요) / 그 외 → mock(본부 엔진 확정 전).
    {
      provide: STT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const which = config.get<string>('STT_PROVIDER') ?? 'mock';
        if (which === 'whisper') {
          const key = config.get<string>('OPENAI_API_KEY');
          if (key) return new WhisperSttProvider(key, config.get<string>('STT_WHISPER_MODEL') ?? 'whisper-1');
          new Logger('MediaModule').warn('STT_PROVIDER=whisper 이나 OPENAI_API_KEY 미설정 → mock 폴백');
        }
        return new MockSttProvider();
      },
    },
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
