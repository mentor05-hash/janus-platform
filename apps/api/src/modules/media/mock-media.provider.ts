import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MediaProvider, MediaRole, MediaTokenResult } from './media.types';

// 플레이스홀더 — 실 SFU 미연동. 엔드포인트/흐름은 동작하되 실제 음성은 흐르지 않는다.
// 실서비스는 MEDIA_PROVIDER=livekit 등으로 교체(토큰·URL 실발급).
@Injectable()
export class MockMediaProvider implements MediaProvider {
  private readonly logger = new Logger('MediaProvider:mock');

  async issueToken(
    roomRef: string,
    identity: string,
    role: MediaRole,
  ): Promise<MediaTokenResult> {
    this.logger.log(
      `issueToken room=${roomRef} identity=${identity} role=${role} (mock)`,
    );
    return {
      provider: 'mock',
      url: null,
      token: null,
      role,
      note: '미디어 SFU 미설정 — 실제 음성은 SFU(LiveKit 등) 연동 시 활성화됩니다.',
    };
  }
  async startRecording(
    roomRef: string,
    _opts?: { pathPrefix?: string },
  ): Promise<{ provider: string; recordingRef: string }> {
    const recordingRef = `mock:${randomUUID()}`;
    this.logger.log(`startRecording room=${roomRef} → ${recordingRef} (mock)`);
    return { provider: 'mock', recordingRef };
  }
  async stopRecording(
    roomRef: string,
    recordingRef: string,
  ): Promise<{ url: string | null; durationSec?: number }> {
    this.logger.log(`stopRecording ${recordingRef} (mock)`);
    return { url: null };
  }
  async closeRoom(roomRef: string): Promise<void> {
    this.logger.log(`closeRoom ${roomRef} (mock)`);
  }
}
