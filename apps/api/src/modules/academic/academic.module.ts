import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';

@Module({
  imports: [NotificationModule],
  controllers: [AcademicController],
  providers: [AcademicService],
  exports: [AcademicService],
})
export class AcademicModule {}
