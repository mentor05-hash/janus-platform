import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ConsultingController } from './consulting.controller';
import { ConsultingService } from './consulting.service';
import { PAYMENT_PROVIDER } from './payment/payment.types';
import { ManualPaymentProvider } from './payment/manual-payment.provider';

// 대입 컨설팅 신청 접수. StorageModule에서 FilesService 주입(자료 저장).
// 결제는 PaymentProvider 추상화 — 현재 ManualProvider(수동/모의), 실 PG는 교체.
@Module({
  imports: [StorageModule],
  controllers: [ConsultingController],
  providers: [ConsultingService, { provide: PAYMENT_PROVIDER, useClass: ManualPaymentProvider }],
  exports: [ConsultingService],
})
export class ConsultingModule {}
