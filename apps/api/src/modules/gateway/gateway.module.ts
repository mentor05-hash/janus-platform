import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

/**
 * 관문(Gateway) 모듈 — W2 D5: 관문 홈 자유서술 해석(LLM 훅).
 * LlmProvider(Claude) 경유 + 입력 마스킹 + 일 호출 상한 + 규칙 폴백.
 */
@Module({
  imports: [LlmModule],
  controllers: [GatewayController],
  providers: [GatewayService],
})
export class GatewayModule {}
