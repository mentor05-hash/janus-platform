import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { SchoolRecordGuardService } from './school-record-guard.service';
import { SchoolRecordEventService } from './school-record-event.service';
import { SchoolRecordAppealService } from './school-record-appeal.service';
import { SchoolRecordGuardPolicyService } from './school-record-guard-policy.service';
import { SchoolRecordAdminController } from './school-record-admin.controller';
import { SchoolRecordAppealController } from './school-record-appeal.controller';

/**
 * 생기부 가드 모듈 (지시서 §6).
 * - 판정: SchoolRecordGuardService(공용 모듈 어댑터, LLM 비전 위임).
 * - 스텝3: 차단 통계(EventService)·이의 큐(AppealService)·컨설팅 업로드 토글+스케줄러(PolicyService)
 *   + 관리자/이의 컨트롤러. Prisma·Cache·Audit 는 전역 모듈이라 별도 import 불필요.
 */
@Module({
  imports: [LlmModule],
  controllers: [SchoolRecordAdminController, SchoolRecordAppealController],
  providers: [
    SchoolRecordGuardService,
    SchoolRecordEventService,
    SchoolRecordAppealService,
    SchoolRecordGuardPolicyService,
  ],
  exports: [
    SchoolRecordGuardService,
    SchoolRecordEventService,
    SchoolRecordGuardPolicyService,
  ],
})
export class SchoolRecordGuardModule {}
