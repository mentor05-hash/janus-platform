import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';

/** 크로스서비스 SSO — 플랫폼 로그인 세션을 연계 서비스(학습 플래너 등)로 연결. */
@Module({
  imports: [AuditModule],
  controllers: [SsoController],
  providers: [SsoService],
  exports: [SsoService],
})
export class SsoModule {}
