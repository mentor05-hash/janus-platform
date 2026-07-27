import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { RoomsBridgeController } from './rooms-bridge.controller';
import { RoomsBridgeService } from './rooms-bridge.service';
import { RoomsDemoController } from './rooms-demo.controller';
import { RoomsEventsController } from './rooms-events.controller';
import { RoomsProvider } from './rooms.provider';

/** 예약 ↔ 실시간 룸 서비스 브리지(플래그 기반 점진 이관). RealtimeService 재사용. */
@Module({
  imports: [RealtimeModule],
  controllers: [RoomsBridgeController, RoomsDemoController, RoomsEventsController],
  providers: [RoomsBridgeService, RoomsProvider],
  exports: [RoomsProvider],
})
export class RoomsBridgeModule {}
