import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';

/** 크로스서비스 SSO(O42·W3) — HS256+epoch, sso_service 레지스트리, verify 위임. */
@Module({
  imports: [AuditModule, EntitlementModule],
  controllers: [SsoController],
  providers: [SsoService],
  exports: [SsoService],
})
export class SsoModule {}
