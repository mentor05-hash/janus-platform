import { Module } from '@nestjs/common';
import { ConsultationController } from './consultation.controller';
import { ConsultationService } from './consultation.service';

/**
 * Consultation 바운디드 컨텍스트 (CLAUDE.md §3).
 * 상담 기록(임시/최종·공개정책 §5-5). booking.complete 가 final 존재를 요구.
 */
@Module({
  controllers: [ConsultationController],
  providers: [ConsultationService],
  exports: [ConsultationService],
})
export class ConsultationModule {}
