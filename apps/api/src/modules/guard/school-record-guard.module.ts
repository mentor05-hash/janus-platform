import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { SchoolRecordGuardService } from './school-record-guard.service';

/**
 * 생기부 가드 모듈 (지시서 §6) — 업로드 경로가 공용으로 주입받는 판정 서비스.
 * LlmModule 을 들여 비전 분류(§5 3단, 정책 llmCheck 시)를 LLM_PROVIDER 로 위임한다.
 */
@Module({
  imports: [LlmModule],
  providers: [SchoolRecordGuardService],
  exports: [SchoolRecordGuardService],
})
export class SchoolRecordGuardModule {}
