import { HttpException, HttpStatus } from '@nestjs/common';
import { QuotaExceededError, UsageQuota } from '../../common/quota/usage-quota';
import type { SttInput, SttProvider, SttResult } from './stt.types';

/**
 * 유료 SttProvider 를 감싸 일 전사 상한을 강제한다(B008 확장).
 *
 * 왜 필요한가: 상담 녹음 전사는 **유료 외부 API**(OpenAI Whisper)인데 상한이 없었다.
 * LLM·미디어에는 상한을 걸어 두고 STT 만 열려 있으면, 비용 보호에 구멍이 남는다 —
 * 녹음 길이에 비례해 과금되므로 호출 수만으로는 상한이 느슨하다는 점도 감안해야 한다.
 * 비용이 0인 mock 어댑터는 감싸지 않는다(MediaModule 참조).
 *
 * **fail-open 인 이유**: 전사는 상담 종료 후 비동기 후처리다. 카운터 장애로 막으면
 * 리포트 파이프라인이 멈추는데, 그 손해가 하루치 전사 비용보다 크다.
 * (LLM 은 사용자 요청 경로라 fail-closed — 방향이 다른 이유가 여기 있다.)
 */
export class QuotaSttProvider implements SttProvider {
  constructor(
    private readonly inner: SttProvider,
    private readonly quota: UsageQuota,
    /** 일 전사 호출 상한. 0 이하면 무제한 */
    private readonly dailyLimit: number,
  ) {}

  async transcribe(input: SttInput): Promise<SttResult> {
    try {
      await this.quota.consume('transcribe', this.dailyLimit);
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        // 호출자(consult-report)는 이 예외를 잡아 상태를 failed 로 남긴다 —
        // 운영 수치는 노출하지 않되 "오늘 한도"라는 성격은 코드로 구분되게 한다.
        throw new HttpException(
          {
            error: {
              code: 'STT_QUOTA_EXCEEDED',
              message:
                '오늘 음성 전사 사용량을 모두 사용했습니다. 내일 다시 시도해 주세요.',
            },
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw e;
    }
    return this.inner.transcribe(input);
  }
}
