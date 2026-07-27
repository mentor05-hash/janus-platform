import { Module } from '@nestjs/common';
import {
  GuardianConsentController,
  StudentShareConsentController,
} from './guardian-consent.controller';
import { GuardianConsentService } from './guardian-consent.service';
import { IdentityVerifyProvider } from './identity-verify.provider';

/**
 * 본부 결정 ① 학부모 동의·본인확인. 미성년 자녀 데이터 전달 게이트 도메인.
 * consult-report 등 소비 모듈이 GuardianConsentService.consentedGuardianIds 를 게이트로 참조.
 */
@Module({
  controllers: [GuardianConsentController, StudentShareConsentController],
  providers: [GuardianConsentService, IdentityVerifyProvider],
  exports: [GuardianConsentService],
})
export class GuardianConsentModule {}
