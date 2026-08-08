import { HttpException, HttpStatus } from '@nestjs/common';
import { QuotaExceededError, UsageQuota } from '../../common/quota/usage-quota';
import { MediaProvider, MediaRole, MediaTokenResult } from './media.types';

/**
 * 유료 SFU(LiveKit) 를 감싸 일 사용량 상한을 강제한다(실행계획서 §비용 — 공개 전 하드 게이트).
 * 비용 축은 참가자-분과 녹화(egress) 두 개다. 동시 세션 수를 정확히 세려면 룸 종료 이벤트에
 * 의존해야 하고(정상 종료 누락 시 카운터가 새어 영구 차단됨) — 그래서 **일 단위 발급·녹화 횟수**로
 * 회로차단기를 만든다. 실시간 동시성 제한은 LiveKit 프로젝트 설정에서 별도로 건다.
 * 비용이 0인 mock 어댑터는 감싸지 않는다(MediaModule 참조).
 */
export class QuotaMediaProvider implements MediaProvider {
  constructor(
    private readonly inner: MediaProvider,
    private readonly quota: UsageQuota,
    /** 일 토큰 발급(=세션 참가) 상한 */
    private readonly tokenLimit: number,
    /** 일 녹화 시작 상한 — egress 가 참가자-분보다 단가가 높다 */
    private readonly recordingLimit: number,
  ) {}

  async issueToken(
    roomRef: string,
    identity: string,
    role: MediaRole,
    displayName?: string,
  ): Promise<MediaTokenResult> {
    await this.guard('token', this.tokenLimit);
    return this.inner.issueToken(roomRef, identity, role, displayName);
  }

  async startRecording(
    roomRef: string,
  ): Promise<{ provider: string; recordingRef: string }> {
    await this.guard('recording', this.recordingLimit);
    return this.inner.startRecording(roomRef);
  }

  // 종료·정리는 막지 않는다 — 상한 때문에 자원이 열린 채 남으면 비용이 오히려 늘어난다.
  stopRecording(
    roomRef: string,
    recordingRef: string,
  ): Promise<{ url: string | null; durationSec?: number }> {
    return this.inner.stopRecording(roomRef, recordingRef);
  }

  closeRoom(roomRef: string): Promise<void> {
    return this.inner.closeRoom(roomRef);
  }

  async usage(): Promise<{
    token: { used: number; limit: number };
    recording: { used: number; limit: number };
  }> {
    return {
      token: { used: await this.quota.peek('token'), limit: this.tokenLimit },
      recording: {
        used: await this.quota.peek('recording'),
        limit: this.recordingLimit,
      },
    };
  }

  private async guard(
    scope: 'token' | 'recording',
    limit: number,
  ): Promise<void> {
    try {
      await this.quota.consume(scope, limit);
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        throw new HttpException(
          {
            error: {
              code: 'MEDIA_QUOTA_EXCEEDED',
              message:
                scope === 'recording'
                  ? '오늘 녹화 가능 횟수를 모두 사용했습니다. 수업은 녹화 없이 진행할 수 있습니다.'
                  : '실시간 강의 접속이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.',
            },
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw e;
    }
  }
}
