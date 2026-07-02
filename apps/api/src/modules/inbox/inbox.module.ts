import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

/** 선생님 인박스 집계 모듈(§선생님 모바일 2단계). */
@Module({
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
