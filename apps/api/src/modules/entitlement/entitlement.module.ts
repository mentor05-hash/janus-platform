import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { EntitlementController } from './entitlement.controller';
import { EntitlementService } from './entitlement.service';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';

/** 상품 권한(entitlement) — 유료 상품 → 서비스 해제 행 부여. SSO·배치표 게이트가 이를 조회. */
@Module({
  imports: [AuditModule, NotificationModule],
  controllers: [EntitlementController, RedemptionController],
  providers: [EntitlementService, RedemptionService],
  exports: [EntitlementService],
})
export class EntitlementModule {}
