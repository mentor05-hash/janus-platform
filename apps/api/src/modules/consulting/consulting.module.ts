import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { LlmModule } from '../llm/llm.module';
import { NotificationModule } from '../notification/notification.module';
import { SchoolRecordGuardModule } from '../guard/school-record-guard.module';
import { ConsultingController } from './consulting.controller';
import { ConsultingService } from './consulting.service';
import { PAYMENT_PROVIDER } from './payment/payment.types';
import { ManualPaymentProvider } from './payment/manual-payment.provider';

// 대입 컨설팅 신청 접수. StorageModule(자료)·LlmModule(분석)·NotificationModule(알림) 주입.
// 결제는 PaymentProvider 추상화 — 현재 ManualProvider(수동/모의), 실 PG는 교체.
// SchoolRecordGuardModule: 신규 생기부 업로드 토글(스텝3)·차단 통계 기록 주입.
@Module({
  imports: [StorageModule, LlmModule, NotificationModule, SchoolRecordGuardModule],
  controllers: [ConsultingController],
  providers: [ConsultingService, { provide: PAYMENT_PROVIDER, useClass: ManualPaymentProvider }],
  exports: [ConsultingService],
})
export class ConsultingModule {}
