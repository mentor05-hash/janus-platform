import { Module } from '@nestjs/common';
import { RoomsBridgeModule } from '../rooms-bridge/rooms-bridge.module';
import { ClassroomController } from './classroom.controller';
import { ClassroomService } from './classroom.service';

// 온라인 강의실. RoomsBridge(RoomsProvider)로 룸 서비스에 lecture 룸을 프로비저닝.
@Module({
  imports: [RoomsBridgeModule],
  controllers: [ClassroomController],
  providers: [ClassroomService],
  exports: [ClassroomService],
})
export class ClassroomModule {}
