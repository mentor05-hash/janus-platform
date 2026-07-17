import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { PlacementHubController } from './placement-hub.controller';
import { PlacementHubService } from './placement-hub.service';

/** 배치표 허브 — JANUS_DATA_DIR 런타임 서빙(저작권 데이터 repo 무반입 원칙). */
@Module({
  imports: [EntitlementModule, AuditModule],
  controllers: [PlacementHubController],
  providers: [PlacementHubService],
})
export class PlacementHubModule {}
