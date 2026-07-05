import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ConsultingController } from './consulting.controller';
import { ConsultingService } from './consulting.service';

// 대입 컨설팅 신청 접수. StorageModule에서 FilesService 주입(자료 업로드).
@Module({
  imports: [StorageModule],
  controllers: [ConsultingController],
  providers: [ConsultingService],
  exports: [ConsultingService],
})
export class ConsultingModule {}
