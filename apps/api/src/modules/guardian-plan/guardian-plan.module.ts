import { Module } from '@nestjs/common';
import { GuardianConsentModule } from '../guardian-consent/guardian-consent.module';
import { NotificationModule } from '../notification/notification.module';
import { GuardianPlanController, StudentPlanProposalController } from './guardian-plan.controller';
import { GuardianPlanService } from './guardian-plan.service';

/**
 * 학부모 계획 트랙(O106) — 학부모 자기 공간의 계획 + 학생에게 제안(수락/거절).
 * 연령 게이트는 GuardianConsentService(O105)를 재사용한다.
 */
@Module({
  imports: [GuardianConsentModule, NotificationModule],
  controllers: [GuardianPlanController, StudentPlanProposalController],
  providers: [GuardianPlanService],
  exports: [GuardianPlanService],
})
export class GuardianPlanModule {}
