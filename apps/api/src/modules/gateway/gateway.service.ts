import { Inject, Injectable, Logger } from '@nestjs/common';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider } from '../llm/llm.types';
import {
  classifyGateway,
  GatewayInterpretation,
  maskSensitive,
  normalizeLlmResult,
  classifyGatewayLlmFailure,
} from './domain/interpret';

export interface GatewayInterpretResponse extends GatewayInterpretation {
  source: 'llm' | 'rules';
  reason?: 'daily_cap' | 'llm_error' | 'unconfigured';
  masked: boolean; // 민감정보 마스킹 발생 여부(클라이언트 고지용)
}

/**
 * 관문 해석 유스케이스(W2 D5) — 자유서술 → 의도·커리큘럼 카드.
 * 파이프: 마스킹 → 일 상한 확인(CacheProvider 카운터) → LlmProvider(Claude) → 규칙 폴백.
 * 폴백 불변식: 어떤 실패에서도 규칙 분류 결과를 돌려준다(막다른 화면 금지).
 */
@Injectable()
export class GatewayService {
  private readonly logger = new Logger('Gateway');

  // 상한 카운터를 어댑터로 옮기면서 cache·config 주입이 필요 없어졌다 — 죽은 의존은 남기지 않는다.
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  async interpret(qRaw: string): Promise<GatewayInterpretResponse> {
    const { masked, hits } = maskSensitive(qRaw);
    const rules = classifyGateway(masked);

    // 일 호출 상한은 **어댑터가 단일 소스**다(QuotaLlmProvider, 용도 `gateway`).
    // 예전에는 여기서 `llm:gateway:{day}` 카운터를 따로 돌렸는데, 어댑터 상한이 생기면서
    // 같은 경로에 상한이 둘이 됐다 — 실효값은 둘 중 작은 쪽인데 운영자는 `GATEWAY_LLM_DAILY_LIMIT`
    // 만 보고 그 값이 적용된다고 믿게 된다(광고와 실제가 갈라지는 B222 와 같은 유형).
    // 카운터를 어댑터 하나로 모으고, 여기서는 **상한 도달을 오류와 구분해** 규칙 폴백만 한다.
    // (구 ENV `GATEWAY_LLM_DAILY_LIMIT` 는 llm.limits.ts 가 계속 존중한다.)
    try {
      const raw = await this.llm.interpretGateway({ text: masked });
      const normalized = normalizeLlmResult(
        raw as Partial<GatewayInterpretation>,
      );
      return { ...normalized, source: 'llm', masked: hits > 0 };
    } catch (e) {
      const reason = classifyGatewayLlmFailure(e);
      if (reason === 'daily_cap') {
        this.logger.warn('관문 LLM 일 상한 도달 — 규칙 폴백');
      } else if (reason !== 'unconfigured') {
        this.logger.warn(
          `관문 LLM 해석 실패 — 규칙 폴백: ${(e as Error).message ?? ''}`,
        );
      }
      return { ...rules, source: 'rules', reason, masked: hits > 0 };
    }
  }
}
