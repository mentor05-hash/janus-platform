import { Module } from '@nestjs/common';
import { GuardianReportController } from './guardian-report.controller';
import { GuardianReportService } from './guardian-report.service';

/** 학부모 주간 통합 리포트(W8·사업기획서 §3) — 자녀 성적·출석·상담·Q&A 요약. */
@Module({
  controllers: [GuardianReportController],
  providers: [GuardianReportService],
})
export class GuardianReportModule {}
