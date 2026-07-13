import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider } from '../llm/llm.types';
import {
  classifyGateway,
  GatewayInterpretation,
  maskSensitive,
  normalizeLlmResult,
  withinDailyBudget,
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

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
    private readonly config: ConfigService,
  ) {}

  async interpret(qRaw: string): Promise<GatewayInterpretResponse> {
    const { masked, hits } = maskSensitive(qRaw);
    const rules = classifyGateway(masked);

    // 일 호출 상한(비용 상한) — KST 기준 일자 키, 고정 24h TTL.
    const limit = Number(this.config.get<string>('GATEWAY_LLM_DAILY_LIMIT') ?? '200');
    let count = Number.NaN;
    try {
      const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST
      count = await this.cache.incr(`llm:gateway:${day}`, 86400);
    } catch {
      // 캐시 장애 시 상한 판단 불가 → 비용 보호 우선, LLM 건너뜀
    }
    if (!withinDailyBudget(count, limit)) {
      if (count > limit) this.logger.warn(`관문 LLM 일 상한 도달(${count}/${limit}) — 규칙 폴백`);
      return { ...rules, source: 'rules', reason: 'daily_cap', masked: hits > 0 };
    }

    try {
      const raw = await this.llm.interpretGateway({ text: masked });
      const normalized = normalizeLlmResult(raw as Partial<GatewayInterpretation>);
      return { ...normalized, source: 'llm', masked: hits > 0 };
    } catch (e) {
      const msg = (e as Error).message ?? '';
      const unconfigured = msg.includes('구성되지') || msg.includes('지원하지');
      if (!unconfigured) this.logger.warn(`관문 LLM 해석 실패 — 규칙 폴백: ${msg}`);
      return { ...rules, source: 'rules', reason: unconfigured ? 'unconfigured' : 'llm_error', masked: hits > 0 };
    }
  }
}
