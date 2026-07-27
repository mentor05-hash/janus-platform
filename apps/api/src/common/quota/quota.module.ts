import { Module } from '@nestjs/common';
import { LlmModule } from '../../modules/llm/llm.module';
import { MediaModule } from '../../modules/media/media.module';
import { QuotaUsageController } from './quota-usage.controller';

/**
 * 유료 외부 API 사용량 조회 (CacheModule 과 같은 common/ 인프라 계층).
 * 상한 자체는 각 어댑터 모듈이 강제하고, 여기서는 관리자 가시성만 담당한다.
 */
@Module({
  imports: [LlmModule, MediaModule],
  controllers: [QuotaUsageController],
})
export class QuotaModule {}
