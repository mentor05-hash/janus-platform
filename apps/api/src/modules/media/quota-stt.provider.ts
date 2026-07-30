import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { QuotaExceededError, UsageQuota } from '../../common/quota/usage-quota';
import type { SttInput, SttProvider, SttResult } from './stt.types';

/**
 * 오디오 길이를 모를 때 바이트 수로 분을 추정할 때 쓰는 비트레이트(kbps).
 *
 * LiveKit egress 산출물은 Opus/ogg 로 보통 32~64kbps 다. **낮은 쪽을 가정**하는 이유는
 * 추정이 틀리는 방향을 고르기 위해서다 — 낮게 잡으면 같은 바이트가 더 긴 시간으로
 * 환산되어 상한에 **일찍** 걸린다. 비용 보호가 목적이므로 과소추정보다 과대추정이 낫다.
 */
const ASSUMED_KBPS = 32;

/** 초 → 과금 분. Whisper 는 올림 과금이므로 여기서도 올린다(최소 1분). */
export function billedMinutes(input: SttInput): number {
  const sec =
    typeof input.durationSec === 'number' && input.durationSec > 0
      ? input.durationSec
      : (input.audio.byteLength * 8) / (ASSUMED_KBPS * 1000);
  return Math.max(1, Math.ceil(sec / 60));
}

/**
 * 유료 SttProvider 를 감싸 일 전사 상한을 강제한다(B008 확장).
 *
 * 왜 필요한가: 상담 녹음 전사는 **유료 외부 API**(OpenAI Whisper)인데 상한이 없었다.
 * LLM·미디어에는 상한을 걸어 두고 STT 만 열려 있으면, 비용 보호에 구멍이 남는다.
 * 비용이 0인 mock 어댑터는 감싸지 않는다(MediaModule 참조).
 *
 * **상한이 두 축인 이유**: Whisper 과금은 호출 수가 아니라 **오디오 길이(분)** 에 비례한다.
 * 호출 수만 세면 상한이 길이에 무감각해진다 — 30초 60건과 90분 60건이 같은 60 으로
 * 잡히지만 청구서는 180배 차이다. 상담 녹음은 길이 편차가 큰 종류의 입력이라 이 차이가
 * 이론이 아니다. 그래서 **호출 수(남용 방지)** 와 **분(비용 상한)** 을 함께 센다.
 * 분 카운터는 호출 **전에** 더한다 — 사후에 더하면 넘긴 만큼은 이미 과금된 뒤다.
 *
 * **fail-open 인 이유**: 전사는 상담 종료 후 비동기 후처리다. 카운터 장애로 막으면
 * 리포트 파이프라인이 멈추는데, 그 손해가 하루치 전사 비용보다 크다.
 * (LLM 은 사용자 요청 경로라 fail-closed — 방향이 다른 이유가 여기 있다.)
 */
export class QuotaSttProvider implements SttProvider {
  private readonly logger = new Logger('Stt:quota');

  constructor(
    private readonly inner: SttProvider,
    private readonly quota: UsageQuota,
    /** 일 전사 호출 상한. 0 이하면 무제한 */
    private readonly dailyLimit: number,
    /** 일 전사 **분** 상한. 0 이하면 무제한 */
    private readonly dailyMinuteLimit = 0,
  ) {}

  async transcribe(input: SttInput): Promise<SttResult> {
    const minutes = billedMinutes(input);
    if (typeof input.durationSec !== 'number' || input.durationSec <= 0) {
      // 길이를 모르면 바이트로 추정한다. 추정이 잦으면 호출측이 durationSec 을 안 넘기고
      // 있다는 뜻이므로 눈에 띄게 남긴다.
      this.logger.warn(
        `durationSec 미지정 — ${input.audio.byteLength}B 를 ${ASSUMED_KBPS}kbps 로 ${minutes}분 추정`,
      );
    }
    try {
      await this.quota.consume('transcribe', this.dailyLimit);
      await this.quota.consumeUnits(
        'transcribe_minutes',
        minutes,
        this.dailyMinuteLimit,
        '분',
      );
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
